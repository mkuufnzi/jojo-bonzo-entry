import prisma from '../lib/prisma';
import { logger } from '../lib/logger';
import { brandingService } from './branding.service';
import { webhookService } from './webhook.service';
import { ServiceSlugs } from '../types/service.types';
import { pdfService } from './pdf.service';
import { storageService } from './storage.service';
import { n8nPayloadFactory, ServiceContext } from './n8n/n8n-payload.factory';
import { linkService } from './link.service';
import axios from 'axios';
import { v4 as uuid } from 'uuid';
import { createAuditLog } from '../middleware/audit.middleware';
import { config } from '../config/env';
import { RevenueService } from '../modules/transactional/revenue/revenue.service';
import type {
  TriggerConfig,
  ActionConfig,
  WebhookPayload,
  WorkflowExecutionResult,
} from '../types/workflow.types';
import type { Workflow, User, Business, Subscription, App, BrandingProfile } from '@prisma/client';

const revenueService = new RevenueService();

// ────────────────────────────────────────────────────────────────
// Internal Interfaces (private to this module)
// ────────────────────────────────────────────────────────────────

/** Shape returned by Prisma when fetching a user with business/apps/subscription */
interface UserWithRelations extends User {
  business: Business | null;
  apps: App[];
  subscription: Subscription | null;
}

/** Response shape for local PDF generation path */
interface LocalEngineResult {
  source: 'local_engine';
  statusCode: 200;
  duration: number;
  artifacts: { pdfUrl: string; documentId: string };
}

/** Response shape for n8n dispatch path */
interface N8nDispatchResult {
  source: 'n8n';
  statusCode: 202;
  data: { message: string };
  artifacts: { documentId: string | undefined; status: 'processing' };
}

/** Union result for executeAction */
type ActionResult =
  | LocalEngineResult
  | N8nDispatchResult
  | { message: string; config?: ActionConfig }
  | { success: false; error: string };

/** Input shape for createWorkflow */
interface CreateWorkflowInput {
  name: string;
  description?: string;
  isActive?: boolean;
  triggerType: string;
  triggerConfig?: TriggerConfig;
  actionConfig?: ActionConfig;
}

// ────────────────────────────────────────────────────────────────
// WorkflowService
// ────────────────────────────────────────────────────────────────

/**
 * WorkflowService is the central automation engine for Floovioo.
 *
 * Responsibilities:
 * - Resolves business context from incoming webhook events
 * - Filters events against active workflow trigger configurations
 * - Dispatches matched actions to either the local PDF engine or n8n
 * - Records execution logs and audit trails for every dispatch
 *
 * Race Condition Notes:
 * - n8n dispatch is fire-and-forget (intentional — the `.catch()` handler
 *   updates the ProcessedDocument record on failure independently)
 * - ProcessedDocument is created BEFORE dispatch so we always have a tracking
 *   record, even if the n8n call never responds
 */
export class WorkflowService {

  // ── CRUD ────────────────────────────────────────────────────

  /**
   * List all workflows for a user's business, ordered newest first.
   * @param userId - Authenticated user ID
   * @returns Array of Workflow records (empty if user has no business)
   */
  async listWorkflows(userId: string): Promise<Workflow[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!user?.businessId) return [];

    return prisma.workflow.findMany({
      where: { businessId: user.businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Create a new workflow for the user's business.
   * @param userId - Authenticated user ID
   * @param data   - Workflow definition (name, trigger, action config)
   * @throws Error if the user has no associated business
   */
  async createWorkflow(userId: string, data: CreateWorkflowInput): Promise<Workflow> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!user?.businessId) throw new Error('Business account required');

    return prisma.workflow.create({
      data: {
        businessId: user.businessId,
        name: data.name,
        description: data.description,
        isActive: data.isActive !== false,
        triggerType: data.triggerType,
        triggerConfig: (data.triggerConfig ?? {}) as any,
        actionConfig: (data.actionConfig ?? {}) as any,
      },
    });
  }

  /**
   * Delete a workflow, verifying business ownership first.
   * @param userId - Authenticated user ID
   * @param id     - Workflow ID to delete
   * @throws Error if the user lacks business context or workflow not found
   */
  async deleteWorkflow(userId: string, id: string): Promise<Workflow> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!user?.businessId) throw new Error('Business account required');

