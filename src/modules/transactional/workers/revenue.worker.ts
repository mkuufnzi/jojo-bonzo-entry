
import { Job } from 'bullmq';
import { createWorker, QUEUES } from '../../../lib/queue';
import { logger } from '../../../lib/logger';
import { RevenueService } from '../revenue/revenue.service';

/**
 * Revenue Engine Worker
 * Handles async tasks like:
 * 1. Generating Smart Upsells for large batches of invoices.
 * 2. Pre-calculating recommendations.
 * 3. Calling LLMs for dynamic copy generation (which is slow).
 */
const revenueWorker = createWorker(QUEUES.REVENUE_ENGINE, async (job: Job) => {
    logger.info(`[RevenueWorker] Processing job ${job.id}: ${job.name}`);

    try {
        const service = new RevenueService();

        switch (job.name) {
            case 'generate-recommendations':
                const { businessId, items, totalAmount } = job.data;
                const offers = await service.getRecommendations({ businessId, items, totalAmount });
                logger.info({ businessId, offersCount: offers.length }, '[RevenueWorker] Recommendations generated');
                return offers;

            default:
                logger.warn(`[RevenueWorker] Unknown job name: ${job.name}`);
        }
    } catch (error) {
        logger.error({ err: error, jobId: job.id }, '[RevenueWorker] Job Failed');
        throw error;
    }
});

export default revenueWorker;
