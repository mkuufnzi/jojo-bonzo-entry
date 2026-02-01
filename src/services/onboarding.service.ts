import { Queue } from 'bullmq';
import { createQueue, QUEUES } from '../lib/queue';
import { logger } from '../lib/logger';
import { ServiceSlugs } from '../types/service.types';
import prisma from '../lib/prisma';
import { AppError } from '../lib/AppError';

/**
 * Service Constants
 */
const SYNC_QUEUE_RETENTION = 100;

interface SyncJobData {
    userId: string;
    provider: string;
    product: string;
    businessId: string;
    integrationId: string;
}

/**
 * Onboarding Service (V2) - Enterprise Hub
 * 
 * Orchestrates the activation of products and the synchronization of data.
 * Acts as the State Machine for the "Onboarding Wizard".
 * 
 * Responsibilities:
 * - Validating Prerequisites (Business, Integration).
 * - Dispatching Async Jobs (BullMQ).
 * - Tracking State (Metadata, DB Status).
 * - Dunning/Recovery (Handling failed onboardings).
 * 
 * @version 2.2.0
 */
export class OnboardingService {
  private syncQueue: Queue;

  constructor() {
    this.syncQueue = createQueue(QUEUES.ONBOARDING_SYNC);
  }

  /**
   * Start Sync Process (Wizard Action)
   * 
   * Triggers the initial data pull for a new integration.
   * 
   * @param userId - Initiating User
   * @param provider - Integration Type (zoho, quickbooks)
   * @param product - Target Product Context (transactional, sales)
   */
  async startSync(userId: string, provider: string, product: string = 'transactional') {
     logger.info({ userId, provider, product }, '🚀 [OnboardingService] Start Sync Request');
     
     // 1. Deep Validation
     const { user, integration } = await this._validateContext(userId, provider);

     // 2. Job Deduplication
     // Check if there is already a running job for this integration?
     // For now, we allow re-triggering (Retries), but we generate a unique ID.
     const jobId = `sync_${userId}_${product}_${Date.now()}`;
     
     const jobData: SyncJobData = {
        userId,
        provider,
        product,
        businessId: integration.businessId,
        integrationId: integration.id
     };

     // 3. Dispatch to Queue
     // We use a specific queue for onboarding to ensure priority over routine syncs.
     await this.syncQueue.add('full_sync', jobData, {
        jobId,
        removeOnComplete: SYNC_QUEUE_RETENTION,
        attempts: 3, // Retry failed syncs 3 times
        backoff: {
            type: 'exponential',
            delay: 1000
        }
     });

     // 4. Update State Machine
     await this._updateIntegrationState(integration.id, 'queued', jobId);

     logger.info({ jobId }, '   ✅ Sync Job Enqueued');

     return { 
         jobId, 
         status: 'queued', 
         message: 'Sync started in background',
         estimatedDuration: '2-5 minutes'
     };
  }

  /**
   * Get Current Status (Polling Endpoint)
   */
  async getSyncStatus(userId: string, provider: string) {
      const { integration } = await this._validateContext(userId, provider);
      
      const meta = (integration.metadata as any) || {};
      
      // Calculate derived status based on time
      let status = meta.lastSyncStatus || 'unknown';
      
      // Logic: If 'queued' for > 10 minutes, might be stuck
      if (status === 'queued' && meta.lastSyncedAt) {
          const waitingTime = Date.now() - new Date(meta.lastSyncedAt).getTime();
          if (waitingTime > 600000) {
              status = 'stalled';
          }
      }

      return { 
          status,
          lastSyncedAt: meta.lastSyncedAt,
          jobId: meta.lastSyncJobId,
          details: meta.syncResults || {}
      };
  }

  /**
   * Check for Stuck Onboardings (Cron Job)
   * Finds businesses that started onboarding but never finished.
   */
  async processStuckOnboardings() {
      // Find businesses in 'ONBOARDING' status for > 24 hours
      const yesterday = new Date(Date.now() - 86400000);
      
      const stuck = await prisma.business.findMany({
          where: {
              onboardingStatus: 'ONBOARDING' as any, // Temporary fix for Enum Loading
              createdAt: { lt: yesterday }
          }
      });

      logger.info({ count: stuck.length }, '🕵️ [OnboardingService] Found stuck onboardings');

      for (const biz of stuck) {
          // Send Dunning Email / Notification
          // notificationService.send(biz.ownerId, 'onboarding_reminder');
          logger.info({ businessId: biz.id }, '   ➔ Would send reminder');
      }
  }

  // --------------------------------------------------------------------------
  // HELPERS
  // --------------------------------------------------------------------------

  private async _validateContext(userId: string, provider: string) {
     const user = await prisma.user.findUnique({ 
         where: { id: userId },
         select: { businessId: true }
     });

     if (!user?.businessId) {
         throw new AppError('User does not have a business', 400);
     }

     const integration = await prisma.integration.findFirst({
         where: { 
             businessId: user.businessId,
             provider: provider,
             status: 'active' 
         }
     });

     if (!integration) {
         throw new AppError(`No active integration found for ${provider}`, 400);
     }

     return { user, integration };
  }

  private async _updateIntegrationState(integrationId: string, status: string, jobId?: string) {
      const integration = await prisma.integration.findUnique({ where: { id: integrationId } });
      const currentMetadata = (integration?.metadata as any) || {};

      await prisma.integration.update({
         where: { id: integrationId },
         data: { 
             metadata: {
                 ...currentMetadata,
                 lastSyncStatus: status,
                 lastSyncedAt: new Date().toISOString(),
                 lastSyncJobId: jobId || currentMetadata.lastSyncJobId
             }
         }
     });
  }
}

export const onboardingService = new OnboardingService();
