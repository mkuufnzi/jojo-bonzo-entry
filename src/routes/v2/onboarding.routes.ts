import express from 'express';
import { onboardingService } from '../../services/onboarding.service';
import { logger } from '../../lib/logger';

const router = express.Router();

/**
 * @route POST /api/v2/onboarding/init
 * @desc Initialize onboarding for a specific product context
 */
/**
 * @route POST /api/v2/onboarding/init
 * @desc Initialize the Onboarding Sync process for a specific Product Context
 * @access Private
 */
router.post('/init', async (req, res) => {
    try {
        const { provider, product } = req.body;
        // userId injected by middleware
        const userId = (req as any).user?.id || (req as any).session?.user?.id;

        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        if (!provider || !product) return res.status(400).json({ error: 'Missing provider or product' });

        const result = await onboardingService.startSync(userId, provider, product);
        res.json(result);
    } catch (e: any) {
        logger.error({ error: e.message }, 'V2 Onboarding Init Failed');
        res.status(500).json({ error: e.message });
    }
});

/**
 * @route GET /api/v2/onboarding/status
 * @desc Get sync status
 */
/**
 * @route GET /api/v2/onboarding/status
 * @desc Get the status of the sync process
 * @access Private
 */
router.get('/status', async (req, res) => {
    try {
        const { provider } = req.query;
        const userId = (req as any).user?.id || (req as any).session?.user?.id;

        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        
        const status = await onboardingService.getSyncStatus(userId, provider as string);
        res.json(status);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
