import prisma from '../lib/prisma';
import { logger } from '../lib/logger';
import { brandingService } from './branding.service';
import { webhookService } from './webhook.service';
import { ServiceRepository } from '../repositories/service.repository';
import { ServiceSlugs } from '../types/service.types';
import { n8nPayloadFactory } from './n8n/n8n-payload.factory';
import axios from 'axios';
import { v4 as uuid } from 'uuid';
import { createAuditLog } from '../middleware/audit.middleware';

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
  async processWebhook(userId: string, payload: any) {
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
    const workflows = await prisma.workflow.findMany({
      where: { 
        businessId: user.businessId, 
        isActive: true, 
        triggerType: 'webhook' 
      }
    });

    const results: any[] = [];

    for (const wf of workflows) {
      // Check if payload matches trigger criteria
      const config = wf.triggerConfig as any;
      
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
          
          // Fuzzy Matching for Backward Compatibility
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
              continue;
          }
      }
      
      // Filter by Provider (e.g. "zoho")
      if (payload.provider && config?.provider && payload.provider !== config.provider) {
          continue;
      }

      // Execute Action
      try {
        const result = await this.executeAction(wf.id, wf.actionConfig, payload, userId);
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

  async executeAction(workflowId: string, actionConfig: any, payload: any, userId: string) {
    if (!actionConfig) return { message: 'No action config' };
    
    const type = actionConfig.type || actionConfig.steps?.[0]?.type;

    if (type === 'apply_branding' || type === 'brand_and_email' || type === 'email') {
        
        // 1. Resolve External Endpoint (n8n)
        const serviceSlug = ServiceSlugs.TRANSACTIONAL_BRANDING;
        const webhookUrl = await webhookService.getEndpoint(serviceSlug, type === 'email' ? 'email' : 'apply_branding');
        
        // 2. Prepare Payload for n8n
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { 
                business: true,
                apps: { where: { name: 'System Automation' } }
            }
        });

        let brandProfile = null;
        if (actionConfig.profileId) {
             brandProfile = await brandingService.getProfile(userId);
        }

        // 3. Resolve or Create System Automation App
        // ARCHITECTURE RULE: All ProcessedDocuments must have a valid appId
        let appId = user?.apps[0]?.id;
        if (!appId && user?.business) {
            // Lazy creation: Create System Automation app on first workflow execution
            const { resolveSystemApp } = await import('../services/app-resolution.service');
            appId = await resolveSystemApp(user.business.id);
            logger.info({ businessId: user.business.id, appId }, 'Resolved System App for ERP workflows');
        }

        if (!appId) {
            throw new Error(`Unable to resolve appId for userId: ${userId}`);
        }

        // 4. Create Standardized Envelope
        const context = {
            serviceId: ServiceSlugs.TRANSACTIONAL_BRANDING,
            serviceTenantId: user?.business?.id || 'unknown',
            appId, // Now always a valid UUID
            requestId: `wf_${workflowId.substring(0, 8)}_${Date.now()}`
        };

        const envelope = n8nPayloadFactory.createWorkflowExecutionPayload(
            workflowId,
            type,
            payload,
            actionConfig,
            brandProfile,
            userId,
            context,
            payload.normalizedEventType // Use strict event type if provided by integration
        );

        // 5. Create ProcessedDocument for tracking (pending status)
        const flooviooId = `req_${workflowId.substring(0, 8)}_${Date.now()}`;
        const processedDoc = await prisma.processedDocument.create({
            data: {
                id: uuid(),
                businessId: user?.business?.id || 'unknown',
                appId, // REQUIRED: enforces architecture rule
                userId,
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
            userId,
            appId: context.appId,
            businessId: user?.business?.id,
            actionType: 'n8n_dispatch',
            serviceId: ServiceSlugs.TRANSACTIONAL_BRANDING,
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
            headers: { 'Content-Type': 'application/json' }
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
                userId,
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

        // 4. Return Data
        return {
            source: 'n8n',
            statusCode: response.status,
            data: response.data,
            duration
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
}

export const workflowService = new WorkflowService();
