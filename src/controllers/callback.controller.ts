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
                    source: source || 'n8n_auto'
                }
            });

            logger.info({ templateId: template.id }, '✅ [Callback] Template Saved');
            return res.json({ success: true, id: template.id });

        } catch (error: any) {
            logger.error({ error: error.message }, '❌ [Callback] Failed to save template');
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    /**
     * Receive Completion callback from N8n Branding Workflow
     * Endpoint: POST /api/callbacks/n8n/transactional-complete
     */
    static async transactionalComplete(req: Request, res: Response) {
        const { flooviooId, status, pdfUrl, error: externalError, html } = req.body;

        logger.info({ flooviooId, status }, '📥 [Callback] Received Transactional Complete from n8n');

        if (!flooviooId) {
            return res.status(400).json({ error: 'Missing required field: flooviooId' });
        }

        try {
            // 1. Find the pending ProcessedDocument
            const doc = await prisma.processedDocument.findFirst({
                where: { flooviooId }
            });

            if (!doc) {
                logger.warn({ flooviooId }, '⚠️ [Callback] ProcessedDocument not found for callback');
                return res.status(404).json({ error: 'Document not found' });
            }

            // 2. Calculate final duration
            const duration = doc.createdAt ? Date.now() - new Date(doc.createdAt).getTime() : 0;

            // 3. Update ProcessedDocument status
            await prisma.processedDocument.update({
                where: { id: doc.id },
                data: {
                    status: status === 'success' ? 'completed' : 'failed',
                    brandedUrl: pdfUrl || (status === 'success' ? doc.brandedUrl : null),
                    errorMessage: externalError || null,
                    processingTimeMs: duration,
                    updatedAt: new Date()
                }
            });

            // 4. Update UsageLog for Analytics & Billing (Sync State)
            if (status === 'success') {
                // Find associated usage log by searching inside the JSON metadata field
                const logs = await prisma.usageLog.findMany({
                   where: { 
                       metadata: { 
                           contains: flooviooId
                       }
                   },
                   orderBy: { createdAt: 'desc' },
                   take: 1
                });
                
                if (logs.length > 0) {
                    const log = logs[0];
                    const existingMetadata = (log.metadata as any) || {};

                    await prisma.usageLog.update({
                        where: { id: log.id },
                        data: {
                            status: 'success',
                            duration: duration,
                            metadata: {
                                ...existingMetadata,
                                brandedUrl: pdfUrl || existingMetadata.brandedUrl,
                                asyncCompleted: true,
                                completedAt: new Date().toISOString()
                            }
                        }
                    });
                    logger.info({ logId: log.id }, '✅ [Callback] UsageLog updated successfully');
                } else {
                    logger.warn({ flooviooId }, '⚠️ [Callback] No matching UsageLog found for async completion');
                }
            }

            logger.info({ docId: doc.id, status }, '✅ [Callback] Transactional Document Processed');
            return res.json({ success: true, id: doc.id });

        } catch (error: any) {
            logger.error({ error: error.message, stack: error.stack }, '❌ [Callback] Failed to process transactional complete');
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    }
}
