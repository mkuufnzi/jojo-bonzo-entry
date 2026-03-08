import { Request, Response } from 'express';
import { logger } from '../lib/logger';
import { linkService } from '../services/link.service';
import prisma from '../lib/prisma';
import { analyticsService } from '../services/analytics.service';

export class PublicInteractionController {
    /**
     * Entry point for all external document interactions
     * Route: GET /i/:token
     */
    static async handle(req: Request, res: Response) {
        const { token } = req.params;

        try {
            // 1. Verify and Decode Token
            const payload = linkService.verifyToken(token);
            if (!payload) {
                logger.warn({ token }, '❌ [PublicInteraction] Invalid or Tempered Token');
                return res.status(403).send('Invalid interaction link.');
            }

            const { d: docId, a: action, c: channel, s: sku } = payload;
            logger.info({ docId, action, channel, sku }, '🔍 [PublicInteraction] Decoded Token Payload');

            // 2. Fetch Document Context
            // We ensure docId is a string for the query, and we also try finding by resourceId 
            // if it looks like an external ID (though docId should ideally be our Prisma UUID).
            let document = await (prisma as any).processedDocument.findUnique({
                where: { id: String(docId) },
                include: { business: true }
            });

            if (!document) {
                logger.warn({ docId }, '⚠️ [PublicInteraction] Document not found by ID, attempting resourceId lookup...');
                document = await (prisma as any).processedDocument.findFirst({
                    where: { resourceId: String(docId) },
                    include: { business: true }
                });
            }

            if (!document) {
                logger.error({ docId, payload }, '❌ [PublicInteraction] Document not found via any identifier.');
                return res.status(404).send(`Document not found. (ID: ${docId})`);
            }

            // 3. Log Interaction for Analytics (Revenue Lift)
            logger.info({
                documentId: docId,
                businessId: document.businessId,
                action,
                sku,
                channel,
                source: 'external_document'
            }, '🖱️ [PublicInteraction] Action Triggered');

            // 4. Resolve Destination & Redirect to Secure Portal
            
            // Support Logic: Redirect to Portal Support Hub
            if (action === 'support') {
                return res.redirect(`/p/${token}/support`);
            }

            // Upsell / Add to Order: Process and then show Status
            if (action === 'add_to_order' && sku) {
                // Log conversion event
                await analyticsService.logEvent({
                    businessId: document.businessId,
                    type: 'recommendation_conversion',
                    amount: payload.p || 0, // Get price if available in token payload
                    metadata: {
                        docId,
                        sku,
                        channel,
                        source: 'external_document'
                    }
                });

                // Here we would normally trigger the order update logic
                // For now, redirect to status page with 'added' result
                return res.redirect(`/p/${token}/status?action_result=added`);
            }

            // View Action: Redirect to Portal View
            if (action === 'view') {
                return res.redirect(`/p/${token}/view`);
            }

            // Engagement Actions & Others
            const businessUrl = document.business?.website || 'https://example.com';
            
            if (action === 'loyalty_redeem') {
                return res.redirect(`${businessUrl}/loyalty?ref=floovioo_smart_doc_${docId}`);
            }
            if (action === 'review_prompt') {
                const ratingParam = payload.rating ? `&rating=${payload.rating}` : '';
                return res.redirect(`${businessUrl}/reviews/new?ref=floovioo_smart_doc_${docId}${ratingParam}`);
            }
            if (action === 'referral_click') {
                return res.redirect(`${businessUrl}/referral?ref=floovioo_smart_doc_${docId}`);
            }
            if (action === 'tutorial_view') {
                return res.redirect(`${businessUrl}/tutorials/${payload.tutorialId || ''}?ref=floovioo_smart_doc_${docId}`);
            }

            // Default fallback: Redirect to document view if possible, else business URL
            return res.redirect(`/p/${token}/view`);

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error({ error: message }, '❌ [PublicInteraction] Critical Failure');
            res.status(500).send('An error occurred.');
        }
    }
}
