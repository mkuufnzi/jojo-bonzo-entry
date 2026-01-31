import Redis from 'ioredis';
import { config } from '../config/env';
import { logger } from './logger';

/**
 * Redis Client Configuration
 * 
 * Used for:
 * - Session storage (persistent sessions across restarts)
 * - Rate limiting (persistent rate limits across instances)
 * - Caching (future use)
 * - Job queues (future: BullMQ for PDF generation)
 * 
 * Connection details:
 * - Host: 192.168.100.2
 * - Port: 10001 (mapped from container port 6379)
 * - No authentication required
 */

let redisClient: Redis | null = null;

/**
 * Get or create Redis client singleton
 * Returns null in development if REDIS_URL is not configured
 */
export const getRedisClient = (): Redis | null => {
    // If Redis URL is not configured, return null (will fall back to in-memory)
    if (!config.REDIS_URL) {
        logger.warn('REDIS_URL not configured. Using in-memory storage (sessions and rate limits will not persist).');
        return null;
    }

    // Return existing client if already initialized
    if (redisClient) {
        return redisClient;
    }

    logger.debug('Initializing Redis Client...');

    try {
        // Create new Redis client
        redisClient = new Redis(config.REDIS_URL, {
            // Retry strategy: exponential backoff
            retryStrategy(times) {
                const delay = Math.min(times * 50, 2000);
                logger.info({ times, delay }, 'Redis connection retry');
                return delay;
            },

            // Reconnect on error
            reconnectOnError(err) {
                const targetError = 'READONLY';
                if (err.message.includes(targetError)) {
                    // Only reconnect when the error contains "READONLY"
                    return true;
                }
                return false;
            },

            // Connection timeouts
            connectTimeout: 10000,
            maxRetriesPerRequest: 3,

            // Keep alive
            keepAlive: 30000,
        });

        // Event handlers for monitoring
        redisClient.on('connect', () => {
            logger.info('✅ Redis Client connected');
        });

        redisClient.on('ready', () => {
            logger.info('✅ Redis Client ready');
        });

        redisClient.on('error', (err) => {
            logger.error({ err: err.message }, '❌ Redis Client error');
        });

        redisClient.on('close', () => {
            logger.warn('⚠️  Redis Client connection closed');
        });

        redisClient.on('reconnecting', () => {
            logger.info('🔄 Redis Client reconnecting...');
        });

        return redisClient;
    } catch (error) {
        logger.error({ err: error }, 'Failed to initialize Redis client');
        return null;
    }
};

/**
 * Gracefully disconnect Redis on shutdown
 */
export const disconnectRedis = async (): Promise<void> => {
    if (redisClient) {
        logger.info('Disconnecting Redis Client...');
        await redisClient.quit();
        redisClient = null;
        logger.info('Redis Client disconnected');
    }
};

// Handle process shutdown
process.on('SIGINT', async () => {
    await disconnectRedis();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await disconnectRedis();
    process.exit(0);
});

/**
 * Check Redis health
 * Returns true if connected and responding to PING
 */
export const healthCheck = async (): Promise<boolean> => {
    if (!redisClient) return false;
    try {
        const response = await redisClient.ping();
        return response === 'PONG';
    } catch (e) {
        return false;
    }
};

export default getRedisClient;
