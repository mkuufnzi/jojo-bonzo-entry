import express from 'express';
import { logger } from '../../lib/logger';
import { deliveryService } from '../../services/v2/delivery.core';
import { DeliveryRequestSchema } from '../../services/v2/schemas';

const router = express.Router();

/**
 * @route POST /api/v2/delivery/dispatch
 * @desc Manually trigger a dispatch event or specific workflow
 * @access Private
 */
router.post('/dispatch', async (req, res) => {
    try {
        const userId = (req as any).user?.id || (req as any).session?.user?.id;
        
        // Validation (Inject userId from session to validate full schema)
        const body = DeliveryRequestSchema.parse({
            ...req.body,
            userId // Injected for Schema Validation if schema requires it, though schema usually validates input payload. 
                   // Actually Schema has 'userId', but user doesn't send it. 
                   // We should pick parts from body and inject userId.
        });

        const result = await deliveryService.dispatch(body);
        
        res.json(result);
    } catch (e: any) {
        if(e.name === 'ZodError') {
             return res.status(400).json({ error: 'Validation Error', details: e.errors });
        }
        res.status(500).json({ error: e.message });
    }
});

/**
 * @route GET /api/v2/delivery/status/:id
 * @desc Check the status of a specific dispatch
 * @access Private
 */
router.get('/status/:id', async (req, res) => {
    res.json({ status: 'delivered', deliveredAt: new Date() }); // TODO: Lookup ProcessedDocument
});

export default router;
