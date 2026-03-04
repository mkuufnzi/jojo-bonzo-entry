import { Router } from 'express';
import { RecoveryController } from '../modules/recovery/recovery.controller';
import { requireAuth } from '../middleware/session.middleware';
import { requireServiceAccess } from '../middleware/service.middleware';
import { logUsage } from '../middleware/logging.middleware';

const router = Router();

// All recovery routes require full middleware chain:
// Auth → Service Access (subscription + app linkage) → Usage Logging
router.use(requireAuth);
// Apply debt collection service requirement strictly to all routes below
router.use(requireServiceAccess('floovioo_transactional_debt-collection'));
router.use(logUsage);

// Dashboard UI (renders EJS view)
router.get('/', RecoveryController.dashboard);
router.get('/onboarding', RecoveryController.showOnboarding);
router.get('/settings', RecoveryController.showSettings);
router.get('/sequences', RecoveryController.sequences);
router.get('/sessions', RecoveryController.sessions);
router.get('/sessions/:id', RecoveryController.sessionDetail);
router.get('/activity', RecoveryController.activity);
router.get('/unpaid', RecoveryController.unpaid);
router.get('/actions/:id', RecoveryController.actionDetail);
router.get('/customers/:id', RecoveryController.customerDetail);
router.get('/clusters', RecoveryController.clusters);
router.get('/webhooks', RecoveryController.webhookLog);

// API Endpoints (JSON)
router.post('/onboarding/step', RecoveryController.saveOnboardingStep);
router.get('/status', RecoveryController.getStatus);
router.post('/trigger', RecoveryController.triggerSync);
router.get('/jobs/:id', RecoveryController.getSyncJobStatus);
router.post('/settings', RecoveryController.updateSettings);
router.delete('/sequences/:id', RecoveryController.deleteSequence);
router.post('/customers/enroll', RecoveryController.enrollCustomers);
router.post('/invoices/:id/analyze', RecoveryController.analyzeInvoiceRisk);
router.post('/clusters/move', RecoveryController.moveCustomerCluster);

export default router;
