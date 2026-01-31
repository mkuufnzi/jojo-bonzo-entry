import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller';
import { IntegrationController } from '../controllers/integration.controller';
import { BusinessAnalyticsController } from '../controllers/business-analytics.controller';
import { requireSubscriptionValid, requireServiceAccess } from '../middleware/service.middleware';
import { requireAuth } from '../middleware/session.middleware';

const router = Router();

router.use(requireAuth);
router.get('/', DashboardController.index);

// Transactional Branding Service (Scoped)
const transactionalGuard = requireServiceAccess('transactional-branding');

router.get('/transactional', transactionalGuard, DashboardController.dashboardTransactional);
router.get('/transactional/templates', transactionalGuard, DashboardController.dashboardTransactionalTemplates);
router.get('/transactional/api', transactionalGuard, DashboardController.dashboardTransactionalApi);
router.get('/transactional/analytics', transactionalGuard, BusinessAnalyticsController.showOverview);
router.get('/transactional/analytics/:integrationId', BusinessAnalyticsController.showIntegrationDetail);
router.get('/retention', DashboardController.dashboardRetention);
router.get('/sales', DashboardController.dashboardSales);
router.get('/content', DashboardController.dashboardContent);
router.get('/tools/:slug', DashboardController.showTool);
router.get('/connections/:provider/preview', IntegrationController.previewData);
router.get('/connections/:provider', IntegrationController.showSettings);
router.post('/connections/:provider/config', IntegrationController.saveConfig);

// Core Dashboard Pages
router.get('/apps', DashboardController.apps);
router.get('/billing', DashboardController.billing);
router.get('/subscription', DashboardController.subscription);
router.get('/profile', DashboardController.profile);
router.get('/settings', DashboardController.settings);

export default router;
