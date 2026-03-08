import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class TransactionalAnalyticsService {
    /**
     * Gets document processing volume trend over a specific number of days.
     */
    async getVolumeTrend(userId: string, days: number = 30) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - days);

        // Fetch raw logs grouped by day using Prisma, then map
        const logs = await prisma.usageLog.findMany({
            where: {
                userId,
                service: { slug: 'transactional-branding' },
                createdAt: {
                    gte: startDate,
                    lte: endDate
                }
            },
            select: {
                createdAt: true,
                status: true
            }
        });

        // Group by day manually since Prisma sqlite/postgres date_trunc isn't uniform without raw queries
        const dailyCounts: Record<string, { total: number; success: number }> = {};
        
        // Initialize all days to 0 to ensure continuity
        const d = new Date(startDate);
        while (d <= endDate) {
            const dateStr = d.toISOString().split('T')[0];
            dailyCounts[dateStr] = { total: 0, success: 0 };
            d.setDate(d.getDate() + 1);
        }

        logs.forEach(log => {
            const dateStr = log.createdAt.toISOString().split('T')[0];
            if (dailyCounts[dateStr]) {
                dailyCounts[dateStr].total += 1;
                if (log.status === 'success') {
                    dailyCounts[dateStr].success += 1;
                }
            }
        });

        const trend: Array<{ date: string; volume: number; successVolume: number }> = Object.keys(dailyCounts)
            .sort()
            .map(date => ({
                date,
                volume: dailyCounts[date].total,
                successVolume: dailyCounts[date].success
            }));

        return trend;
    }

    /**
     * Gets the Success vs Error ratio for processed documents.
     */
    async getSuccessRatio(userId: string) {
        // Group by status
        const groups = await prisma.usageLog.groupBy({
            by: ['status'],
            where: {
                userId,
                service: { slug: 'transactional-branding' }
            },
            _count: {
                _all: true
            }
        });

        const ratio = groups.map(g => ({
            status: g.status,
            count: g._count._all
        }));

        return ratio;
    }

    /**
     * Gets average processing latency trend over a specific number of days.
     */
    async getLatencyTrend(userId: string, days: number = 14) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - days);

        const logs = await prisma.usageLog.findMany({
            where: {
                userId,
                service: { slug: 'transactional-branding' },
                status: 'success', // Only measure latency for successful runs
                createdAt: { gte: startDate, lte: endDate }
            },
            select: {
                createdAt: true,
                duration: true
            }
        });

        const dailyLatency: Record<string, { sum: number; count: number }> = {};

        // Initialize timeline
        const d = new Date(startDate);
        while (d <= endDate) {
            const dateStr = d.toISOString().split('T')[0];
            dailyLatency[dateStr] = { sum: 0, count: 0 };
            d.setDate(d.getDate() + 1);
        }

        logs.forEach(log => {
            const dateStr = log.createdAt.toISOString().split('T')[0];
            if (dailyLatency[dateStr]) {
                dailyLatency[dateStr].sum += log.duration;
                dailyLatency[dateStr].count += 1;
            }
        });

        const trend: Array<{ date: string; avgLatencyMs: number }> = Object.keys(dailyLatency)
            .sort()
            .map(date => ({
                date,
                avgLatencyMs: dailyLatency[date].count > 0 
                    ? Math.round(dailyLatency[date].sum / dailyLatency[date].count) 
                    : 0
            }));

        return trend;
    }
}

export const transactionalAnalyticsService = new TransactionalAnalyticsService();
