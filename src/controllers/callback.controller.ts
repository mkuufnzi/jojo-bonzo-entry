import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { logger } from '../lib/logger';

export class CallbackController {

    /**
     * Receive Generated Template from n8n
     * Endpoint: POST /api/callbacks/n8n/template
     */
    static async receiveTemplate(req: Request, res: Response) {
        const { businessId, name, type, html, source } = req.body;

        logger.info({ businessId, type }, '📥 [Callback] Received Template from n8n');

        if (!businessId || !html) {
            return res.status(400).json({ error: 'Missing required fields: businessId, html' });
        }

        try {
            const template = await prisma.userTemplate.create({
                data: {
                    businessId,
                    name: name || `Imported Template ${new Date().toISOString()}`,
                    documentType: type || 'invoice',
                    htmlContent: html,
                    source: source || 'n8n_auto',
                    status: 'active'
                }
            });

            logger.info({ templateId: template.id }, '✅ [Callback] Template Saved');
            return res.json({ success: true, id: template.id });

        } catch (error: any) {
            logger.error({ error: error.message }, '❌ [Callback] Failed to save template');
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    }
}
