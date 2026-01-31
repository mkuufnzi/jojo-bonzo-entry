import { ServiceRepository } from '../../repositories/service.repository';
import { LogRepository } from '../../repositories/log.repository';
import { ToolStrategy, ToolContext, AsyncToolContext } from './tool.interface';
import { LocalStrategy } from './strategies/local.strategy';
import { HttpStrategy } from './strategies/http.strategy';
import { AsyncQueueStrategy } from './strategies/async-queue.strategy';
import { AppError } from '../../lib/AppError';
import { notificationService } from '../notification.service';
import { createQueue, QUEUES } from '../../lib/queue';

/**
 * ToolOrchestrator - Central Billing & Execution System
 * 
 * ALL billable service operations MUST flow through this orchestrator to ensure:
 * - Centralized usage logging
 * - Consistent cost calculation from service.pricePerRequest
 * - Atomic quota management
 * - Webhook/notification triggers
 */
export class ToolOrchestrator {
    private serviceRepository: ServiceRepository;
    private logRepository: LogRepository;
    private strategies: Record<string, ToolStrategy>;
    private asyncStrategy: AsyncQueueStrategy;

    constructor() {
        this.serviceRepository = new ServiceRepository();
        this.logRepository = new LogRepository();
        this.asyncStrategy = new AsyncQueueStrategy();

        // Initialize Strategies
        this.strategies = {
            'local': new LocalStrategy(),
            'http_sync': new HttpStrategy(),
            'async_queue': this.asyncStrategy,
        };
    }

    /**
     * Execute a tool synchronously by its slug.
     * Use this for quick operations that complete within request lifecycle.
     */
    async executeTool(serviceSlug: string, payload: any, context: ToolContext): Promise<any> {
        const startTime = Date.now();
        let service;

        try {
            service = await this.serviceRepository.findBySlug(serviceSlug);
            if (!service) {
                throw new AppError(`Service not found: ${serviceSlug}`, 404);
            }

            if (!service.isActive) {
                throw new AppError(`Service is not active: ${serviceSlug}`, 403);
            }

            // Determine Execution Strategy
            const executionType = service.executionType || 'local';
            const strategy = this.strategies[executionType];

            if (!strategy) {
                throw new AppError(`Unknown execution type '${executionType}' for service ${serviceSlug}`, 500);
            }

            // Execute
            const result = await strategy.execute(service, payload, context);

            // Log Success
            await this.logExecution(
                context.userId,
                context.appId,
                service.id,
                `${serviceSlug}_sync`,
                this.getResourceType(serviceSlug),
                'success',
                200,
                Date.now() - startTime,
                service.pricePerRequest || 0,
                context.ipAddress,
                context.userAgent,
                undefined,
                (result && !Buffer.isBuffer(result)) ? result : undefined
            );

            // Notify Success
            notificationService.notifyUser(
                context.userId,
                'success',
                'Tool Execution Successful',
                `Successfully executed ${service.name}`,
                'toolSuccess'
            ).catch(() => {});

            return result;

        } catch (error: any) {
            // Log Failure
            if (service) {
                await this.logExecution(
                    context.userId,
                    context.appId,
                    service.id,
                    `${serviceSlug}_sync`,
                    this.getResourceType(serviceSlug),
                    'failed',
                    error.statusCode || 500,
                    Date.now() - startTime,
                    (service.pricePerRequest || 0) * 0.5, // Bill failed requests at 50%
                    context.ipAddress,
                    context.userAgent,
                    error.message
                );

                // Notify Failure
                notificationService.notifyUser(
                    context.userId,
                    'error',
                    'Tool Execution Failed',
                    `Failed to execute ${service.name}: ${error.message}`,
                    'toolFailure'
                ).catch(() => {});
            }
            throw error;
        }
    }

    /**
     * Submit an async job to the queue.
     * Use this for long-running operations that need background processing.
     * Returns immediately with a job ID for status polling.
     */
    async submitAsyncJob(serviceSlug: string, payload: any, context: ToolContext): Promise<{ jobId: string; service: any }> {
        const service = await this.serviceRepository.findBySlug(serviceSlug);
        
        if (!service) {
            throw new AppError(`Service not found: ${serviceSlug}`, 404);
        }

        if (!service.isActive) {
            throw new AppError(`Service is not active: ${serviceSlug}`, 403);
        }

        // Enqueue the job
        const job = await this.asyncStrategy.enqueue(service, payload, context);

        console.log(`[Orchestrator] Job enqueued: ${job.id} for service ${serviceSlug}`);

        return {
            jobId: job.id!,
            service: {
                id: service.id,
                slug: service.slug,
                name: service.name,
                pricePerRequest: service.pricePerRequest
            }
        };
    }

