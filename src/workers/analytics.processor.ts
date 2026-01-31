import { Job } from 'bullmq';
import prisma from '../lib/prisma';
import { logger } from '../lib/logger';

export const analyticsProcessor = async (job: Job) => {
    const { businessId } = job.data;
    logger.info({ businessId }, '[AnalyticsWorker] Recalculating metrics');

    try {
        // 1. Calculate Total Revenue & Invoice Aging
        const invoices = await prisma.externalDocument.findMany({
            where: { businessId, type: 'invoice' }
        });

        let totalRevenue = 0;
        let pendingRevenue = 0;
        let aging: Record<string, number> = { '0-30': 0, '30-60': 0, '60+': 0 };
        let yetToSentCount = 0;

        invoices.forEach(inv => {
            const data = (inv.normalized as any) || {};
            const amount = data.amount || 0;
            const status = (data.status || 'unknown').toLowerCase();
            const date = new Date(data.date || inv.createdAt);
            const now = new Date();
            const diffDays = Math.ceil((now.getTime() - date.getTime()) / (1000 * 3600 * 24));

            if (['paid', 'completed', 'active'].includes(status)) {
                totalRevenue += amount;
            } else if (['sent', 'pending', 'unpaid', 'open'].includes(status)) {
                pendingRevenue += amount;
                if (diffDays <= 30) aging['0-30'] += amount;
                else if (diffDays <= 60) aging['30-60'] += amount;
                else aging['60+'] += amount;
            } else if (['draft', 'created'].includes(status)) {
                yetToSentCount++;
            }
        });

        // 2. Count Active Contacts & Sales Orders
        const [contactCount, salesOrderCount] = await Promise.all([
            prisma.contact.count({ where: { businessId } }),
            prisma.externalDocument.count({ where: { businessId, type: 'salesorder' } })
        ]);

        // 3. Persist Standard Metrics
        const metricKeys = [
            { key: 'total_revenue', value: totalRevenue, metadata: {} },
            { key: 'pending_revenue', value: pendingRevenue, metadata: { aging } },
            { key: 'yet_to_sent_count', value: yetToSentCount, metadata: {} },
            { key: 'contact_count', value: contactCount, metadata: {} },
            { key: 'sales_order_count', value: salesOrderCount, metadata: {} }
        ];

        for (const m of metricKeys) {
            await prisma.businessMetric.create({
                data: {
                    businessId,
                    metricKey: m.key,
                    value: m.value,
                    metadata: m.metadata
                }
            });
        }

        // 4. Run Data Scanner for Actionable Insights (Alerts)
        const { dataScannerService } = await import('../services/data-scanner.service');
        const insights = await dataScannerService.scanBusiness(businessId);
        
        for (const insight of insights) {
             await prisma.businessMetric.create({
                data: {
                    businessId,
                    metricKey: insight.type, // e.g. 'unsent_invoices'
                    value: insight.value,
                    metadata: {
                        count: insight.count,
                        currency: insight.currency,
                        description: insight.metadata?.description,
                        actionable: insight.actionable, 
                        scannedAt: new Date().toISOString()
                    }
                }
            });
        }

        logger.info({ businessId, totalRevenue, pendingRevenue }, '[AnalyticsWorker] Metrics updated successfully');
        return { success: true, revenue: totalRevenue };

    } catch (error: any) {
        logger.error({ error: error.message, businessId }, '[AnalyticsWorker] Failed');
        throw error;
    }
};
