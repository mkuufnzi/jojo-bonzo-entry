import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller';
import { requireAuth } from '../middleware/session.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', NotificationController.index);
router.get('/count', NotificationController.getUnreadCount);
// Settings
router.get('/settings', NotificationController.settings);
router.post('/settings', NotificationController.updateSettings);

router.post('/mark-all-read', NotificationController.markAllRead);
router.post('/test', NotificationController.createTest);
router.post('/:id/read', NotificationController.markRead);

export default router;