    const wf = await prisma.workflow.findFirst({
      where: { id, businessId: user.businessId },
    });
    if (!wf) throw new Error('Not found');

    return prisma.workflow.delete({ where: { id } });
  }

  // ── WEBHOOK PROCESSING ─────────────────────────────────────

  /**
   * Core webhook processor — matches incoming events against active
   * workflows and sequentially executes each matched action.
   *
   * @param userId         - ID of the user who owns the webhook endpoint
   * @param payload        - Normalized incoming event data
   * @param resolvedAppId  - Pre-resolved App ID (optional, for system calls)
   * @returns Array of execution results per matched workflow
   */
  async processWebhook(
    userId: string,
    payload: WebhookPayload,
    resolvedAppId?: string
  ): Promise<WorkflowExecutionResult[]> {
    logger.info(
      { userId, type: payload.normalizedEventType || payload.type },
      'Processing Webhook Event'
    );

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!user?.businessId) {
      logger.warn({ userId }, 'Webhook received for user without business');
      return [];
    }

    const workflows = await prisma.workflow.findMany({
      where: { businessId: user.businessId, isActive: true, triggerType: 'webhook' },
    });

    logger.debug(
      { userId, businessId: user.businessId, count: workflows.length },
      '[WorkflowService] Active webhook workflows found'
    );

    const results: WorkflowExecutionResult[] = [];

    for (const wf of workflows) {
      if (!this.matchesTrigger(wf.triggerConfig as TriggerConfig, payload)) {
        continue;
      }

      const startTime = Date.now();

      try {
        const result = await this.executeAction(
          wf.id,
          wf.actionConfig as unknown as ActionConfig,
          payload,
          userId,
          user.businessId,
          resolvedAppId
        );

        const duration = Date.now() - startTime;
        results.push({ workflowId: wf.id, status: 'success', result });

        await prisma.workflowExecutionLog.create({
          data: {
            workflowId: wf.id,
            status: 'success',
            inputData: payload as any,
            outputData: result as any,
            duration,
          },
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ workflowId: wf.id, error: message }, 'Workflow Execution Failed');
        results.push({ workflowId: wf.id, status: 'failed', error: message });

        await prisma.workflowExecutionLog.create({
          data: {
            workflowId: wf.id,
            status: 'failed',
            inputData: payload as any,
            error: message,
          },
        });
      }
    }

    return results;
  }

  /**
   * Convenience: process a webhook using a businessId (system-initiated).
   * Resolves the first user for that business and delegates to processWebhook.
   *
   * @param businessId - Target business ID
   * @param payload    - Normalized webhook payload
   */
  async processWebhookForBusiness(
    businessId: string,
    payload: WebhookPayload
  ): Promise<WorkflowExecutionResult[]> {
    const user = await prisma.user.findFirst({ where: { businessId } });
    if (!user) return [];
    return this.processWebhook(user.id, payload);
  }

  // ── TRIGGER MATCHING ───────────────────────────────────────

  /**
   * Determines whether a payload matches a workflow's trigger config.
   * Supports wildcard event matching and provider filtering.
   *
   * @param triggerCfg - Parsed trigger configuration from the workflow
   * @param payload    - Incoming webhook payload
   * @returns true if the payload satisfies all trigger filters
   */
  private matchesTrigger(triggerCfg: TriggerConfig | null, payload: WebhookPayload): boolean {
    if (!triggerCfg) return true; // No filter = match everything

    // Event matching (supports wildcard patterns like "stripe.invoice.*")
    if (triggerCfg.event) {
      const eventToMatch = payload.normalizedEventType || payload.type || '';
      const pattern = triggerCfg.event.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`);
      let matched = regex.test(eventToMatch);

      // Fuzzy fallback: match base segments (e.g. "invoice" == "invoice")
      if (!matched) {
        const triggerBase = triggerCfg.event.split('.')[0];
        const eventBase = (payload.type || '').split('.')[0];
        if (triggerBase === eventBase) {
          matched = true;
          logger.info(
            { trigger: triggerCfg.event, event: payload.type },
            '🤖 [WorkflowService] Fuzzy Trigger Match Applied'
          );
        }
      }

      if (!matched) return false;
    }

    // Provider matching (exact match required)
    if (payload.provider && triggerCfg.provider && payload.provider !== triggerCfg.provider) {
      return false;
    }

    return true;
  }

  // ── ACTION EXECUTION ───────────────────────────────────────

  /**
   * Executes a single workflow action. This is the heart of the engine.
   *
   * Steps:
   * 1. Resolve the n8n endpoint for the action type
   * 2. Resolve user/business context and branding profile
   * 3. Enrich with smart upsell content (for transactional branding)
   * 4. Optionally render HTML locally via TemplateGenerator
   * 5. Attempt local PDF generation if conditions are met
   * 6. Otherwise, dispatch to n8n asynchronously
   *
   * Race Condition Mitigation:
   * - ProcessedDocument is created BEFORE the n8n POST fires
   * - The `.catch()` on the axios call captures `processedDoc.id` by closure
   *   at creation time, avoiding stale reference issues
   *
   * @param workflowId    - ID of the triggering workflow
   * @param actionConfig  - Action definition (type, profileId, etc.)
   * @param payload       - Normalized trigger payload
   * @param userId        - Initiating user ID (or 'system')
   * @param businessId    - Pre-resolved business ID (optional)
   * @param resolvedAppId - Pre-resolved App ID (optional)
   * @returns ActionResult describing the outcome
   */
  async executeAction(
    workflowId: string,
    actionConfig: ActionConfig,
    payload: WebhookPayload,
    userId: string,
    businessId?: string,
    resolvedAppId?: string
  ): Promise<ActionResult> {
    if (!actionConfig) return { message: 'No action config' };

    const type = actionConfig.type || actionConfig.steps?.[0]?.type;
    if (!type) return { message: 'No action type resolved', config: actionConfig };

    const supportedTypes = [
      'apply_branding',
      'brand_and_email',
      'email',
      'recovery_email',
      'generate_local_template',
    ] as const;

    if (!supportedTypes.includes(type as any)) {
      return { message: 'Unknown action type', config: actionConfig };
    }

    try {
      // ── 1. Resolve n8n Endpoint ─────────────────────────
      let serviceSlug: string = ServiceSlugs.TRANSACTIONAL_BRANDING;
      let webhookAction = 'apply_branding';

      if (type === 'email') webhookAction = 'email';
      if (type === 'generate_local_template') webhookAction = 'deliver_document';
      if (type === 'recovery_email') {
        serviceSlug = ServiceSlugs.DEBT_COLLECTION;
        webhookAction = 'recovery_action';
      }

      const webhookUrl = await webhookService.getEndpoint(serviceSlug, webhookAction);
      logger.info({ serviceSlug, webhookAction, webhookUrl }, '🔗 [WorkflowService] Resolved n8n endpoint');

      // ── 2. Resolve User/Business Context ────────────────
      const isSystem = userId === 'system';

      const userDetails: UserWithRelations | null = !isSystem
        ? await prisma.user.findUnique({
            where: { id: userId },
            include: {
              business: true,
              apps: { where: { name: 'System Automation' } },
              subscription: true,
            },
          }) as UserWithRelations | null
        : null;

      let effectiveBusinessId: string | undefined = businessId || userDetails?.business?.id || undefined;
      let effectiveUserId = userId;
      let planId: string | undefined = userDetails?.subscription?.planId || undefined;

      // For system-initiated workflows, resolve the business owner
      if (isSystem && effectiveBusinessId) {
        const businessOwner = await prisma.user.findFirst({
          where: { businessId: effectiveBusinessId },
          orderBy: { createdAt: 'asc' },
          include: { business: true, subscription: true },
        });
        if (businessOwner) {
          effectiveUserId = businessOwner.id;
          planId = businessOwner.subscription?.planId || undefined;
        }
      }

      // ── 3. Resolve App Context ──────────────────────────
      let appId: string | undefined = resolvedAppId || userDetails?.apps[0]?.id || undefined;

      if (!appId && effectiveBusinessId) {
        const { resolveSystemApp } = await import('../services/app-resolution.service');
        appId = await resolveSystemApp(effectiveBusinessId);
        logger.info({ businessId: effectiveBusinessId, appId }, 'Resolved System App for ERP workflows');
      }

      if (!appId) {
        throw new Error(`Unable to resolve appId for userId: ${userId}, businessId: ${businessId}`);
      }

      // ── 4. Resolve Branding Profile ─────────────────────
      let brandProfile: BrandingProfile | null = null;

      if (actionConfig.profileId && !isSystem) {
        brandProfile = await brandingService.getProfile(userId);
      } else if (effectiveBusinessId) {
        brandProfile = await prisma.brandingProfile.findFirst({
          where: { businessId: effectiveBusinessId, isDefault: true },
          include: { business: true },
        });
      }

      // ── 5. Build Service Context ────────────────────────
      const flooviooId = `req_${workflowId.substring(0, 8)}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      const context: ServiceContext = {
        serviceId: serviceSlug,
        serviceTenantId: effectiveBusinessId || userDetails?.business?.id || 'unknown',
        appId: appId || 'unknown',
        requestId: flooviooId,
        brandId: brandProfile?.id,
        businessId: effectiveBusinessId,
        planId,
      };

      // ── 6. Revenue Enrichment (Smart Upsells) ───────────
      let smartContent: Record<string, unknown> = {};
      if (serviceSlug === ServiceSlugs.TRANSACTIONAL_BRANDING) {
        const documentItems: string[] = payload.items || [];
        smartContent = await revenueService.getEnrichedContext(
          effectiveBusinessId || 'unknown',
          documentItems
        );
        logger.info({
          businessId: effectiveBusinessId,
          hasOffers: (smartContent as any)?.has_offers,
          offersCount: (smartContent as any)?.offers?.length || 0
        }, '📦 [WorkflowService] Smart Content generated from RevenueService');
      }

      // ── 7. Local Template Rendering (optional) ──────────
      // ── 7. Prepare Interactive Links & Pre-generate Tracking ID ─
      // Generate ID early so it can be embedded in links within the templates
      const trackedDocId = uuid();
      const portalToken = linkService.generateToken({ d: trackedDocId, a: 'view' });
      const portalUrl = `${config.APP_URL}/p/${portalToken}/view`;
      const interactiveLink = `${config.APP_URL}/i/${portalToken}`;
      
      // ── 8. Local Template Rendering (optional) ──────────
      let compiledHtml: string | null = null;
      
      const isBrandingAction = type === 'generate_local_template' || type === 'apply_branding' || type === 'brand_and_email';

      if (isBrandingAction) {
        const { templateGenerator } = require('./template-generator.service');
        const docType = payload.resourceType || payload.type?.split('.')[0] || 'invoice';

        try {
          // Use the enriched smartContent and pre-generated documentId
          const localPayload = {
            ...payload,
            documentId: trackedDocId, // Inject the ID for LinkService helpers in EJS
            portal_url: portalUrl,
            interactive_link: interactiveLink,
            smartContent: smartContent || {}
          };

          compiledHtml = await templateGenerator.generateHtml(
            effectiveUserId,
            effectiveBusinessId || 'unknown',
            docType,
            localPayload
          );
          logger.info({ workflowId, type, trackedDocId }, '✨ [WorkflowService] Local HTML generated with interactive links');
        } catch (err: any) {
          logger.warn({ err: err.message }, '⚠️ [WorkflowService] Local template generation failed, falling back to pure n8n');
        }
      }

      // ── 8. Local Fast-Path (bypass n8n for speed) ───────
      const isTransactional = type === 'apply_branding' || type === 'brand_and_email';
      const callbackUrl = isTransactional 
        ? `${config.APP_URL}/api/callbacks/n8n/transactional-complete`
        : `${config.APP_URL}/api/callbacks/recommendations/sync`;
      const useLocalGeneration =
        type === 'apply_branding' &&
        compiledHtml &&
        (actionConfig.skipN8n || process.env.PREFER_LOCAL_GENERATION === 'true');

      if (useLocalGeneration) {
        const localResult = await this.executeLocalFastPath(
          compiledHtml!,
          effectiveUserId,
          effectiveBusinessId,
          userDetails,
          appId,
          flooviooId,
          workflowId,
          type,
          payload
        );
        if (localResult) return localResult;
        // If local fast-path fails, we fall through to n8n dispatch
      }

      // ── 9. Build n8n Envelope ───────────────────────────
      const envelope = n8nPayloadFactory.createWorkflowExecutionPayload(
        workflowId,
        type,
        payload,
        actionConfig,
        brandProfile,
        effectiveUserId,
        context,
        payload.normalizedEventType,
        smartContent,
        callbackUrl
      );

      if (compiledHtml) {
        (envelope as any).html = compiledHtml;
      }

      // Explicitly add portal links to the envelope for n8n emails
      (envelope as any).portal_url = portalUrl;
      (envelope as any).interactive_link = interactiveLink;
      (envelope as any).document_id = trackedDocId;

      if (type === 'recovery_email') {
        (envelope as any).recovery = {
          actionId: payload.actionId || null,
          sessionId: payload.sessionId || null,
          actionIds: payload.actionIds || null,
          sessionIds: payload.sessionIds || null,
          batchMode: payload.batchMode || false,
          callbackUrl: `${config.APP_URL}/api/callbacks/recovery/action`,
        };
      }

      // ── 10. Create Tracking Record BEFORE dispatch ──────
      // This ensures we always have a ProcessedDocument even if n8n never responds.
      const processedDoc = await prisma.processedDocument.create({
        data: {
          id: trackedDocId,
          businessId: effectiveBusinessId || userDetails?.business?.id || 'unknown',
          appId: appId || 'unknown',
          userId: effectiveUserId,
          provider: payload.provider || 'unknown',
          resourceType: payload.resourceType || payload.type?.split('.')[0] || 'unknown',
          resourceId: payload.entityId || payload.id || 'unknown',
          eventType: payload.normalizedEventType || 'unknown',
          status: 'processing',
          flooviooId,
          rawPayload: envelope as any,
          ...(compiledHtml ? { snapshotHtml: compiledHtml } : {}),
          createdAt: new Date(),
        },
      });

      if (compiledHtml) {
        logger.info({ trackedDocId }, '📸 [WorkflowService] HTML snapshot saved to ProcessedDocument');
      }

      await createAuditLog({
        userId: effectiveUserId,
        appId: appId || 'unknown',
        businessId: effectiveBusinessId || userDetails?.business?.id,
        actionType: 'n8n_dispatch',
        serviceId: serviceSlug,
        eventType: payload.normalizedEventType,
        requestPayload: envelope,
        requestId: flooviooId,
        success: true,
      });

      // ── 11. Fire-and-Forget n8n Dispatch ────────────────
      // Intentionally not awaited. The `.catch()` updates the document on failure.
      logger.info({ workflowId, webhookUrl, async: true }, '🚀 [WorkflowService] Dispatching to n8n (Async)');

      axios
        .post(webhookUrl, envelope, {
          timeout: 15000,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Floovioo-Engine/1.0',
            'ngrok-skip-browser-warning': 'true',
            ...(config.AI_WEBHOOK_SECRET
              ? { 'X-Webhook-Secret': config.AI_WEBHOOK_SECRET.trim() }
              : {}),
          },
        })
        .then(async (response) => {
          logger.info(
            { docId: trackedDocId, status: response.status },
            '✅ [WorkflowService] n8n Dispatch Successful'
          );

          // If we already have a local HTML snapshot, mark as completed immediately.
          // The n8n callback can still update with a PDF URL later via CallbackController.
          if (compiledHtml) {
            await prisma.processedDocument
              .update({
                where: { id: trackedDocId },
                data: {
                  status: 'completed',
                  processingTimeMs: Date.now() - new Date(processedDoc.createdAt).getTime(),
                  updatedAt: new Date(),
                },
              })
              .catch((e: Error) => logger.error({ err: e.message }, 'Failed to mark document completed after dispatch'));
            logger.info({ docId: trackedDocId }, '✅ [WorkflowService] Document marked completed (local snapshot ready)');
          }
        })
        .catch(async (err: Error) => {
          logger.error(
            { docId: trackedDocId, err: err.message },
            '❌ [WorkflowService] n8n Dispatch Failed'
          );
          await prisma.processedDocument
            .update({
              where: { id: trackedDocId },
              data: { status: 'failed', errorMessage: err.message, updatedAt: new Date() },
            })
            .catch((e: Error) => logger.error({ err: e.message }, 'Failed to update ProcessedDocument status'));
        });

      return {
        source: 'n8n',
        statusCode: 202,
        data: { message: 'Document processing initiated' },
        artifacts: { documentId: trackedDocId, status: 'processing' },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { workflowId, action: actionConfig?.type, err: message },
        '❌ [WorkflowService] Action Execution Failed'
      );
      return { success: false, error: message };
    }
  }

  // ── LOCAL FAST PATH ────────────────────────────────────────

  /**
   * Generates a branded PDF locally (bypassing n8n) for speed.
   * Creates the ProcessedDocument and UsageLog records atomically.
   *
   * @returns LocalEngineResult on success, or null if generation fails
   *          (so the caller can fall back to n8n)
   */
  private async executeLocalFastPath(
    html: string,
    effectiveUserId: string,
    effectiveBusinessId: string | undefined,
    userDetails: UserWithRelations | null,
    appId: string,
    flooviooId: string,
    workflowId: string,
    actionType: string,
    payload: WebhookPayload
  ): Promise<LocalEngineResult | null> {
    logger.info({ workflowId }, '🚀 [WorkflowService] Bypassing n8n: Generating PDF Locally');
    const startTime = Date.now();

    try {
      const pdfBuffer = await pdfService.generateFromHtml(html);
      const filename = `branded-${payload.entityId || 'doc'}-${Date.now()}.pdf`;
      const brandedUrl = await storageService.saveFile(effectiveUserId, pdfBuffer, filename, 'processed');
      const duration = Date.now() - startTime;

      const processedDoc = await prisma.processedDocument.create({
        data: {
          id: uuid(),
          businessId: effectiveBusinessId || userDetails?.business?.id || 'unknown',
          appId,
          userId: effectiveUserId,
          provider: payload.provider || 'unknown',
          resourceType: payload.resourceType || payload.type?.split('.')[0] || 'unknown',
          resourceId: payload.entityId || payload.id || 'unknown',
          eventType: payload.normalizedEventType || 'unknown',
          status: 'completed',
          flooviooId,
          brandedUrl,
          snapshotHtml: html,
          processingTimeMs: duration,
          createdAt: new Date(),
        },
      });

      // Log usage for billing
      const service = await prisma.service.findUnique({
        where: { slug: ServiceSlugs.TRANSACTIONAL_BRANDING },
      });

      if (service) {
        await prisma.usageLog.create({
          data: {
            userId: effectiveUserId,
            appId,
            serviceId: service.id,
            action: actionType,
            resourceType: payload.resourceType || 'invoice',
            status: 'success',
            statusCode: 200,
            duration,
            cost: service.pricePerRequest || 0,
            metadata: JSON.stringify({
              flooviooId,
              externalId: payload.entityId || payload.id,
              workflowId,
              brandedUrl,
              method: 'local_fast_path',
            }),
            createdAt: new Date(),
          },
        });
      }

      return {
        source: 'local_engine',
        statusCode: 200,
        duration,
        artifacts: { pdfUrl: brandedUrl, documentId: processedDoc.id },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err: message }, '❌ [WorkflowService] Local Fast-Path Failed, falling back to n8n');
      return null;
    }
  }

  // ── TESTING ────────────────────────────────────────────────

  /**
   * Manually trigger a workflow for testing purposes.
   *
   * @param userId     - Authenticated user ID
   * @param workflowId - Workflow to test
   * @param payload    - Mock payload to process
   * @throws Error if the workflow is not found
   */
  async testWorkflow(
    userId: string,
    workflowId: string,
    payload: WebhookPayload
  ): Promise<ActionResult> {
    const wf = await prisma.workflow.findUnique({ where: { id: workflowId } });
    if (!wf) throw new Error('Workflow not found');

    logger.info({ userId, workflowId }, '🧪 [WorkflowService] Manually testing workflow');
    return this.executeAction(wf.id, wf.actionConfig as unknown as ActionConfig, payload, userId);
  }

  // ── AUTO-PROVISIONING ──────────────────────────────────────

  /**
   * Ensures a default branding workflow exists for a given provider.
   * Called during integration connection to auto-activate branding.
   *
   * @param userId     - User connecting the integration
   * @param businessId - Business receiving the workflow
   * @param provider   - Integration provider (e.g. 'stripe', 'quickbooks')
   */
  async ensureDefaultWorkflow(userId: string, businessId: string, provider: string): Promise<void> {
    if (!businessId || !provider) return;

    const exists = await prisma.workflow.findFirst({
      where: {
        businessId,
        triggerType: 'webhook',
        isActive: true,
        triggerConfig: { path: ['provider'], equals: provider },
      },
    });

    if (exists) return;

    const triggerEvent = provider === 'stripe' ? 'stripe.invoice.*' : 'invoice.*';

    await prisma.workflow.create({
      data: {
        id: uuid(),
        businessId,
        name: `Auto-Brand Invoices (${provider})`,
        description: `Automatically applies branding for ${provider}`,
        isActive: true,
        triggerType: 'webhook',
        triggerConfig: { provider, event: triggerEvent },
        actionConfig: { type: 'apply_branding', profileId: 'default' },
      },
    });
  }

  /**
   * Ensures a default recovery workflow exists for a business.
   * Called during recovery engine initialization.
   *
   * @param userId     - User activating the recovery engine
   * @param businessId - Business receiving the recovery workflow
   * @returns The existing or newly created workflow
   */
  async ensureRecoveryWorkflow(userId: string, businessId: string): Promise<Workflow> {
    const existing = await prisma.workflow.findFirst({
      where: { businessId, triggerType: 'invoice_overdue', isActive: true },
    });

    if (existing) return existing;

    return prisma.workflow.create({
      data: {
        id: uuid(),
        businessId,
        name: 'Auto-Recover Overdue Invoices',
        description: 'Automatically dispatches recovery actions when invoices become overdue',
        isActive: true,
        triggerType: 'invoice_overdue',
        triggerConfig: { event: 'invoice.overdue', source: 'recovery_engine' },
        actionConfig: { type: 'recovery_email', templateId: 'default-recovery' },
      },
    });
  }
}

export const workflowService = new WorkflowService();
