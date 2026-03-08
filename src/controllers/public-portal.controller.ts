import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { logger } from '../lib/logger';
import { LinkService } from '../services/link.service';
import { brandingService } from '../services/branding.service';
import { templateRegistry } from '../services/template-registry.service';
import { SmartInvoice } from '../models/smart-documents/smart-invoice.model';
import { analyticsService } from '../services/analytics.service';

/**
 * PublicPortalController
 * Handles the secure, high-end "Smart Document Portal" where users interact with Documents.
 */
export class PublicPortalController {
    
    /**
     * View the interactive document
     * GET /p/:token/view
     */
    static async view(req: Request, res: Response) {
        try {
            const { token } = req.params;
            const context = await PublicPortalController.resolveDocumentContext(token);

            if (!context) {
                return res.status(404).render('errors/404', { message: 'Document not found or invalid link' });
            }

            const { documentData, profile, theme, config, model } = context;
            const templateId = profile?.activeTemplateId || 'smart_invoice_v1';
            const manifest = templateRegistry.getById(templateId);

            if (!manifest || !manifest.viewPath) {
                return res.status(500).send('Template configuration error');
            }

            // Merge dynamic theme if not present on document
            const activeTheme = theme && Object.keys(theme).length > 0 ? theme : (profile?.themeData || {});

            // Render Document inside Portal Layout
            res.render(manifest.viewPath, {
                branding: {
                    themeData: activeTheme,
                    config: config && Object.keys(config).length > 0 ? config : (profile?.components || {}),
                    components: profile?.components || {},
                    model: model,
                    generateActionLink: (action: string, _extra: any = {}) => `/p/${token}/${action}`,
                    layout: 'layouts/portal-layout'
                },
                document: documentData,
                nonce: res.locals.nonce,
                layout: 'layouts/portal-layout'
            });

            // 4. Log Impressions for Recommendations
            const recommendations = model?.recommendations || [];
            if (recommendations.length > 0 && documentData.businessId) {
                // We use setImmediate to not block the response
                setImmediate(async () => {
                    for (const rec of recommendations) {
                        await analyticsService.logEvent({
                            businessId: documentData.businessId,
                            type: 'recommendation_impression',
                            metadata: {
                                docId: documentData.id,
                                sku: rec.sku,
                                source: 'portal_view'
                            }
                        });
                    }
                });
            }

            return;

        } catch (e: any) {
            logger.error({ error: e.message, stack: e.stack }, '❌ [PublicPortal] Error rendering document');
            return res.status(500).send('Internal Server Error');
        }
    }

    /**
     * Support Hub
     * GET /p/:token/support
     */
    static async support(req: Request, res: Response) {
        try {
            const { token } = req.params;
            const context = await PublicPortalController.resolveDocumentContext(token);

            if (!context) return res.status(404).send('Document not found');

            return res.render('portal/support', {
                branding: {
                    themeData: context.theme || context.profile?.themeData || {},
                    components: context.profile?.components || {}
                },
                document: context.documentData,
                nonce: res.locals.nonce,
                layout: 'layouts/portal-layout'
            });
        } catch (e: any) {
            return res.status(500).send(e.message);
        }
    }

    /**
     * Action Status Page
     * GET /p/:token/status
     */
    static async status(req: Request, res: Response) {
        try {
            const { token } = req.params;
            const context = await PublicPortalController.resolveDocumentContext(token);

            if (!context) return res.status(404).send('Document not found');

            const { action_result } = req.query;

            return res.render('portal/status', {
                branding: { themeData: context.theme || context.profile?.themeData || {} },
                document: context.documentData,
                status: action_result || 'success',
                nonce: res.locals.nonce,
                layout: 'layouts/portal-layout'
            });
        } catch (e: any) {
            return res.status(500).send(e.message);
        }
    }

    /**
     * Helper to resolve document and branding context
     */
    private static async resolveDocumentContext(token: string) {
        const linkService = new LinkService();
        const payload = linkService.verifyToken(token);
        if (!payload) return null;

        const docId = payload.d || payload.docId || payload.documentId;
        if (!docId) {
            logger.warn({ payload }, '⚠️ [PublicPortal] Token verified but missing Document ID keys');
            return null;
        }

        // 1. Resolve User Context
        const docHeader = await prisma.smartDocument.findUnique({
            where: { id: docId },
            select: { userId: true }
        }) || await prisma.processedDocument.findUnique({
            where: { id: docId },
            select: { userId: true }
        });

        if (!docHeader) return null;

        const userId = docHeader.userId;
        const profile = await brandingService.getProfile(userId);

        // 2. Full Resolution & Normalization
        let documentData: any = null;
        let theme: any = {};
        let config: any = {};
        let model: any = {};

        const smartDoc = await prisma.smartDocument.findUnique({
            where: { id: docId },
            include: { user: true }
        });

        if (smartDoc) {
            documentData = smartDoc;
            theme = smartDoc.theme || {};
            config = smartDoc.config || {};
            model = smartDoc.data;
        } else {
            const processedDoc = await prisma.processedDocument.findUnique({
                where: { id: docId },
                include: { user: true }
            });

            if (processedDoc) {
                documentData = processedDoc;
                const normalized = SmartInvoice.fromPayload(
                    docId, 
                    profile?.themeData || {}, 
                    profile?.components || {}, 
                    processedDoc.rawPayload || {}
                );
                const jsonDoc = normalized.toJSON();
                theme = jsonDoc.theme;
                config = jsonDoc.config;
                model = jsonDoc.data;
            }
        }

        if (!documentData) return null;

        return {
            docId,
            userId,
            profile,
            documentData,
            theme,
            config,
            model
        };
    }
}
