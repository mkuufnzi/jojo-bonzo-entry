import express from 'express';
import { designEngineService } from '../../services/design-engine.service';
import { logger } from '../../lib/logger';

const router = express.Router();

/**
 * @route POST /api/v2/design/render
 * @desc Transmute Data + Template into HTML
 * @access Private
 */
router.post('/render', async (req, res) => {
    try {
        const { templateId, data, type } = req.body;
        // userId injected by middleware
        const userId = (req as any).user?.id || (req as any).session?.user?.id;
        
        // 1. Compose Layout
        const layout = await designEngineService.composeLayout({ type: type || 'invoice', data, options: { templateId } }, userId);
        
        // 2. Render Document
        const result = await designEngineService.renderDocument({ layout }); // Assuming renderDocument takes { layout } or similar
        
        logger.info({ templateId, userId }, 'V2 Design Render Success');
        res.json(result);
    } catch (e: any) {
        logger.error({ error: e.message }, 'Design Render Failed');
        res.status(500).json({ error: e.message });
    }
});

router.get('/templates', async (req, res) => {
    res.json({ templates: [{ id: 'tpl_invoice_01', name: 'Clean Invoice (System)' }] });
});

export default router;
