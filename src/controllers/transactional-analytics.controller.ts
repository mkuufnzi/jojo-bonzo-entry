import { Request, Response } from 'express';
import { transactionalAnalyticsService } from '../services/transactional-analytics.service';

export class TransactionalAnalyticsController {
    
    /**
     * Helper to resolve the authenticated user ID
     */
    private static resolveUserId(req: Request): string {
        const userId = (req.user as any)?.id || (req.session as any)?.userId;
        if (!userId) {
            throw new Error('User session invalid or expired.');
        }
        return userId;
    }

    /**
     * GET /api/v1/transactional/analytics/volume
     * Returns the 30-day document processing volume trend
     */
    static async getVolumeTrend(req: Request, res: Response) {
        try {
            const userId = TransactionalAnalyticsController.resolveUserId(req);
            const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;
            
            const trend = await transactionalAnalyticsService.getVolumeTrend(userId, days);
            
            res.status(200).json({
                success: true,
                data: trend
            });
        } catch (error: any) {
            console.error('[TransactionalAnalyticsController.getVolumeTrend] Error:', error);
            res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || 'Failed to fetch volume trend'
            });
        }
    }

    /**
     * GET /api/v1/transactional/analytics/ratio
     * Returns the success vs failure distribution
     */
    static async getSuccessRatio(req: Request, res: Response) {
        try {
            const userId = TransactionalAnalyticsController.resolveUserId(req);
            
            const ratio = await transactionalAnalyticsService.getSuccessRatio(userId);
            
            res.status(200).json({
                success: true,
                data: ratio
            });
        } catch (error: any) {
            console.error('[TransactionalAnalyticsController.getSuccessRatio] Error:', error);
            res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || 'Failed to fetch success ratio'
            });
        }
    }

    /**
     * GET /api/v1/transactional/analytics/latency
     * Returns the average processing duration over 14 days
     */
    static async getLatencyTrend(req: Request, res: Response) {
        try {
            const userId = TransactionalAnalyticsController.resolveUserId(req);
            const days = req.query.days ? parseInt(req.query.days as string, 10) : 14;
            
            const trend = await transactionalAnalyticsService.getLatencyTrend(userId, days);
            
            res.status(200).json({
                success: true,
                data: trend
            });
        } catch (error: any) {
            console.error('[TransactionalAnalyticsController.getLatencyTrend] Error:', error);
            res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || 'Failed to fetch latency trend'
            });
        }
    }
}
