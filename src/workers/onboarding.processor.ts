import { Job } from 'bullmq';
import { logger } from '../lib/logger';
import prisma from '../lib/prisma';
import { ProviderRegistry } from '../services/integrations/providers';

interface OnboardingJobData {
    userId: string;
    provider: string;
}

export const onboardingProcessor = async (job: Job<OnboardingJobData>) => {
    const { userId, provider } = job.data;
    logger.info(`[OnboardingWorker] Starting sync for user ${userId}, provider ${provider}`);

    try {
        const user = await prisma.user.findUnique({
             where: { id: userId },
             select: { businessId: true }
        });

        if (!user?.businessId) {
            throw new Error(`Business not found for user ${userId}`);
        }

        const { syncWorker } = await import('../services/integrations/sync.worker');
        
        // Use the centralized syncWorker for consistent logic
        const result = await syncWorker.syncBusiness(user.businessId);
        
        logger.info(`[OnboardingWorker] Sync complete for business ${user.businessId}. Result: ${JSON.stringify(result)}`);

        return result;

    } catch (error: any) {
        logger.error(`[OnboardingWorker] Failed: ${error.message}`);
        throw error;
    }
};
