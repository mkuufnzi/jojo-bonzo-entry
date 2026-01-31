import express from 'express';
import { WorkflowsController } from '../controllers/workflows.controller';
import { requireAuth } from '../middleware/session.middleware';

const router = express.Router();

router.use(requireAuth);

router.get('/', WorkflowsController.index);
router.post('/', WorkflowsController.create);
router.post('/:id/delete', WorkflowsController.delete);
router.post('/:id/test', WorkflowsController.test);

export default router;