    /**
     * Called by workers when a job completes (success or failure).
     * This is the CENTRAL point for billing async jobs.
     */
    async onJobComplete(
        traceContext: AsyncToolContext,
        success: boolean,
        duration: number,
        result?: any,
        errorMessage?: string
    ): Promise<void> {
        const cost = success 
            ? (traceContext.pricePerRequest || 0)
            : (traceContext.pricePerRequest || 0) * 0.5;

        const action = success 
            ? `${traceContext.serviceSlug}_completed`
            : `${traceContext.serviceSlug}_failed`;

        await this.logExecution(
            traceContext.userId,
            traceContext.appId,
            traceContext.serviceId,
            action,
            this.getResourceType(traceContext.serviceSlug),
            success ? 'success' : 'failed',
            success ? 200 : 500,
            duration,
            cost,
            traceContext.ipAddress,
            traceContext.userAgent,
            errorMessage,
            result && typeof result === 'object' && !Buffer.isBuffer(result) ? result : undefined
        );

        // Notifications
        if (success) {
            notificationService.notifyUser(
                traceContext.userId,
                'success',
                `${traceContext.serviceName} Completed`,
                `Your ${traceContext.serviceName} job has completed successfully.`,
                'toolSuccess'
            ).catch(() => {});
        } else {
            notificationService.notifyUser(
                traceContext.userId,
                'error',
                `${traceContext.serviceName} Failed`,
                `Your ${traceContext.serviceName} job failed: ${errorMessage}`,
                'toolFailure'
            ).catch(() => {});
        }

        console.log(`[Orchestrator] Job ${success ? 'completed' : 'failed'}: ${traceContext.serviceSlug}, cost: ${cost}`);
    }

    /**
     * Get job status from queue
     */
    async getJobStatus(serviceSlug: string, jobId: string): Promise<{ status: string; result?: any; error?: string }> {
        const queueName = this.getQueueName(serviceSlug);
        const queue = createQueue(queueName);
        const job = await queue.getJob(jobId);

        if (!job) {
            return { status: 'not_found' };
        }

        const state = await job.getState();
        
        if (state === 'completed') {
            return { status: 'completed', result: job.returnvalue };
        } else if (state === 'failed') {
            return { status: 'failed', error: job.failedReason };
        } else {
            return { status: state };
        }
    }

    /**
     * Map service slugs to resource types for logging
     */
    private getResourceType(serviceSlug: string): string {
        switch (serviceSlug) {
            case 'html-to-pdf':
                return 'pdf';
            case 'ai-doc-generator':
                return 'ai_document';
            default:
                return 'tool_output';
        }
    }

    /**
     * Map service slugs to queue names
     */
    private getQueueName(serviceSlug: string): string {
        switch (serviceSlug) {
            case 'html-to-pdf':
                return QUEUES.PDF_GENERATION;
            case 'ai-doc-generator':
                return QUEUES.AI_GENERATION;
            default:
                return 'default-queue';
        }
    }

    /**
     * Core logging method - ALL usage logging goes through here
     */
    private async logExecution(
        userId: string,
        appId: string | undefined,
        serviceId: string,
        action: string,
        resourceType: string,
        status: 'success' | 'filtered' | 'failed',
        statusCode: number,
        duration: number,
        cost: number,
        ipAddress: string | undefined,
        userAgent?: string,
        errorMessage?: string,
        metadata?: any
    ): Promise<void> {
        try {
            await this.logRepository.createUsageLog({
                userId,
                appId,
                serviceId,
                action,
                resourceType,
                status,
                statusCode,
                duration,
                cost,
                ipAddress,
                userAgent,
                errorMessage,
                metadata: metadata ? JSON.stringify(metadata) : undefined
            });
            
            console.log(`[Orchestrator] Logged: action=${action}, cost=${cost}, status=${status}`);
        } catch (logError) {
            console.error('[Orchestrator] Failed to log execution:', logError);
        }
    }
}

export const toolOrchestrator = new ToolOrchestrator();
