import { Job } from 'bullmq';
import { logger } from '../lib/logger';
import { UnifiedDataService, unifiedDataService } from '../modules/unified-data/unified-data.service';

interface UnifiedSyncJobData {
    businessId: string;
    cycleId: string;
}

/**
 * Unified Sync Processor
 * 
 * Handles background jobs for the Unified Hub:
 * 1. unified:orchestrate - Fans out per-tenant jobs.
 * 2. unified:sync-business - Performs sync for a single business.
 */
export const unifiedSyncProcessor = async (job: Job<any>) => {
    const start = Date.now();

    try {
        switch (job.name) {
            case 'unified:orchestrate': {
                logger.info({ jobId: job.id }, '⚙️ [UnifiedSyncWorker] Processing Orchestrate Job');
                const result = await UnifiedDataService.orchestrate();
                
                logger.info({ 
                    jobId: job.id, 
                    tenants: result.tenants, 
                    queued: result.queued,
                    duration: Date.now() - start 
                }, '✅ [UnifiedSyncWorker] Orchestrate Completed');
                
                return result;
            }

            case 'unified:sync-business': {
                const { businessId, cycleId } = job.data;
                logger.info({ 
                    businessId, 
                    cycleId, 
                    jobId: job.id 
                }, '⚙️ [UnifiedSyncWorker] Processing Hub Sync Job');

                const recordsSynced = await unifiedDataService.syncBusinessData(businessId);
                
                logger.info({ 
                    businessId, 
                    cycleId, 
                    recordsSynced, 
                    duration: Date.now() - start 
                }, '✅ [UnifiedSyncWorker] Hub Sync Completed');

                return { success: true, recordsSynced, duration: Date.now() - start };
            }

            default:
                logger.warn({ jobName: job.name, jobId: job.id }, '⚠️ [UnifiedSyncWorker] Unknown job name');
                return { skipped: true, reason: 'unknown_job' };
        }

    } catch (error: any) {
        logger.error({ 
            jobName: job.name,
            jobId: job.id, 
            error: error.message, 
            duration: Date.now() - start 
        }, '❌ [UnifiedSyncWorker] Job Failed');
        
        throw error; // Triggers BullMQ retry
    }
};
