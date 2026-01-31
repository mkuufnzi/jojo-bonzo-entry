import { Router } from 'express';
import { ServicesController } from '../controllers/services.controller';
import { requireServiceAccess } from '../middleware/service.middleware';
import { checkQuota } from '../middleware/quota.middleware';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: AI Document Generator
 *   description: AI-powered document and HTML generation
 */

/**
 * @swagger
 * /ai/generate:
 *   post:
 *     summary: Generate HTML document using AI
 *     tags: [AI Document Generator]
 *     security:
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [prompt]
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: Main instructions for document generation
 *               documentType:
 *                 type: string
 *                 description: Type of document (e.g., Invoice, Report, CV)
 *                 default: General
 *               context:
 *                 type: string
 *                 description: Additional context or data for the AI
 *               tone:
 *                 type: string
 *                 description: Writing tone (e.g., Professional, Creative)
 *               theme:
 *                 type: string
 *                 description: Visual theme identifier
 *               appId:
 *                 type: string
 *                 description: Target App ID for attribution (Required for API usage)
 *     responses:
 *       200:
 *         description: Successfully generated HTML and metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 html: { type: string }
 *                 downloadLink: { type: string }
 *                 message: { type: string }
 *       403:
 *         description: Quota exceeded or service locked
 *       500:
 *         description: AI provider failure
 */
// Deprecated: The flow has moved to a 3-phase HITL process (Analyze -> Draft -> Format)
router.post('/generate', (req, res) => {
    res.status(410).json({
        error: 'Gone',
        message: 'This endpoint is deprecated. Please use the human-in-the-loop flow: /services/ai-doc-generator/analyze -> /draft -> /format'
    });
});

export default router;
