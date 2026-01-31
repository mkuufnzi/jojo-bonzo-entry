import { Router } from 'express';
import { ApiController } from '../controllers/api.controller';
import onboardingRoutes from './onboarding.routes';
import analyticsRoutes from './analytics.routes';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Meta
 *   description: Account, usage and service information
 */

/**
 * @swagger
 * /me:
 *   get:
 *     summary: Get current account profile
 *     tags: [Meta]
 *     security:
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Current profile details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 context: { type: string, enum: [user, app] }
 *                 user:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     email: { type: string }
 *                     name: { type: string }
 */
router.get('/me', ApiController.getMe);

/**
 * @swagger
 * /usage:
 *   get:
 *     summary: Get current monthly usage and quotas
 *     tags: [Meta]
 *     security:
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Detailed usage statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 plan: { type: object }
 *                 usage:
 *                   type: object
 *                   properties:
 *                     ai: { type: object }
 *                     pdf: { type: object }
 *                     total: { type: object }
 */
router.get('/usage', ApiController.getUsage);

/**
 * @swagger
 * /services:
 *   get:
 *     summary: List all active services and pricing
 *     tags: [Meta]
 *     security:
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of available services
 */
router.get('/services', ApiController.getServices);



router.get('/services', ApiController.getServices);

// Transactional Onboarding
router.use('/onboarding', onboardingRoutes);
router.use('/analytics', analyticsRoutes);

export default router;
