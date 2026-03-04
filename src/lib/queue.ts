import { Queue, Worker, QueueOptions, WorkerOptions, ConnectionOptions } from 'bullmq';
import { config } from '../config/env';
import { logger } from './logger';

/**
 * Queue Factory
 * Centralizes configuration for creating queues and workers.
 */

// Parse Redis URL for connection options
const parseRedisUrl = (url?: string): ConnectionOptions => {
    if (!url) return { host: 'localhost', port: 6379 }; // Default fallback

    try {
        const parsed = new URL(url);
        return {
            host: parsed.hostname,
            port: Number(parsed.port),
            password: parsed.password || undefined,
            username: parsed.username || undefined,
            // BullMQ requires this to be null to handle blocking commands correctly
            maxRetriesPerRequest: null, 
        };
    } catch (e) {
        logger.warn('Invalid REDIS_URL, falling back to defaults');
        return { host: 'localhost', port: 6379, maxRetriesPerRequest: null };
    }
};

export const connection = parseRedisUrl(config.REDIS_URL);

/**
 * Create a new Queue instance
 */
export const createQueue = (name: string, options?: QueueOptions) => {
    return new Queue(name, {
        connection,
        defaultJobOptions: {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 1000,
            },
            removeOnComplete: {
                age: 24 * 3600, // Keep logs for 24 hours
                count: 1000,    // Keep max 1000 jobs
            },
            removeOnFail: {
                age: 7 * 24 * 3600 // Keep failed logs for 7 days
            }
        },
        ...options,
    });
};

/**
 * Create a new Worker instance
 */
export const createWorker = (name: string, processor: any, options?: Omit<WorkerOptions, 'connection'>) => {
    return new Worker(name, processor, {
        connection,
        concurrency: options?.concurrency || 5, // Default concurrency
        ...options,
    });
};

// Queue Names Registry
export const QUEUES = {
    PDF_GENERATION: 'pdf-generation',
    AI_GENERATION: 'ai-generation',
    WEBHOOKS: 'webhooks',
    ONBOARDING_SYNC: 'onboarding-sync',
    REVENUE_ENGINE: 'revenue-engine',
    RECOVERY_ENGINE: 'recovery-engine'
} as const;
