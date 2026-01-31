
import { getRedisClient } from '../../../lib/redis';
import { logger } from '../../../lib/logger';

export class EventBus {
    
    /**
     * Publish a Domain Event to the V2 Event Bus (Redis Pub/Sub)
     */
    static async publish(eventName: string, payload: any) {
        try {
            const redis = getRedisClient();
            if (!redis) {
                logger.warn('[EventBus] Redis not available, event dropped: ' + eventName);
                return;
            }

            const message = JSON.stringify({
                event: eventName,
                timestamp: new Date().toISOString(),
                payload
            });

            // Publish to channel 'floovioo:events'
            await redis.publish('floovioo:events', message);
            logger.info(`[EventBus] Published: ${eventName}`);

        } catch (error) {
            logger.error({ err: error, eventName }, '[EventBus] Publish Failed');
        }
    }
}
