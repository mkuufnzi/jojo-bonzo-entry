import express from 'express';
import { BrandingController } from '../controllers/branding.controller';

const router = express.Router();

// Public Smart Invoice Viewer
// /invoice/:id
router.get('/:id', BrandingController.renderPublicInvoice);

// Also support legacy/alternative URL structure if needed
router.get('/v/:token', BrandingController.renderPublicInvoice);

export default router;
