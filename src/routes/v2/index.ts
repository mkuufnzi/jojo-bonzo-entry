import express from 'express';
import onboardingRoutes from './onboarding.routes';
import transactionalRoutes from './transactional.routes';
import designRoutes from './design.routes';
import deliveryRoutes from './delivery.routes';

const router = express.Router();

router.get('/health', (req, res) => res.json({ status: 'V2 Router Active' }));

// Core Services
router.use('/onboarding', onboardingRoutes);
router.use('/design', designRoutes);
router.use('/delivery', deliveryRoutes);

// Product Routes
router.use('/transactional', transactionalRoutes);


export default router;
