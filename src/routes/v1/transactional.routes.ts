import { Router } from 'express';
import { TransactionalController } from '../../controllers/transactional.controller';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Transactional V1
 *   description: Enterprise Transactional Document Generation
 */

/**
 * @swagger
 * /api/v1/transactional/generate/{type}:
 *   post:
 *     summary: Generate a branded transactional document
 *     tags: [Transactional V1]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         schema:
 *           type: string
 *           enum: [invoice, receipt, quote, packing_slip, return_label]
 *         required: true
 *         description: Type of document schema to use
 *       - in: header
 *         name: Idempotency-Key
 *         schema:
 *           type: string
 *         required: false
 *         description: Unique key to prevent duplicate processing
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [data]
 *             properties:
 *               template_id: 
 *                 type: string
 *                 description: Optional template override (default: configured in dashboard)
 *               data: 
 *                 type: object
 *                 description: The raw data payload to render
 *     responses:
 *       200:
 *         description: The generated PDF document
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Invalid input data
 *       403:
 *         description: Quota exceeded or feature disabled
 *       409:
 *         description: Idempotency Conflict (Request already processed)
 */
router.post('/generate/:type', TransactionalController.generateDocument);

export default router;
