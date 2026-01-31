
import { Router } from 'express';
import { OnboardingController } from '../modules/onboarding/controllers/onboarding.controller';
import { requireAuth } from '../middleware/session.middleware';

const router = Router();

// Onboarding Status Check [GET /api/v2/onboarding/status]
// Requires Authentication (which injects user)
router.get('/status', requireAuth, OnboardingController.checkStatus);

export default router;
