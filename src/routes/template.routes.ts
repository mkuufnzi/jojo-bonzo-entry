
import { Router } from 'express';
import { TemplateController } from '../controllers/template.controller';

const router = Router();

router.get('/', TemplateController.listTemplates);
router.get('/preview/:id', TemplateController.renderPreview);

export default router;
