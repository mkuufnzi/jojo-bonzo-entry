import { Router } from 'express';
import { PdfController } from '../controllers/pdf.controller';
import { upload } from '../middleware/upload.middleware';
import { requireServiceAccess } from '../middleware/service/global-guard.middleware';
import { checkQuota } from '../middleware/quota.middleware';

const router = Router();

/**
 * @swagger
 * /pdf/convert:
 *   post:
 *     summary: Convert HTML to PDF
 *     tags: [PDF]
 *     security:
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: HTML file to convert
 *               html:
 *                 type: string
 *                 description: HTML string to convert (if file is not provided)
 *               appId:
 *                 type: string
 *                 description: Target App ID for attribution (Required for API usage)
 *     responses:
 *       200:
 *         description: The PDF file
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post('/convert', requireServiceAccess('html-to-pdf'), checkQuota, upload.single('file'), PdfController.convert);
router.get('/status/:id', PdfController.getJobStatus);

export default router;
