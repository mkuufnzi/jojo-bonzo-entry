import express from 'express';
import multer from 'multer';
import { BrandingController } from '../controllers/branding.controller';
import { validate } from '../middleware/validate.middleware';
import { updateSettingsSchema, saveConfigSchema, getPreviewSchema } from '../schemas/branding.schema';
import { logUsage } from '../middleware/logging.middleware';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Applying enterprise audit logging to ALL branding routes
router.use(logUsage);

// Settings & Main Editor (Dashboard Protected)
router.get('/', BrandingController.renderEditor);

// Feature Toggle / Config Updates - Validated
router.post('/settings', validate(updateSettingsSchema), BrandingController.updateSettings);
router.post('/config', validate(saveConfigSchema), BrandingController.saveConfig);

// Enterprise Template - Clone/Duplicate
router.post('/templates/clone', BrandingController.cloneTemplate);

// Preview System - Dual-mode (GET/POST)
router.get('/preview', validate(getPreviewSchema), BrandingController.getPreview);
router.post('/preview', validate(getPreviewSchema), BrandingController.getPreview);

// File Uploads
router.post('/upload-logo', upload.single('logo'), BrandingController.uploadLogo);

// AI & Enterprise Tools
router.post('/extract', upload.single('file'), BrandingController.extract);
router.post('/generate-template', BrandingController.generateTemplate);

// Template Source Editor
router.get('/template/:id/source', BrandingController.getTemplateSource);
router.put('/template/:id/source', BrandingController.updateTemplateSource);

export default router;
