import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { analyticsService } from '../services/analytics.service';
import { UsageService } from '../services/usage.service'; // Import Class

const usageService = new UsageService(); // Instantiate locally

export class BusinessAnalyticsController {

    /**
     * GET /dashboard/transactional/analytics
     * The Main "Must Have" Dashboard for Business Intelligence
     */
    static async showOverview(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = req.user?.id || req.session.userId!;
            const business = await prisma.business.findFirst({
                where: { users: { some: { id: userId } } },
                include: {
                    integrations: true,
                    brandingProfiles: { where: { isDefault: true } }
                }
            });

            if (!business) {
                return res.redirect('/onboarding/wizard?step=1');
            }

            // 1. Fetch Aggregated Metrics (Revenue, Leads, etc.)
            // We use the AnalyticsService helper to get the latest snapshot of each metric key
            const metrics = await analyticsService.getMetrics(business.id);

            // 2. Fetch "Insights" (Actionable Alerts)
            // These are stored as BusinessMetrics with specific keys like 'unsent_invoices'
            // The getMetrics() call above already includes them, but we might want to segregate them for the view
            const insights = [
                metrics['unsent_invoices'],
                metrics['pending_orders'],
                metrics['overdue_payments']
            ].filter(Boolean);

            // 3. Fetch Recent Activity (System Level)
            // This comes from UsageService (Platform Logs)
            const recentLogs = await usageService.getServiceLogs(userId, '', ['pdf', 'invoice'], 10);

            res.render('dashboard/services/transactional/analytics/overview', {
                user: res.locals.user,
                business,
                metrics,  // { total_revenue: { value: 100... }, unsent_invoices: { value: 5... } }
                insights, // Array of insight objects for the 'Alerts' section
                recentLogs,
                title: 'Business Analytics',
                activeService: 'transactional',
                activeTab: 'analytics',
                nonce: res.locals.nonce
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /dashboard/transactional/analytics/:integrationId
     * Per-Integration Detail View
     */
    static async showIntegrationDetail(req: Request, res: Response, next: NextFunction) {
        try {
            const { integrationId } = req.params;
            const userId = req.user?.id || req.session.userId!;
            
            const integration = await prisma.integration.findUnique({
                where: { id: integrationId }
            });

            if (!integration) return res.status(404).send('Integration not found');

            // Fetch metrics specific to this integration? 
            // Currently our BusinessMetric table is business-wide. 
            // Phase 2 Refinement: We might need to filter raw ExternalDocuments for this view 
            // until we add 'integrationId' to BusinessMetric (future optimization).
            
            const recentDocs = await prisma.externalDocument.findMany({
                where: { integrationId, businessId: integration.businessId },
                orderBy: { createdAt: 'desc' },
                take: 20
            });

            res.render('dashboard/services/transactional/analytics/detail', {
                user: res.locals.user,
                integration,
                recentDocs,
                title: `${integration.provider} Analytics`,
                activeService: 'transactional',
                activeTab: 'analytics',
                nonce: res.locals.nonce
            });

        } catch (error) {
             next(error);
        }
    }
}
