import { Router } from 'express';
import { RecommendationController } from '../../controllers/recommendation.controller';
import { requireServiceAccess } from '../../middleware/service/global-guard.middleware';
import { ServiceSlugs } from '../../types/service.types';

const router = Router();

// Recommendation API (Core Product)
// Protected by GlobalGuard for Enterprise Compliance
const recommendationGuard = requireServiceAccess(ServiceSlugs.RECOMMENDATIONS);

router.post('/document', recommendationGuard, RecommendationController.getRecommendations);

// Rule Management
router.get('/rules', recommendationGuard, RecommendationController.listRules);
router.post('/rules', recommendationGuard, RecommendationController.createRule);
router.put('/rules/:id', recommendationGuard, RecommendationController.updateRule);
router.delete('/rules/:id', recommendationGuard, RecommendationController.deleteRule);

// Analytics
router.get('/analytics/overview', recommendationGuard, RecommendationController.getAnalytics);

// Sync & Webhooks
router.post('/sync/products', recommendationGuard, RecommendationController.syncProducts);

// System
router.get('/status', recommendationGuard, RecommendationController.getStatus);

export default router;
