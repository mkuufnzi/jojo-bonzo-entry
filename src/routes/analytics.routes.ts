import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller';
import { requireAuth } from '../middleware/session.middleware';
import { requireFeature } from '../middleware/feature.middleware';

const router = Router();

router.use(requireAuth);

// Protect all analytics routes with the "Advanced Analytics" feature gate
// Note: Basic analytics might be free, but "Advanced" implies a paid tier.
// Let's assume the main analytics page is "Advanced" for now, or we can split it.
// Based on the prompt "blocking 'Advanced Analytics' for Free users", 
// we should apply it to the route that shows the detailed dashboard.

router.get('/apps/:appId', requireFeature('Advanced Analytics'), AnalyticsController.showAppAnalytics);
router.get('/api/apps/:appId', requireFeature('Advanced Analytics'), AnalyticsController.getApiData);
// router.get('/apps/:appId', AnalyticsController.showAppAnalytics);
// router.get('/api/apps/:appId', AnalyticsController.getApiData);

export default router;
