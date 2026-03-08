import { Request, Response } from 'express';
import { unifiedAnalyticsService } from './unified-analytics.service';

export class UnifiedAnalyticsController {

    /**
     * Resolve Business ID securely matching the rest of UnifiedData
     */
    private static resolveBusinessId(req: Request, res: Response): string | null {
        // Support API Key access (appContext) or Session access (res.locals.user)
        const businessId = (req as any).appContext?.businessId 
            || res.locals.user?.businessId 
            || (res.locals.business && res.locals.business.id);
            
        return businessId || null;
    }

    /**
     * GET /api/v1/unified-data/analytics/trend
     */
    static async getTrend(req: Request, res: Response) {
        try {
            const businessId = UnifiedAnalyticsController.resolveBusinessId(req, res);
            if (!businessId) {
                return res.status(401).json({ success: false, error: 'Unauthorized: Business context required' });
            }

            const days = parseInt(req.query.days as string) || 30;
            const data = await unifiedAnalyticsService.getRevenueTrend(businessId, days);
            
            res.json({ success: true, count: data.length, data });
        } catch (error: any) {
            console.error('[UnifiedAnalyticsController] Error in getTrend:', error);
            res.status(500).json({ success: false, error: 'Failed to retrieve revenue trend' });
        }
    }

    /**
     * GET /api/v1/unified-data/analytics/customers
     */
    static async getTopCustomers(req: Request, res: Response) {
        try {
            const businessId = UnifiedAnalyticsController.resolveBusinessId(req, res);
            if (!businessId) {
                return res.status(401).json({ success: false, error: 'Unauthorized: Business context required' });
            }

            const limit = parseInt(req.query.limit as string) || 5;
            const data = await unifiedAnalyticsService.getTopCustomers(businessId, limit);
            
            res.json({ success: true, count: data.length, data });
        } catch (error: any) {
            console.error('[UnifiedAnalyticsController] Error in getTopCustomers:', error);
            res.status(500).json({ success: false, error: 'Failed to retrieve top customers' });
        }
    }

    /**
     * GET /api/v1/unified-data/analytics/sources
     */
    static async getSalesBySource(req: Request, res: Response) {
        try {
            const businessId = UnifiedAnalyticsController.resolveBusinessId(req, res);
            if (!businessId) {
                return res.status(401).json({ success: false, error: 'Unauthorized: Business context required' });
            }

            const data = await unifiedAnalyticsService.getSalesBySource(businessId);
            
            res.json({ success: true, count: data.length, data });
        } catch (error: any) {
            console.error('[UnifiedAnalyticsController] Error in getSalesBySource:', error);
            res.status(500).json({ success: false, error: 'Failed to retrieve sales by source' });
        }
    }
}
