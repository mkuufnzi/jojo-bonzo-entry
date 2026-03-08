import { Router } from 'express';
import { IntegrationController } from '../../controllers/integration.controller';
import { requireServiceAccess } from '../../middleware/service.middleware';
import { ServiceSlugs } from '../../types/service.types';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: IntegrationHub
 *   description: Enterprise Hub for managing external ERP/CRM connectivity and data synchronization
 */

// All routes here require Service Access for 'floovioo_integration-hub'
// apiKeyAuth is already applied at the parent router level in index.ts
router.use(requireServiceAccess(ServiceSlugs.INTEGRATION_HUB));

/**
 * @swagger
 * /integration-hub/catalog:
 *   get:
 *     summary: Get available integrations catalog
 *     tags: [IntegrationHub]
 *     responses:
 *       200:
 *         description: Catalog of supported integrations
 */
router.get('/catalog', IntegrationController.getCatalog);

/**
 * @swagger
 * /integration-hub/connections:
 *   get:
 *     summary: List active business connections
 *     tags: [IntegrationHub]
 *     responses:
 *       200:
 *         description: List of connected integrations
 */
router.get('/connections', IntegrationController.index);

/**
 * @swagger
 * /integration-hub/{provider}/status:
 *   get:
 *     summary: Get sync status for a specific provider
 *     tags: [IntegrationHub]
 *     responses:
 *       200:
 *         description: Current sync status and health
 */
router.get('/:provider/status', IntegrationController.previewData);

/**
 * @swagger
 * /integration-hub/{provider}/sync:
 *   post:
 *     summary: Trigger manual data sync
 *     tags: [IntegrationHub]
 *     description: This is a billable operation.
 *     responses:
 *       200:
 *         description: Sync job initiated
 */
router.post('/:provider/sync', IntegrationController.executeSync);

/**
 * @swagger
 * /integration-hub/{provider}/disconnect:
 *   post:
 *     summary: Disconnect an integration
 *     tags: [IntegrationHub]
 *     responses:
 *       200:
 *         description: Integration disconnected
 */
router.post('/:provider/disconnect', IntegrationController.disconnect);

export default router;
