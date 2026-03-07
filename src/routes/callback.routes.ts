import { Router } from 'express';
import { CallbackController } from '../controllers/callback.controller';
import { RecoveryCallbackController } from '../controllers/recovery-callback.controller';
import { logger } from '../lib/logger';

const router = Router();

// Middleware to log incoming callbacks
router.use((req, res, next) => {
    logger.info({ path: req.path, method: req.method }, '📞 [Callback] Incoming Request');
    next();
});

// TODO: Add Signature Validation Middleware here

router.post('/n8n/template', CallbackController.receiveTemplate);
router.post('/n8n/transactional-complete', CallbackController.transactionalComplete);

// Smart Recovery Callbacks
router.post('/recovery/action', RecoveryCallbackController.receiveRecoveryAction);

export const callbackRoutes = router;
