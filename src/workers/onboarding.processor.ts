import { Job } from 'bullmq';
import { logger } from '../lib/logger';
import prisma from '../lib/prisma';
import { dataSyncService } from '../services/data-sync.service';

interface OnboardingJobData {
    userId: string;
    provider: string;
    product: string;
    businessId: string;
    integrationId: string;
}

export const onboardingProcessor = async (job: Job<OnboardingJobData>) => {
    const { userId, provider, product, businessId } = job.data;
    logger.info({ userId, provider, product, jobId: job.id }, '⚙️ [OnboardingWorker] Processing Sync Job');

    try {
        // Validation (Double check)
        const business = await prisma.business.findUnique({ where: { id: businessId } });
        if (!business) throw new Error(`Business ${businessId} not found`);

        // Execute Sync via DataSyncService (The Worker Logic)
        const result = await dataSyncService.syncBusiness(businessId);
        
        logger.info({ businessId, result }, '✅ [OnboardingWorker] Sync Completed Successfully');

        return result;

    } catch (error: any) {
        logger.error({ userId, businessId, error: error.message }, '❌ [OnboardingWorker] Job Failed');
        throw error; // Triggers BullMQ retry
    }
};
