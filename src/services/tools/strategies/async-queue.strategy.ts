import { Service } from '@prisma/client';
import { ToolStrategy, ToolContext } from '../tool.interface';
import { createQueue, QUEUES } from '../../../lib/queue';
import { Job } from 'bullmq';

/**
 * AsyncQueueStrategy
 * Handles tool execution via BullMQ queues for long-running operations.
 * Jobs are queued and processed asynchronously by workers.
 */
export class AsyncQueueStrategy implements ToolStrategy {
    
    /**
     * Synchronous execute throws - use enqueue() for async jobs
     */
    async execute(service: Service, payload: any, context?: ToolContext): Promise<any> {
        throw new Error('AsyncQueueStrategy requires enqueue(). Use toolOrchestrator.submitAsyncJob() instead.');
    }

    /**
     * Enqueue a job for asynchronous processing
     */
    async enqueue(service: Service, payload: any, context: ToolContext): Promise<Job> {
        const queueName = this.getQueueName(service.slug);
        const queue = createQueue(queueName);
        
        const job = await queue.add(service.slug, {
            payload,
            traceContext: {
                userId: context.userId,
                appId: context.appId,
                serviceSlug: service.slug,
                serviceName: service.name,
                serviceId: service.id,
                pricePerRequest: service.pricePerRequest,
                ipAddress: context.ipAddress,
                userAgent: context.userAgent,
                enqueuedAt: new Date().toISOString()
            }
        }, {
            jobId: `${service.slug}-${context.userId}-${Date.now()}`,
        });

        return job;
    }

    /**
     * Map service slugs to queue names
     */
    private getQueueName(slug: string): string {
        switch (slug) {
            case 'html-to-pdf':
                return QUEUES.PDF_GENERATION;
            case 'ai-doc-generator':
                return QUEUES.AI_GENERATION;
            default:
                return 'default-queue';
        }
    }
}
