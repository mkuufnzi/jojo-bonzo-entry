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
router.get('/transactional/legacy-templates', transactionalGuard, DashboardController.dashboardTransactionalTemplatesLegacy);
router.get('/transactional/api', transactionalGuard, DashboardController.dashboardTransactionalApi);
router.get('/transactional/analytics', transactionalGuard, BusinessAnalyticsController.showOverview);
router.get('/transactional/analytics/:integrationId', BusinessAnalyticsController.showIntegrationDetail);

router.get('/unified', DashboardController.dashboardUnified);
router.get('/unified/customers', DashboardController.dashboardUnifiedCustomers);
router.get('/unified/customers/:id', DashboardController.dashboardUnifiedCustomerDetail);
router.get('/unified/transactions', DashboardController.dashboardUnifiedTransactions);
router.get('/unified/sources', DashboardController.dashboardUnifiedSources);
router.post('/unified/sync/:integrationId', DashboardController.syncIntegration);

router.get('/retention', DashboardController.dashboardRetention);
router.get('/retention/triggers', DashboardController.dashboardRetentionTriggers);
router.get('/sales', DashboardController.dashboardSales);
router.get('/content', DashboardController.dashboardContent);
router.get('/tools/:slug', DashboardController.showTool);
// Integrations (Platform management) moved to dedicated /dashboard/integrations path

// Core Dashboard Pages
router.get('/apps', DashboardController.apps);
router.get('/billing', DashboardController.billing);
router.get('/subscription', DashboardController.subscription);
router.get('/profile', DashboardController.profile);
router.get('/settings', DashboardController.settings);

import { BrandingController } from '../controllers/branding.controller';
import { TemplateController } from '../controllers/template.controller';

// ... existing imports ...

// Template Registry
router.get('/templates', TemplateController.listTemplates);
router.post('/templates/activate', TemplateController.activateTemplate);

export default router;
