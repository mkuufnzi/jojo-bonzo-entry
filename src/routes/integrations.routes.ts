import express from 'express';
import { IntegrationController } from '../controllers/integration.controller';
// import { IntegrationsController } from '../controllers/integrations.controller'; // Likely deprecated or different file
import { requireAuth } from '../middleware/session.middleware';

const router = express.Router();

router.use(requireAuth);

// UI
router.get('/', IntegrationController.index);
router.get('/:provider', IntegrationController.showSettings);
router.post('/:provider/config', IntegrationController.saveConfig);
router.get('/:provider/preview', IntegrationController.previewData);

// Actions
router.post('/:provider/sync', IntegrationController.executeSync);
// router.get('/:provider/connect', IntegrationsController.connect); // Handled by /api/integrations/:slug/connect now
// router.post('/:id/disconnect', IntegrationsController.disconnect);

export default router;
