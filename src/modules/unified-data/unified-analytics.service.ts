import prisma from '../../lib/prisma';
import { logger } from '../../lib/logger';

export class UnifiedAnalyticsService {
    
    /**
     * Get revenue trend over the last X days
     */
    async getRevenueTrend(businessId: string, days: number = 30) {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            // Fetch invoices from the last X days, using createdAt as a fallback if issuedDate is null
            const invoices = await prisma.unifiedInvoice.findMany({
                where: {
                    businessId,
                    OR: [
                        { issuedDate: { gte: startDate } },
                        { AND: [{ issuedDate: null }, { createdAt: { gte: startDate } }] }
                    ],
                    // Do not include voided/deleted invoices
                    status: { notIn: ['VOIDED', 'DELETED'] }
                },
                select: {
                    amount: true,
                    issuedDate: true,
                    createdAt: true
                }
            });

            // Group by date string (YYYY-MM-DD)
            const trendMap = new Map<string, number>();
            invoices.forEach((inv: any) => {
                const effectiveDate = inv.issuedDate || inv.createdAt;
                if (!effectiveDate) return;
                const d = new Date(effectiveDate);
                const dateStr = d.toISOString().split('T')[0];
                
                const current = trendMap.get(dateStr) || 0;
                trendMap.set(dateStr, current + (inv.amount || 0));
            });

            // Ensure all days perfectly exist in the map, even if 0
            const fullTrend: Array<{ date: string, revenue: number }> = [];
            for (let i = days - 1; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dateStr = d.toISOString().split('T')[0];
                
                fullTrend.push({
                    date: dateStr,
                    revenue: trendMap.get(dateStr) || 0
                });
            }

            return fullTrend;
        } catch (error: any) {
            logger.error({ error: error.message, businessId }, '[UnifiedAnalyticsService] Failed to generate revenue trend');
            return [];
        }
    }

    /**
     * Get top contributing customers by total revenue
     */
    async getTopCustomers(businessId: string, limit: number = 5) {
        try {
            const customers = await prisma.unifiedCustomer.findMany({
                where: { businessId },
                include: {
                    invoices: {
                        where: { status: { notIn: ['VOIDED', 'DELETED'] } },
                        select: { amount: true, balance: true }
                    }
                }
            });

            const enriched = customers.map((c: any) => {
                const totalRevenue = c.invoices.reduce((sum: number, inv: any) => sum + (inv.amount || 0), 0);
                const outstanding = c.invoices.reduce((sum: number, inv: any) => sum + (inv.balance || 0), 0);
                
                return {
                    id: c.id,
                    name: c.name,
                    email: c.email,
                    totalRevenue,
                    outstanding
                };
            });

            // Sort descending by revenue and take top 'limit'
            return enriched
                .sort((a: any, b: any) => b.totalRevenue - a.totalRevenue)
                .slice(0, limit);

        } catch (error: any) {
            logger.error({ error: error.message, businessId }, '[UnifiedAnalyticsService] Failed to fetch top customers');
            return [];
        }
    }

    /**
     * Distribute revenue by originating Source (e.g. QuickBooks vs Zoho)
     */
    async getSalesBySource(businessId: string) {
        try {
            const invoices = await prisma.unifiedInvoice.findMany({
                where: {
                    businessId,
                    status: { notIn: ['VOIDED', 'DELETED'] }
                },
                select: { amount: true, source: true }
            });

            const sourceMap = new Map<string, number>();
            invoices.forEach((inv: any) => {
                const src = inv.source || 'unknown';
                const current = sourceMap.get(src) || 0;
                sourceMap.set(src, current + (inv.amount || 0));
            });

            const result: Array<{ source: string, revenue: number }> = [];
            for (const [source, revenue] of sourceMap.entries()) {
                result.push({ source, revenue });
            }

            // Sort descending
            return result.sort((a, b) => b.revenue - a.revenue);

        } catch (error: any) {
            logger.error({ error: error.message, businessId }, '[UnifiedAnalyticsService] Failed to fetch sales by source');
            return [];
        }
    }
}

export const unifiedAnalyticsService = new UnifiedAnalyticsService();
