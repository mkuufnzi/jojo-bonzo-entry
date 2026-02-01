import { Request, Response } from 'express';
import { transactionalAnalyticsService, DateRange } from '../../services/analytics/transactional-analytics.service';

/**
 * Controller for Transactional Branding Analytics
 * Part of Floovioo's multi-product analytics suite
 */
export class TransactionalAnalyticsController {

    /**
     * Main analytics dashboard
     * GET /admin/analytics/transactional
     */
    static async dashboard(req: Request, res: Response): Promise<void> {
        try {
            const range = TransactionalAnalyticsController.parseDateRange(req);
            
            // Fetch all metrics in parallel
            const [
                revenueOverview,
                processingStats,
                documentsByType,
                topCustomers,
                byProvider,
                trend
            ] = await Promise.all([
                transactionalAnalyticsService.getRevenueOverview(),
                transactionalAnalyticsService.getProcessingStats(range),
                transactionalAnalyticsService.getDocumentsByType(range),
                transactionalAnalyticsService.getTopCustomers(range, 5),
                transactionalAnalyticsService.getByProvider(range),
                transactionalAnalyticsService.getTrend(range)
            ]);

            res.render('admin/analytics/transactional', {
                user: res.locals.user,
                role: res.locals.role,
                permissions: res.locals.permissions,
                revenueOverview,
                processingStats,
                documentsByType,
                topCustomers,
                revenueByProvider: byProvider,
                revenueTrend: trend,
                dateRange: {
                    start: range.startDate.toISOString().split('T')[0],
                    end: range.endDate.toISOString().split('T')[0]
                }
            });
        } catch (error) {
            console.error('Transactional Analytics Error:', error);
            res.status(500).render('error', { 
                message: 'Failed to load analytics dashboard',
                error: process.env.NODE_ENV === 'development' ? error : {}
            });
        }
    }

    /**
     * Processing metrics API endpoint
     * GET /api/analytics/transactional/processing
     */
    static async processingApi(req: Request, res: Response): Promise<void> {
        try {
            const range = TransactionalAnalyticsController.parseDateRange(req);

            const [stats, byType] = await Promise.all([
                transactionalAnalyticsService.getProcessingStats(range),
                transactionalAnalyticsService.getDocumentsByType(range)
            ]);

            res.json({
                success: true,
                data: { stats, byType }
            });
        } catch (error) {
            console.error('Processing API Error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch processing data' });
        }
    }

    /**
     * Customer metrics API endpoint
     * GET /api/analytics/transactional/customers
     */
    static async customersApi(req: Request, res: Response): Promise<void> {
        try {
            const range = TransactionalAnalyticsController.parseDateRange(req);
            const limit = parseInt(req.query.limit as string) || 10;

            const customers = await transactionalAnalyticsService.getTopCustomers(range, limit);

            res.json({
                success: true,
                data: { customers }
            });
        } catch (error) {
            console.error('Customers API Error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch customer data' });
        }
    }

    /**
     * Parse date range from query params
     */
    private static parseDateRange(req: Request): DateRange {
        const now = new Date();
        let startDate: Date;
        let endDate = new Date(now);

        if (req.query.startDate && req.query.endDate) {
            startDate = new Date(req.query.startDate as string);
            endDate = new Date(req.query.endDate as string);
        } else {
            // Default to last 30 days
            startDate = new Date(now);
            startDate.setDate(startDate.getDate() - 30);
        }

        return { startDate, endDate };
    }
}
