import prisma from '../lib/prisma';
import { logger } from '../lib/logger';
import { brandingService } from './branding.service';
import { webhookService } from './webhook.service';
import { ServiceRepository } from '../repositories/service.repository';
import { ServiceSlugs } from '../types/service.types';
import { pdfService } from './pdf.service';
import { storageService } from './storage.service';
import { n8nPayloadFactory } from './n8n/n8n-payload.factory';
import axios from 'axios';
import { v4 as uuid } from 'uuid';
import { createAuditLog } from '../middleware/audit.middleware';
import { config } from '../config/env';
import { RevenueService } from '../modules/transactional/revenue/revenue.service';

const revenueService = new RevenueService();

/**
 * WorkflowService is the central engine for Floovioo's automation.
 * It resolves business logic, filters incoming signals, and dispatches tasks 
 * to external engines like n8n.
 */
export class WorkflowService {
  
  async listWorkflows(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { businessId: true } });
    if (!user?.businessId) return [];

    return await prisma.workflow.findMany({
      where: { businessId: user.businessId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async createWorkflow(userId: string, data: any) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { businessId: true } });
    if (!user?.businessId) throw new Error('Business account required');

    return await prisma.workflow.create({
      data: {
        businessId: user.businessId,
        name: data.name,
        description: data.description,
        isActive: data.isActive !== false,
        triggerType: data.triggerType,
        triggerConfig: data.triggerConfig ?? {}, 
        actionConfig: data.actionConfig ?? {}
      }
    });
  }
  
  async deleteWorkflow(userId: string, id: string) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { businessId: true } });
      if (!user?.businessId) throw new Error('Business account required');

      // Verify ownership
      const wf = await prisma.workflow.findFirst({ where: { id, businessId: user.businessId } });
      if (!wf) throw new Error('Not found');
      
      return await prisma.workflow.delete({ where: { id } });
  }

  /**
   * The Core Logic Engine
   * Taking a trigger payload, checking against workflows, and executing actions.
   */
  async processWebhook(userId: string, payload: any, resolvedAppId?: string) {
    /**
     * processWebhook takes an incoming signal (ERP event, manual trigger, etc.)
     * and matches it against active workflows for the user's business.
     */
    logger.info({ userId, type: payload.normalizedEventType || payload.type }, 'Processing Webhook Event');
    
    // Resolving User's Business context
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { businessId: true } });
    if (!user?.businessId) {
        logger.warn({ userId }, 'Webhook received for user without business');
        return [];
    }

    // Find active workflows for this user driven by webhook
          //todo: support other trigger types
    const workflows = await prisma.workflow.findMany({
      where: { 
        businessId: user.businessId, 
        isActive: true, 
        triggerType: 'webhook' 
      }
    });

    console.log(`[WorkflowService Debug] User: ${userId}, Business: ${user.businessId}. Found ${workflows.length} active webhook workflows.`);

    const results: any[] = [];

    for (const wf of workflows) {
      // Check if payload matches trigger criteria
      const config = wf.triggerConfig as any;
      console.log(`[WorkflowService Debug] Checking Workflow ${wf.id}. Config: ${JSON.stringify(config)} vs Event: ${payload.normalizedEventType || payload.type} Provider: ${payload.provider}`);
      
      // Filter by Event Type (Supports exact match or wildcard like 'invoice.*')
      if (config?.event) {
          /**
           * Prioritize the new scoped event names for trigger matching.
           * Fallback to raw provider types for backward compatibility.
           */
          const eventToMatch = payload.normalizedEventType || payload.type;
          
          const pattern = config.event.replace(/\*/g, '.*');
          const regex = new RegExp(`^${pattern}$`);
          let matches = regex.test(eventToMatch);
          
          //todo: support fuzzy matching for backward compatibility
          // // Fuzzy Matching for Backward Compatibility
          // 1. If trigger is 'invoice.created' but event is 'invoice.updated/voided/etc', we should match
          // 2. If trigger is 'invoice' (simple) but event is 'invoice.created/updated/etc', we should match
          if (!matches) {
              const triggerBase = config.event.split('.')[0];
              const eventBase = payload.type.split('.')[0];
              
              if (triggerBase === eventBase) {
                  matches = true;
                  logger.info({ trigger: config.event, event: payload.type }, '🤖 [WorkflowService] Fuzzy Trigger Match Applied');
              }
          }

          if (!matches) {
              console.log(`[WorkflowService Debug] Mismatch Event. Config: ${config.event} vs Event: ${eventToMatch}`);
              continue;
          }
          else{
            // todo: support fuzzy matching for backward compatibility
          }
      }
      
      // Filter by Provider (e.g. "zoho")
      if (payload.provider && config?.provider && payload.provider !== config.provider) {
          console.log(`[WorkflowService Debug] Mismatch Provider. Payload: ${payload.provider} vs Config: ${config.provider}`);
          continue;
      } else {
        // todo: handle all providers
      }
      


      // Execute Action
      try {
        const result = await this.executeAction(wf.id, wf.actionConfig, payload, userId, resolvedAppId);
        results.push({ workflowId: wf.id, status: 'success', result });
        
        // Log Success
        await prisma.workflowExecutionLog.create({
          data: {
            workflowId: wf.id,
            status: 'success',
            inputData: payload,
            outputData: result as any, // Json compatible
            duration: 100 // We might want to measure this
          }
        });

      } catch (error: any) {
        logger.error({ workflowId: wf.id, error }, 'Workflow Execution Failed');
        results.push({ workflowId: wf.id, status: 'failed', error: error.message });
        
        // Log Failure
        await prisma.workflowExecutionLog.create({
          data: {
            workflowId: wf.id,
            status: 'failed',
            inputData: payload,
            error: error.message
          }
        });
      }
    }
    
    return results;
  }

  async processWebhookForBusiness(businessId: string, payload: any) {
      // Fallback: Find first user - Ideally we should track the 'Owner' of the business
      const user = await prisma.user.findFirst({ where: { businessId } });
      if (user) {
          return this.processWebhook(user.id, payload);
      }
      return [];
  }

  // todo:   this works by ?? 
    async executeAction(
        workflowId: string, 
        actionConfig: any, 
        payload: any, 
        userId: string,
        businessId?: string,
        resolvedAppId?: string
    ): Promise<any> {
    if (!actionConfig) return { message: 'No action config' };
    
    const type = actionConfig.type || actionConfig.steps?.[0]?.type;
        // todo: handle all types
    if (type === 'apply_branding' || type === 'brand_and_email' || type === 'email' || type === 'recovery_email') {
        
        // 1. Resolve External Endpoint (n8n)
        let serviceSlug: string = ServiceSlugs.TRANSACTIONAL_BRANDING;
        let webhookAction = type === 'email' ? 'email' : 'apply_branding';

        // Special routing for Recovery
        // todo: better routing needed
        if (type === 'recovery_email') {
            serviceSlug = ServiceSlugs.DEBT_COLLECTION;
            webhookAction = 'recovery_action';
        }

        const webhookUrl = await webhookService.getEndpoint(serviceSlug, webhookAction);
        logger.info({ serviceSlug, webhookAction, webhookUrl }, '🔗 [WorkflowService] Resolved n8n endpoint');
        
        // 2. Prepare Payload for n8n
        // todo: ensure all required fields are present
        // ARCHITECTURE RULE: Handle virtual 'system' user for background tasks
        
        // todo: ARCHITECTURE Explanation - explain the 'sytem' user from creation, IAM, TTL, association to real user
        // todo: ARCHITECTURE Explanation - this is...?
        const isSystem = userId === 'system';
        const user = !isSystem ? await prisma.user.findUnique({
            where: { id: userId },
            include: { 
                business: true,
                apps: { where: { name: 'System Automation' } },
                subscription: true
            }
        }) : null;

        const effectiveBusinessId = businessId || user?.business?.id;

        let brandProfile: any = null;
        if (actionConfig.profileId && !isSystem) {
             brandProfile = await brandingService.getProfile(userId);
        } else if (effectiveBusinessId) {
             // For system processes (like cron Recovery), fetch the brand by business ID
             // The system user does not have a branding profile, the business does.
             brandProfile = await prisma.brandingProfile.findFirst({
                 where: { businessId: effectiveBusinessId, isDefault: true },
                 include: { business: true }
             });
        }

        // If system user, attempt to find the business owner to use as floovioo_id
        let effectiveUserId = userId;
        let planId = user?.subscription?.planId;

        if (isSystem && effectiveBusinessId) {
            const businessOwner = await prisma.user.findFirst({
                where: { businessId: effectiveBusinessId },
                orderBy: { createdAt: 'asc' },
                include: { business: true, subscription: true }
            });
            if (businessOwner) {
                effectiveUserId = businessOwner.id;
                planId = businessOwner.subscription?.planId;
            }
        }

        // 3. Resolve or Create System Automation App
        // ARCHITECTURE RULE: All ProcessedDocuments must have a valid appId
        let appId = resolvedAppId || user?.apps[0]?.id;

        if (!appId && effectiveBusinessId) {
            // Lazy creation: Create System Automation app on first workflow execution
            const { resolveSystemApp } = await import('../services/app-resolution.service');
            appId = await resolveSystemApp(effectiveBusinessId);
            logger.info({ businessId: effectiveBusinessId, appId }, 'Resolved System App for ERP workflows');
        }

        if (!appId) {
            throw new Error(`Unable to resolve appId for userId: ${userId}, businessId: ${businessId}`);
        }

        // 4. Create Standardized Envelope with Enterprise Tracking UUIDs
        const context = {
            serviceId: serviceSlug, // Use the resolved slug (DEBT_COLLECTION for recovery, TRANSACTIONAL_BRANDING otherwise)
            serviceTenantId: effectiveBusinessId || user?.business?.id || 'unknown',
            appId, // Now always a valid UUID
            requestId: `wf_${workflowId.substring(0, 8)}_${Date.now()}`,
            brandId: brandProfile?.id,
            businessId: effectiveBusinessId,
            planId
        };

        // 3.1 Fetch Revenue Context (Upsells/Personalization)
        let smartContent = {};
        if (serviceSlug === ServiceSlugs.TRANSACTIONAL_BRANDING) {
            const documentItems = payload.items || [];
            smartContent = await revenueService.getEnrichedContext(effectiveBusinessId || 'unknown', documentItems);
        }

        const envelope = n8nPayloadFactory.createWorkflowExecutionPayload(
            workflowId,
            type,
            payload,
            actionConfig,
            brandProfile,
            effectiveUserId,
            context,
            payload.normalizedEventType, // Use strict event type if provided by integration
            smartContent
        );

        // ── Recovery: Promote tracking IDs to envelope top-level ──
        // n8n must echo actionId/sessionId/actionIds back in the callback to
        // POST /api/callbacks/recovery/action. Without top-level fields,
        // n8n would need to dig into data.originalPayload — which is brittle.
        if (type === 'recovery_email') {
            (envelope as any).recovery = {
                actionId:    payload.actionId    || null,
                sessionId:   payload.sessionId   || null,
                actionIds:   payload.actionIds   || null,   // Batch: array of actionIds
                sessionIds:  payload.sessionIds  || null,   // Batch: array of sessionIds
                batchMode:   payload.batchMode   || false,
                callbackUrl: `${config.APP_URL}/api/callbacks/recovery/action`,
            };
        }


        // 5. Create ProcessedDocument for tracking (pending status)
        // Use a random suffix to avoid P2002 collision during high-frequency batch processing
        const flooviooId = `req_${workflowId.substring(0, 8)}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const processedDoc = await prisma.processedDocument.create({
            data: {
                id: uuid(),
                businessId: effectiveBusinessId || user?.business?.id || 'unknown',
                appId, // REQUIRED: enforces architecture rule
                userId: effectiveUserId,
                provider: payload.provider || 'unknown',
                resourceType: payload.resourceType || payload.type?.split('.')[0] || 'unknown',
                resourceId: payload.entityId || payload.id || 'unknown',
                eventType: payload.normalizedEventType || 'unknown',
                status: 'processing',
                flooviooId,
                createdAt: new Date()
            }
        });

        // 5. Pre-dispatch Audit Log
        await createAuditLog({
            userId: effectiveUserId,
            appId: context.appId,
            businessId: effectiveBusinessId || user?.business?.id,
            actionType: 'n8n_dispatch',
            serviceId: serviceSlug,
            eventType: payload.normalizedEventType,
            requestPayload: envelope,
            requestId: flooviooId,
            success: true // Dispatch initiated successfully
        });

        // 6. Call n8n
        logger.info({ workflowId, webhookUrl, serviceTenantId: context.serviceTenantId }, '🔗 [WorkflowService] Calling n8n Envelope');
        const startTime = Date.now();
        
        const response = await axios.post(webhookUrl, envelope, {
            timeout: 15000, // 15s to handle cold starts or heavy processing
            headers: { 
                'Content-Type': 'application/json',
                'User-Agent': 'Floovioo-Engine/1.0',
                'ngrok-skip-browser-warning': 'true',
                ...(config.AI_WEBHOOK_SECRET ? { 'X-Webhook-Secret': config.AI_WEBHOOK_SECRET.trim() } : {})
            }
        }).catch(async (err) => {
            // Update ProcessedDocument on failure
            await prisma.processedDocument.update({
                where: { id: processedDoc.id },
                data: {
                    status: 'failed',
                    errorMessage: err.message,
                    processingTimeMs: Date.now() - startTime,
                    updatedAt: new Date()
                }
            });
            
            // Post-failure Audit Log
            await createAuditLog({
                userId: effectiveUserId,
                appId: context.appId,
                businessId: user?.business?.id,
                actionType: 'n8n_response',
                serviceId: ServiceSlugs.TRANSACTIONAL_BRANDING,
                eventType: payload.normalizedEventType,
                responseStatus: err.response?.status || 0,
                durationMs: Date.now() - startTime,
                success: false,
                errorMessage: err.message,
                requestId: flooviooId
            });
            
            if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
                logger.error({ workflowId, timeout: 15000 }, '❌ [WorkflowService] n8n Webhook TIMEOUT');
                throw new Error(`n8n Webhook Timed Out after 15s at ${webhookUrl}`);
            }
            logger.error({ workflowId, error: err.message, status: err.response?.status }, '❌ [WorkflowService] n8n Webhook Failure');
            throw err;
        });

        const duration = Date.now() - startTime;
        logger.info({ workflowId, duration, status: response.status }, '✅ [WorkflowService] n8n Dispatch Successful');

        // 7. Process Response & Generate Artifacts
        let brandedUrl: string | undefined;
        let outputHtml: string | undefined;

        try {
            const resultData = Array.isArray(response.data) ? response.data[0] : response.data;
            if (resultData && resultData.html) {
                outputHtml = resultData.html;
                logger.info({ workflowId }, '📄 [WorkflowService] PDF Generation Started');
                
                // Generate PDF
                const pdfBuffer = await pdfService.generatePdfFromHtml(resultData.html);
                
                // Save to Storage
                const filename = `branded-${payload.entityId || 'doc'}-${Date.now()}.pdf`;
                brandedUrl = await storageService.saveFile(userId, pdfBuffer, filename, 'processed');
                
                logger.info({ workflowId, brandedUrl }, '💾 [WorkflowService] PDF Saved');
            }
        } catch (processError: any) {
            logger.error({ workflowId, error: processError.message }, '⚠️ [WorkflowService] Failed to process n8n artifacts');
        }

        // 8. Update ProcessedDocument
        await prisma.processedDocument.update({
            where: { id: processedDoc.id },
            data: {
                status: 'completed',
                processingTimeMs: duration,
                brandedUrl: brandedUrl, 
                updatedAt: new Date()
            }
        });

        // 9. [Phase 2] Create UsageLog for Analytics & Billing
        // This is critical for the Transactional Dashboard to show real data.
        const service = await prisma.service.findUnique({ where: { slug: ServiceSlugs.TRANSACTIONAL_BRANDING } });
        if (service) {
            await prisma.usageLog.create({
                data: {
                    userId: effectiveUserId,
                    appId: context.appId,
                    serviceId: service.id,
                    action: type,
                    resourceType: payload.resourceType || 'invoice',
                    status: 'success',
                    statusCode: 200,
                    duration: duration,
                    cost: service.pricePerRequest || 0,
                    metadata: JSON.stringify({
                        flooviooId,
                        externalId: payload.entityId || payload.id, // Linked to ExternalDocument
                        workflowId,
                        brandedUrl
                    }),
                    createdAt: new Date()
                }
            }).catch(e => logger.error({ err: e }, '❌ [WorkflowService] Failed to create UsageLog'));
            logger.info({ workflowId, action: type }, '📊 [WorkflowService] UsageLog Created');
        }

        // 10. Success Audit Log
        await createAuditLog({
            userId: effectiveUserId,
            appId: context.appId,
            businessId: user?.business?.id,
            actionType: 'n8n_response',
            serviceId: ServiceSlugs.TRANSACTIONAL_BRANDING,
            eventType: payload.normalizedEventType,
            responseStatus: response.status,
            durationMs: duration,
            success: true,
            requestId: flooviooId,
            // We store the result summary, not the full HTML
            responseData: {
                 generatedUrl: brandedUrl,
                 hasHtml: !!outputHtml
            }
        });

        // 10. Return Data
        return {
            source: 'n8n',
            statusCode: response.status,
            data: response.data,
            duration,
            artifacts: {
                pdfUrl: brandedUrl
            }
        };
    }
    
    return { message: 'Unknown action type', config: actionConfig };
  }

  /**
   * Manual Test Trigger
   */
  async testWorkflow(userId: string, workflowId: string) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { businessId: true } });
      if (!user?.businessId) throw new Error('Business account required');

      const wf = await prisma.workflow.findFirst({ where: { id: workflowId, businessId: user.businessId } });
      if (!wf) throw new Error('Workflow not found');

      const mockPayload = {
          type: (wf.triggerConfig as any)?.event || 'invoice.created',
          provider: 'manual_test',
          id: 'test-invoice-123',
          amount: 100.00,
          currency: 'USD',
          customer: {
              name: 'Test Customer',
              email: 'test@example.com'
          }
      };

      try {
          const result = await this.executeAction(wf.id, wf.actionConfig, mockPayload, userId);
           await prisma.workflowExecutionLog.create({
              data: {
                  workflowId: wf.id,
                  status: 'success',
                  inputData: mockPayload,
                  outputData: result as any, 
                  duration: result.duration || 0
              }
          });
          return result;
      } catch (error: any) {
           await prisma.workflowExecutionLog.create({
              data: {
                  workflowId: wf.id,
                  status: 'failed',
                  inputData: mockPayload,
                  error: error.message
              }
          });
          throw error;
      }
  }

  /**
   * Automates the creation of a default workflow for a given provider.
   * Called during onboarding completion (ERP) and on first Stripe invoice event.
   *
   * Provider-scoped: each provider gets its own default workflow so that
   * businesses using BOTH an ERP and Stripe get correctly routed events.
   */
  async ensureDefaultWorkflow(userId: string, businessId: string, provider: string) {
      if (!businessId || !provider) return;
      
      logger.info({ userId, businessId, provider }, '🔍 [WorkflowService] Ensuring default workflow exists');

      // 1. Check if a webhook workflow for THIS provider already exists.
      //    We must be provider-scoped: an ERP workflow must not block Stripe
      //    workflow creation and vice-versa.
      const allWebhookWorkflows = await prisma.workflow.findMany({
          where: {
              businessId,
              triggerType: 'webhook',
              isActive: true,
          },
          select: { id: true, triggerConfig: true }
      });

      const existsForProvider = allWebhookWorkflows.some(wf => {
          const config = wf.triggerConfig as any;
          return config?.provider === provider;
      });

      if (existsForProvider) {
          logger.info({ userId, businessId, provider }, '✅ [WorkflowService] Provider workflow already exists. Skipping.');
          return;
      }

      // 2. Build provider-specific trigger/action config
      const providerLabel = provider.charAt(0).toUpperCase() + provider.slice(1);

      /**
       * Event pattern design:
       *  - ERP providers:  'invoice.*'              (matches invoice.created, invoice.updated, etc.)
       *  - Stripe:         'stripe.invoice.*'        (scoped to avoid ERP fuzzy-match collisions)
       */
      const triggerEvent = provider === 'stripe' ? 'stripe.invoice.*' : 'invoice.*';

      const wf = await prisma.workflow.create({
          data: {
              id: uuid(),
              businessId,
              name: `Auto-Brand New Invoices (${providerLabel})`,
              description: `Automatically applies branding when an invoice is created via ${providerLabel}`,
              isActive: true,
              triggerType: 'webhook',
              triggerConfig: {
                  provider,
                  event: triggerEvent,
              },
              actionConfig: {
                  type: 'apply_branding',
                  profileId: 'default',
              },
          }
      });

      logger.info({ userId, workflowId: wf.id, provider }, '🚀 [WorkflowService] Created Default Workflow');
      return wf;
  }

  /**
   * Automates the creation of a recovery workflow for a business.
   * Called when a default DebtCollectionSequence is created during recovery onboarding.
   *
   * This creates the Workflow record that RecoveryService.processRecovery()
   * looks up at L354: `triggerType: 'invoice_overdue', isActive: true`.
   * Without this record, all 'workflow' action steps in DebtCollectionSequence.steps
   * are silently skipped with reason 'no_workflow_configured'.
   */
  async ensureRecoveryWorkflow(userId: string, businessId: string) {
      if (!businessId) return;

      logger.info({ userId, businessId }, '🔍 [WorkflowService] Ensuring recovery workflow exists');

      // Check if an invoice_overdue workflow already exists for this business
      const existing = await prisma.workflow.findFirst({
          where: {
              businessId,
              triggerType: 'invoice_overdue',
              isActive: true,
          }
      });

      if (existing) {
          logger.info({ userId, businessId, workflowId: existing.id }, '✅ [WorkflowService] Recovery workflow already exists. Skipping.');
          return existing;
      }

      const wf = await prisma.workflow.create({
          data: {
              id: uuid(),
              businessId,
              name: 'Auto-Recover Overdue Invoices',
              description: 'Automatically dispatches recovery actions when invoices become overdue',
              isActive: true,
              triggerType: 'invoice_overdue',
              triggerConfig: {
                  event: 'invoice.overdue',
                  source: 'recovery_engine',
              },
              actionConfig: {
                  type: 'recovery_email',
                  templateId: 'default-recovery',
              },
          }
      });

      logger.info({ userId, businessId, workflowId: wf.id }, '🚀 [WorkflowService] Created Recovery Workflow');
      return wf;
  }
}

export const workflowService = new WorkflowService();
