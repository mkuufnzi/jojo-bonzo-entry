import { Router } from 'express';
import { ServicesController } from '../controllers/services.controller';
import { PdfController } from '../controllers/pdf.controller';
import { requireAuth } from '../middleware/session.middleware';
import { requireServiceAccess } from '../middleware/service/global-guard.middleware';
import { requireFeature } from '../middleware/feature.middleware';
import { checkQuota } from '../middleware/quota.middleware';

const router = Router();

router.use(requireAuth);
import { resolveApp } from '../middleware/service/app-resolver.middleware';
router.use(resolveApp);

router.get('/', ServicesController.index);
router.post('/lead-capture', ServicesController.captureLead);
router.get('/html-to-pdf', requireServiceAccess('html-to-pdf'), ServicesController.showPdfConverter);
router.post('/:slug/toggle-app', ServicesController.toggleAppAccess);
router.post('/html-to-pdf/convert', requireServiceAccess('html-to-pdf'), checkQuota, PdfController.convertSession);
router.post('/html-to-pdf/preview', requireServiceAccess('html-to-pdf'), PdfController.previewSession);
// router.post('/html-to-pdf/generate-ai', requireServiceAccess('html-to-pdf'), checkQuota, ServicesController.generateWithAi); // Legacy - refactoring

import { aiRateLimiter } from '../middleware/rateLimit.middleware';

// AI Document Generator Routes
router.get('/ai-doc-generator', requireServiceAccess('ai-doc-generator'), ServicesController.showAiDocGenerator);
router.post('/ai-doc-generator/analyze', requireServiceAccess('ai-doc-generator'), requireFeature('ai_generation'), aiRateLimiter, ServicesController.analyzeWithAi);
router.post('/ai-doc-generator/draft', requireServiceAccess('ai-doc-generator'), requireFeature('ai_generation'), checkQuota, aiRateLimiter, ServicesController.draftWithAi);
router.post('/ai-doc-generator/format', requireServiceAccess('ai-doc-generator'), requireFeature('ai_generation'), checkQuota, aiRateLimiter, ServicesController.formatWithAi);
router.post('/ai-doc-generator/preview', requireServiceAccess('ai-doc-generator'), requireFeature('ai_generation'), PdfController.previewSession);
router.post('/ai-doc-generator/convert', requireServiceAccess('ai-doc-generator'), requireFeature('pdf_conversion'), checkQuota, PdfController.convertSession);
router.get('/ai-doc-generator/jobs/:jobId', requireServiceAccess('ai-doc-generator'), ServicesController.getJobStatus);

// Dynamic Action Route (e.g., /ai-doc-generator/refine)
router.post('/:slug/:action', requireServiceAccess(), ServicesController.handleDynamicAction);

// Dynamic route for other services (must be last)
router.get('/:slug', requireServiceAccess(), ServicesController.show);
router.post('/:slug/toggle-app', ServicesController.toggleAppAccess);

export default router;
