import { Queue } from 'bullmq';
import { getRedisClient } from '../../lib/redis';
import { logger } from '../../lib/logger';

const redisClient = getRedisClient();

export const SYNC_QUEUE_NAME = 'integration-sync';

/**
 * Queue for background integration sync jobs
 */
export const syncQueue = redisClient ? new Queue(SYNC_QUEUE_NAME, {
    connection: redisClient,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
    }
}) : null;

if (!syncQueue) {
    logger.warn('[SyncQueue] Redis client not available. Background sync will not be available.');
} else {
    logger.info(`[SyncQueue] Initialized: ${SYNC_QUEUE_NAME}`);
}
