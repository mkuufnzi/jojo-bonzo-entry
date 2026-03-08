import express from 'express';
import { PublicPortalController } from '../controllers/public-portal.controller';

const router = express.Router();

/**
 * Public Document Portal
 * Secure, branded pages for document interaction
 */

// View Document
router.get('/:token/view', PublicPortalController.view);

// Support Hub
router.get('/:token/support', PublicPortalController.support);

// Status Page
router.get('/:token/status', PublicPortalController.status);

export default router;
