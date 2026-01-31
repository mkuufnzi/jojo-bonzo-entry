import prisma from '../lib/prisma';
import { logger } from '../lib/logger';

export interface LogAnalyticsEventData {
    businessId: string;
    userId?: string;
    type: string;
    amount?: number;
    currency?: string;
    metadata?: any;
}

export class AnalyticsService {
    
    /**
     * Log a raw analytics event
     */
    async logEvent(data: LogAnalyticsEventData) {
        try {
            return await prisma.analyticsEvent.create({
                data: {
                    businessId: data.businessId,
                    userId: data.userId,
                    type: data.type,
                    amount: data.amount,
                    currency: data.currency || 'USD',
                    metadata: data.metadata || {}
                }
            });
        } catch (error: any) {
            logger.error({ error: error.message, type: data.type }, '[AnalyticsService] Failed to log event');
        }
    }

    /**
     * Get aggregated metrics for a business
     */
    async getMetrics(businessId: string) {
        const metrics = await prisma.businessMetric.findMany({
            where: { businessId },
            orderBy: { calculatedAt: 'desc' },
            // In some Prisma versions distinct needs specific syntax, 
            // but for metrics we usually want the latest for each key.
        });

        // Manual pick latest for each key
        const latest = new Map<string, any>();
        metrics.forEach(m => {
            if (!latest.has(m.metricKey)) {
                latest.set(m.metricKey, {
                    value: m.value,
                    metadata: m.metadata,
                    calculatedAt: m.calculatedAt
                });
            }
        });

        return Object.fromEntries(latest);
    }

    /**
     * High-level helper for sales/leads
     */
    async trackSale(businessId: string, amount: number, metadata?: any) {
        return this.logEvent({ businessId, type: 'sale', amount, metadata });
    }

    async trackLead(businessId: string, metadata?: any) {
        return this.logEvent({ businessId, type: 'lead', metadata });
    }

    /**
     * Triggers a metric recalculation (via Worker)
     */
    async triggerRecalculation(businessId: string) {
        const { createQueue, QUEUES } = await import('../lib/queue');
        const queue = createQueue(QUEUES.REVENUE_ENGINE);
        await queue.add('calculate-metrics', { businessId });
    }
}

export const analyticsService = new AnalyticsService();
