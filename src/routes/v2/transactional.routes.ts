import express from 'express';
import { logger } from '../../lib/logger';
import { transactionalService } from '../../services/v2/transactional.service';
import { PreviewRequestSchema, SendRequestSchema } from '../../services/v2/schemas';

const router = express.Router();

/**
 * @route POST /api/v2/transactional/preview
 * @desc Generate a cached HTML preview of a document
 * @access Private
 */
router.post('/preview', async (req, res) => {
    try {
        // Strict Validation
        const body = PreviewRequestSchema.parse(req.body);
        
        // userId from middleware
        const userId = (req as any).user?.id || (req as any).session?.user?.id;
        
        const result = await transactionalService.preview(userId, body.invoiceId, body.templateId);
        res.json(result);
    } catch (e: any) {
        if(e.name === 'ZodError') {
             return res.status(400).json({ error: 'Validation Error', details: e.errors });
        }
        logger.error({ error: e.message, stack: e.stack }, 'Preview Failed');
        res.status(e.statusCode || 500).json({ error: e.message });
    }
});

/**
 * @route POST /api/v2/transactional/send
 * @desc Dispatch a document via a specific channel (email, webhook)
 * @access Private
 */
router.post('/send', async (req, res) => {
    try {
        const body = SendRequestSchema.parse(req.body);
        const userId = (req as any).user?.id || (req as any).session?.user?.id;

        const result = await transactionalService.send(userId, body.invoiceId, body.channel);
        res.json(result);
    } catch (e: any) {
        if(e.name === 'ZodError') {
             return res.status(400).json({ error: 'Validation Error', details: e.errors });
        }
         logger.error({ error: e.message }, 'Send Failed');
        res.status(e.statusCode || 500).json({ error: e.message });
    }
});

router.get('/history', async (req, res) => {
    res.json({ history: [] }); // TODO: Implement History lookup from WorkflowExecutionLog
});

export default router;
