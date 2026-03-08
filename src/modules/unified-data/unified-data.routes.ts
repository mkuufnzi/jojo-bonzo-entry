import { Router } from 'express';
import { unifiedDataController } from './unified-data.controller';
import { requireAuth } from '../../middleware/session.middleware'; 

const router = Router();

// Protect all unified data routes
router.use(requireAuth);

router.post('/sync', unifiedDataController.syncData.bind(unifiedDataController));
import { UnifiedAnalyticsController } from './unified-analytics.controller';

router.get('/invoices', unifiedDataController.getInvoices.bind(unifiedDataController));
router.get('/customers', unifiedDataController.getCustomers.bind(unifiedDataController));
router.get('/orders', unifiedDataController.getOrders.bind(unifiedDataController));
router.get('/payments', unifiedDataController.getPayments.bind(unifiedDataController));
router.get('/estimates', unifiedDataController.getEstimates.bind(unifiedDataController));
router.get('/stats', unifiedDataController.getStats.bind(unifiedDataController));
router.get('/inventory', unifiedDataController.getInventory.bind(unifiedDataController));

// Advanced Time-Series Analytics
router.get('/analytics/trend', UnifiedAnalyticsController.getTrend);
router.get('/analytics/customers', UnifiedAnalyticsController.getTopCustomers);
router.get('/analytics/sources', UnifiedAnalyticsController.getSalesBySource);

export default router;
