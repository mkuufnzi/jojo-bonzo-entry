import prisma from '../../lib/prisma';

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

export interface DateRange {
    startDate: Date;
    endDate: Date;
}

export interface RevenueOverview {
    today: number;
    thisWeek: number;
    thisMonth: number;
    allTime: number;
    documentCount: number;
    growth: {
        weekOverWeek: number;
        monthOverMonth: number;
    };
}

export interface ProviderBreakdown {
    provider: string;
    documentsProcessed: number;
    percentOfTotal: number;
}

export interface TrendDataPoint {
    date: string;
    documents: number;
}

export interface ProcessingStats {
    total: number;
    successful: number;
    failed: number;
    pending: number;
    successRate: number;
    avgProcessingTimeMs: number;
}

export interface DocumentTypeBreakdown {
    type: string;
    count: number;
    percentOfTotal: number;
}

export interface CustomerMetrics {
    userId: string;
    email: string;
    name: string | null;
    documentsProcessed: number;
    lastActivity: Date | null;
}

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

export class TransactionalAnalyticsService {
    
    // -------------------------------------------------------------------------
    // OVERVIEW METRICS
    // -------------------------------------------------------------------------

    /**
     * Get comprehensive document processing overview
     */
    async getRevenueOverview(): Promise<RevenueOverview> {
        const now = new Date();
        
        // Define date boundaries
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(todayStart);
        weekStart.setDate(weekStart.getDate() - 7);
        const monthStart = new Date(todayStart);
        monthStart.setMonth(monthStart.getMonth() - 1);
        const prevWeekStart = new Date(weekStart);
        prevWeekStart.setDate(prevWeekStart.getDate() - 7);
        const prevMonthStart = new Date(monthStart);
        prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);

        // Query document counts by period
        const [today, week, month, allTime, prevWeek, prevMonth] = await Promise.all([
            this.getDocCountForPeriod(todayStart, now),
            this.getDocCountForPeriod(weekStart, now),
            this.getDocCountForPeriod(monthStart, now),
            this.getDocCountForPeriod(new Date(2000, 0, 1), now),
            this.getDocCountForPeriod(prevWeekStart, weekStart),
            this.getDocCountForPeriod(prevMonthStart, monthStart)
        ]);

        // Calculate growth rates
        const weekOverWeek = prevWeek > 0 
            ? ((week - prevWeek) / prevWeek) * 100 
            : 0;
        const monthOverMonth = prevMonth > 0 
            ? ((month - prevMonth) / prevMonth) * 100 
            : 0;

