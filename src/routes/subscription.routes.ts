import { Router } from 'express';
import { SubscriptionController } from '../controllers/subscription.controller';
import { requireAuth } from '../middleware/session.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', SubscriptionController.index);
router.get('/plans', SubscriptionController.plans);
router.post('/upgrade', SubscriptionController.upgrade);
// API Keys
router.post('/keys/create', SubscriptionController.createApiKey);
router.post('/keys/:id/delete', SubscriptionController.deleteApiKey);

// Dev Tools
router.post('/seed', SubscriptionController.seedData);

export default router;
