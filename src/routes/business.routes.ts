import { Router } from 'express';
import { BusinessController } from '../controllers/business.controller';
import { IntegrationController } from '../controllers/integration.controller';
import { requireAuth } from '../middleware/session.middleware';
import { checkOnboarding } from '../middleware/check-onboarding.middleware';
import { requireServiceAccess } from '../middleware/service.middleware';
import { logoUpload, handleImageUploadError } from '../middleware/image-upload.middleware';

const router = Router();

// Wizard UI
// Note: We might NOT want checkOnboarding middleware here because we are IN onboarding
router.get('/wizard', requireAuth, BusinessController.showWizard);

// Onboarding API Routes (No service guard - these are setup routes)
router.post('/api/profile', requireAuth, BusinessController.saveProfile);
router.post('/api/business/branding', requireAuth, logoUpload, handleImageUploadError, BusinessController.saveBrandConfig);
router.post('/api/documents', requireAuth, BusinessController.saveDocumentConfig);
router.post('/api/complete', requireAuth, BusinessController.submitCompleteOnboarding);
router.post('/api/step', requireAuth, BusinessController.trackStep);

// Integration Routes (Read operations for onboarding)
router.get('/api/integrations', requireAuth, BusinessController.listIntegrations);
router.get('/api/integrations/catalog', requireAuth, IntegrationController.getCatalog);
router.get('/api/integrations/:slug/connect', requireAuth, IntegrationController.initiateConnection);
router.post('/api/integrations/:slug/import', requireAuth, IntegrationController.triggerImport);

// OAuth
router.get('/api/business/oauth/:provider', requireAuth, BusinessController.startOAuth);
router.get('/api/business/oauth/callback/:provider', requireAuth, BusinessController.handleOAuthCallback);

export default router;