        return {
            today,
            thisWeek: week,
            thisMonth: month,
            allTime,
            documentCount: allTime,
            growth: {
                weekOverWeek: Math.round(weekOverWeek * 10) / 10,
                monthOverMonth: Math.round(monthOverMonth * 10) / 10
            }
        };
    }

    /**
     * Get breakdown by ERP provider
     */
    async getByProvider(range: DateRange): Promise<ProviderBreakdown[]> {
        const results = await prisma.processedDocument.groupBy({
            by: ['provider'],
            where: {
                createdAt: { gte: range.startDate, lte: range.endDate },
                status: 'completed'
            },
            _count: { id: true }
        });

        const total = results.reduce((sum, r) => sum + (r._count?.id || 0), 0);

        return results.map(r => ({
            provider: r.provider,
            documentsProcessed: r._count?.id || 0,
            percentOfTotal: total > 0 
                ? Math.round(((r._count?.id || 0) / total) * 1000) / 10 
                : 0
        })).sort((a, b) => b.documentsProcessed - a.documentsProcessed);
    }

    /**
     * Get document trend data for charting
     */
    async getTrend(range: DateRange): Promise<TrendDataPoint[]> {
        const results = await prisma.$queryRaw<{period: string, count: bigint}[]>`
            SELECT 
                TO_CHAR("createdAt", 'YYYY-MM-DD') as period,
                COUNT(id) as count
            FROM "ProcessedDocument"
            WHERE "createdAt" >= ${range.startDate} 
              AND "createdAt" <= ${range.endDate}
              AND status = 'completed'
            GROUP BY period
            ORDER BY period ASC
        `;

        return results.map(r => ({
            date: r.period,
            documents: Number(r.count)
        }));
    }

    // -------------------------------------------------------------------------
    // PROCESSING METRICS
    // -------------------------------------------------------------------------

    /**
     * Get document processing statistics
     */
    async getProcessingStats(range: DateRange): Promise<ProcessingStats> {
        const [stats, avgTime] = await Promise.all([
            prisma.processedDocument.groupBy({
                by: ['status'],
                where: {
                    createdAt: { gte: range.startDate, lte: range.endDate }
                },
                _count: { _all: true }
            }),
            prisma.processedDocument.aggregate({
                where: {
                    createdAt: { gte: range.startDate, lte: range.endDate },
                    status: 'completed',
                    processingTimeMs: { not: null }
                },
                _avg: { processingTimeMs: true }
            })
        ]);

        const statusCounts = stats.reduce((acc, s) => {
            acc[s.status] = s._count?._all || 0;
            return acc;
        }, {} as Record<string, number>);

        const successful = statusCounts['completed'] || 0;
        const failed = statusCounts['failed'] || 0;
        const pending = statusCounts['pending'] || statusCounts['processing'] || 0;
        const total = successful + failed + pending;

        return {
            total,
            successful,
            failed,
            pending,
            successRate: total > 0 ? Math.round((successful / total) * 1000) / 10 : 0,
            avgProcessingTimeMs: avgTime._avg?.processingTimeMs || 0
        };
    }

    /**
     * Get document breakdown by resource type (Invoice, Estimate, etc.)
     */
    async getDocumentsByType(range: DateRange): Promise<DocumentTypeBreakdown[]> {
        const results = await prisma.processedDocument.groupBy({
            by: ['resourceType'],
            where: {
                createdAt: { gte: range.startDate, lte: range.endDate }
            },
            _count: { _all: true }
        });

        const total = results.reduce((sum, r) => sum + (r._count?._all || 0), 0);

        return results.map(r => ({
            type: r.resourceType || 'Unknown',
            count: r._count?._all || 0,
            percentOfTotal: total > 0 ? Math.round(((r._count?._all || 0) / total) * 1000) / 10 : 0
        })).sort((a, b) => b.count - a.count);
    }

    // -------------------------------------------------------------------------
    // CUSTOMER METRICS
    // -------------------------------------------------------------------------

    /**
     * Get top customers by document volume
     */
    async getTopCustomers(range: DateRange, limit: number = 10): Promise<CustomerMetrics[]> {
        const results = await prisma.$queryRaw<{
            userId: string,
            email: string,
            name: string | null,
            documentsProcessed: bigint,
            lastActivity: Date | null
        }[]>`
            SELECT 
                u.id as "userId",
                u.email,
                u.name,
                COUNT(pd.id) as "documentsProcessed",
                MAX(pd."createdAt") as "lastActivity"
            FROM "User" u
            JOIN "ProcessedDocument" pd ON pd."userId" = u.id
            WHERE pd."createdAt" >= ${range.startDate} 
              AND pd."createdAt" <= ${range.endDate}
            GROUP BY u.id, u.email, u.name
            ORDER BY "documentsProcessed" DESC
            LIMIT ${limit}
        `;

        return results.map(r => ({
            userId: r.userId,
            email: r.email,
            name: r.name,
            documentsProcessed: Number(r.documentsProcessed),
            lastActivity: r.lastActivity
        }));
    }

    // -------------------------------------------------------------------------
    // HELPER METHODS
    // -------------------------------------------------------------------------

    private async getDocCountForPeriod(start: Date, end: Date): Promise<number> {
        return prisma.processedDocument.count({
            where: {
                createdAt: { gte: start, lte: end },
                status: 'completed'
            }
        });
    }
}

// Export singleton instance
export const transactionalAnalyticsService = new TransactionalAnalyticsService();
