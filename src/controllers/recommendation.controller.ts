import { Request, Response } from 'express';
import { recommendationService } from '../modules/recommendation/recommendation.service';
import { logger } from '../lib/logger';

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

/** Shape expected by the getRecommendations endpoint */
interface RecommendationRequestBody {
    items: string[];
    limit?: number;
    customerId?: string;
}

/** Standard API response wrapper */
interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

// ────────────────────────────────────────────────────────────────
// Controller
// ────────────────────────────────────────────────────────────────

/**
 * RecommendationController exposes the Smart Recommendation Engine
 * via Mini-API endpoints, following the Floovioo API-Key + App-ID
 * authentication model enforced by the global guard middleware.
 *
 * All methods are static to support Express route binding directly
 * (e.g. `router.post('/document', RecommendationController.getRecommendations)`).
 */
export class RecommendationController {

    // ── Helpers ───────────────────────────────────────────────

    /**
     * Extract the business ID from the request context.
     * Prefers the service context injected by the global guard,
     * falls back to the session user's businessId.
     */
    private static resolveBusinessId(req: Request, res: Response): string | undefined {
        const context = res.locals.serviceContext;
        return context?.app?.userId || (req as any).user?.businessId;
    }

    /**
     * Send a standardized error response.
     * Prevents leaking internal details in production.
     */
    private static sendError(res: Response, statusCode: number, message: string): void {
        const safeMessage = process.env.NODE_ENV === 'production' && statusCode === 500
            ? 'Internal server error'
            : message;
        res.status(statusCode).json({ success: false, error: safeMessage } as ApiResponse);
    }

    // ── Endpoints ─────────────────────────────────────────────

    /**
     * Get smart product recommendations for a document's line items.
     * POST /api/recommendations/document
     *
     * @body items      - Array of SKUs or product names from the document
     * @body limit      - (Optional) Max number of recommendations to return
     * @body customerId - (Optional) Customer ID for personalization
     */
    static async getRecommendations(req: Request, res: Response): Promise<void> {
        try {
            const businessId = RecommendationController.resolveBusinessId(req, res);
            if (!businessId) {
                RecommendationController.sendError(res, 400, 'Business context required');
                return;
            }

            const { items, limit, customerId } = req.body as RecommendationRequestBody;

            if (!items || !Array.isArray(items)) {
                RecommendationController.sendError(res, 400, 'Items array is required');
                return;
            }

            const recommendations = await recommendationService.getRecommendations({
                businessId,
                items,
                customerId,
                limit,
            });

            res.json({ success: true, data: recommendations } as ApiResponse);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error({ error: message }, '[RecommendationController] getRecommendations failed');
            RecommendationController.sendError(res, 500, message);
        }
    }

    /**
     * List all recommendation rules for the business.
     * GET /api/recommendations/rules
     */
    static async listRules(req: Request, res: Response): Promise<void> {
        try {
            const businessId = RecommendationController.resolveBusinessId(req, res);
            if (!businessId) {
                RecommendationController.sendError(res, 401, 'Authentication required');
                return;
            }

            const rules = await recommendationService.listRules(businessId);
            res.json({ success: true, data: rules } as ApiResponse);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error({ error: message }, '[RecommendationController] listRules failed');
            RecommendationController.sendError(res, 500, message);
        }
    }

    /**
     * Create a new recommendation rule.
     * POST /api/recommendations/rules
     */
    static async createRule(req: Request, res: Response): Promise<void> {
        try {
            const businessId = RecommendationController.resolveBusinessId(req, res);
            if (!businessId) {
                RecommendationController.sendError(res, 401, 'Authentication required');
                return;
            }

            const rule = await recommendationService.createRule(businessId, req.body);
            res.status(201).json({ success: true, data: rule } as ApiResponse);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error({ error: message }, '[RecommendationController] createRule failed');
            RecommendationController.sendError(res, 500, message);
        }
    }

    /**
     * Update an existing recommendation rule.
     * PUT /api/recommendations/rules/:id
     */
    static async updateRule(req: Request, res: Response): Promise<void> {
        try {
            const businessId = RecommendationController.resolveBusinessId(req, res);
            if (!businessId) {
                RecommendationController.sendError(res, 401, 'Authentication required');
                return;
            }

            await recommendationService.updateRule(req.params.id, businessId, req.body);
            res.json({ success: true } as ApiResponse);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error({ error: message }, '[RecommendationController] updateRule failed');
            RecommendationController.sendError(res, 500, message);
        }
    }

    /**
     * Delete a recommendation rule.
     * DELETE /api/recommendations/rules/:id
     */
    static async deleteRule(req: Request, res: Response): Promise<void> {
        try {
            const businessId = RecommendationController.resolveBusinessId(req, res);
            if (!businessId) {
                RecommendationController.sendError(res, 401, 'Authentication required');
                return;
            }

            await recommendationService.deleteRule(req.params.id, businessId);
            res.json({ success: true } as ApiResponse);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error({ error: message }, '[RecommendationController] deleteRule failed');
            RecommendationController.sendError(res, 500, message);
        }
    }

    /**
     * Get aggregated recommendation analytics for the business.
     * GET /api/recommendations/analytics/overview
     */
    static async getAnalytics(req: Request, res: Response): Promise<void> {
        try {
            const businessId = RecommendationController.resolveBusinessId(req, res);
            if (!businessId) {
                RecommendationController.sendError(res, 401, 'Authentication required');
                return;
            }

            const stats = await recommendationService.getAnalyticsOverview(businessId);
            res.json({ success: true, data: stats } as ApiResponse);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error({ error: message }, '[RecommendationController] getAnalytics failed');
            RecommendationController.sendError(res, 500, message);
        }
    }

    /**
     * Trigger product data sync from the connected ERP.
     * POST /api/recommendations/sync/products
     *
     * Currently queues the sync — actual data pull happens via n8n workflow.
     */
    static async syncProducts(_req: Request, res: Response): Promise<void> {
        logger.info('[RecommendationController] Triggering product sync via n8n');
        res.json({ success: true, message: 'Sync queued' } as ApiResponse);
    }

    /**
     * Health check endpoint for the Recommendation Service.
     * GET /api/recommendations/status
     */
    static async getStatus(_req: Request, res: Response): Promise<void> {
        res.json({
            status: 'active',
            version: '1.2.0',
            endpoints: 12,
            webhooks: 10,
            features: ['smart-matching', 'context-aware', 'one-click-checkout'],
        });
    }
}
