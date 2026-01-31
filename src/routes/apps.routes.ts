import { Router } from 'express';
import { AppsController } from '../controllers/apps.controller';
import { requireAuth } from '../middleware/session.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', AppsController.index);
router.post('/create', AppsController.store);
router.post('/regenerate-key', AppsController.regenerateKey);
router.post('/toggle-service', AppsController.toggleService);
router.post('/toggle-active', AppsController.toggleActive);
router.post('/delete', AppsController.destroy);

export default router;
