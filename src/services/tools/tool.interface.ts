import { Service } from '@prisma/client';

export interface ToolContext {
    userId: string;
    userEmail?: string;
    appId?: string;
    ipAddress?: string;
    userAgent?: string;
}

/**
 * Extended context passed through async job queues.
 * Contains all info needed for billing on job completion.
 */
export interface AsyncToolContext {
    userId: string;
    appId?: string;
    serviceSlug: string;
    serviceName: string;
    serviceId: string;
    pricePerRequest: number;
    ipAddress?: string;
    userAgent?: string;
    enqueuedAt: string;
}

export interface ToolStrategy {
    execute(service: Service, payload: any, context?: ToolContext): Promise<any>;
}

