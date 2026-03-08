import { Router } from 'express';
import { TransactionalAnalyticsController } from '../controllers/transactional-analytics.controller';
import { requireAuth } from '../middleware/session.middleware';

const router = Router();

// Secure all analytics routes with session auth
router.use(requireAuth);

router.get('/volume', 
    TransactionalAnalyticsController.getVolumeTrend
);

router.get('/ratio', 
    TransactionalAnalyticsController.getSuccessRatio
);

router.get('/latency', 
    TransactionalAnalyticsController.getLatencyTrend
);

export default router;
