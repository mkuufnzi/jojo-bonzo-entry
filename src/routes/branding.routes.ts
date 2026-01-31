import express, { Router } from 'express';
import multer from 'multer';
import { BrandingController } from '../controllers/branding.controller';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() }); // Store in memory for immediate processing

// Middleware to inject branding profile
router.use(async (req, res, next) => {
    try {
        // ... (existing middleware logic if any, or just pass through)
        // Actually, let's keep it simple.
        next();
    } catch (error) {
        next(error);
    }
});

// Settings & Preview
router.get('/', BrandingController.renderEditor);
router.post('/update', BrandingController.updateSettings);
router.get('/preview', BrandingController.getPreview);
router.post('/preview', BrandingController.getPreview);
// AI Extraction
// POST /api/branding/extract
router.post('/extract', upload.single('file'), (req, res) => BrandingController.extract(req, res));

// AI Template Generation
// POST /api/branding/generate-template
router.post('/generate-template', (req, res) => BrandingController.generateTemplate(req, res));

// Template Source Editor
router.get('/template/:id/source', BrandingController.getTemplateSource);
router.put('/template/:id/source', BrandingController.updateTemplateSource);

export default router;
