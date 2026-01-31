import { Router } from 'express';
import { PdfController } from '../controllers/pdf.controller';

const router = Router();

/**
 * @swagger
 * /jobs/{id}:
 *   get:
 *     summary: Get Job Status
 *     tags: [Jobs]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Job ID
 *     responses:
 *       200:
 *         description: Job status and progress
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [pending, active, completed, failed, delayed]
 *                 progress:
 *                   type: number
 *       404:
 *         description: Job not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id', PdfController.getJobStatus);

export default router;
