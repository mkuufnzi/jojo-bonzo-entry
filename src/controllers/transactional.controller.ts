import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { logger } from '../lib/logger';
import type { ProcessedDocument, UsageLog } from '@prisma/client';

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

/** Parsed metadata from a UsageLog entry */
interface UsageLogMetadata {
    flooviooId?: string;
    externalId?: string;
    workflowId?: string;
    brandedUrl?: string;
    originalUrl?: string;
    upsells?: unknown[];
    offers?: unknown[];
    method?: string;
    [key: string]: unknown;
}

/** ProcessedDocument with associated user info */
interface DocumentWithUser extends ProcessedDocument {
    user: { name: string | null; email: string } | null;
}

// ────────────────────────────────────────────────────────────────
// Controller
// ────────────────────────────────────────────────────────────────

/**
 * TransactionalController handles the dashboard views for
 * Transactional Branding history and document details.
 *
 * All methods are static for direct Express route binding.
 * Authentication is enforced via session middleware upstream.
 */
export class TransactionalController {

    // ── Helpers ───────────────────────────────────────────────

    /**
     * Extract the authenticated user ID from the session.
     * @returns userId or null if not authenticated
     */
    private static getUserId(req: Request): string | null {
        return (req as any).session?.userId || null;
    }

    /**
     * Safely parse JSON metadata from a UsageLog entry.
     * Returns an empty object if parsing fails.
     */
    private static parseMetadata(usageLog: UsageLog | null): UsageLogMetadata {
        if (!usageLog?.metadata) return {};
        try {
            return JSON.parse(usageLog.metadata as string) as UsageLogMetadata;
        } catch {
            logger.warn('Failed to parse usageLog metadata');
            return {};
        }
    }

    // ── Routes ────────────────────────────────────────────────

    /**
     * Render the paginated branding history for the user's business.
     * GET /dashboard/transactional/history
     *
     * @query page - Page number (1-indexed, defaults to 1)
     */
    static async renderHistory(req: Request, res: Response): Promise<void> {
        logger.info({ url: req.originalUrl, query: req.query }, 'HIT: TransactionalController.renderHistory');
        try {
            const userId = TransactionalController.getUserId(req);
            if (!userId) { res.redirect('/auth/login'); return; }

            const page = parseInt(req.query.page as string, 10) || 1;
            const limit = 20;
            const skip = (page - 1) * limit;

            const user = await prisma.user.findUnique({
                where: { id: userId },
                include: { business: true },
            });

            if (!user?.businessId) {
                res.render('dashboard/transactional/history', {
                    title: 'Branding History',
                    activeService: 'transactional',
                    documents: [],
                    pagination: { current: 1, total: 0 },
                });
                return;
            }

            const [documents, total] = await Promise.all([
                prisma.processedDocument.findMany({
                    where: { businessId: user.businessId },
                    orderBy: { createdAt: 'desc' },
                    skip,
                    take: limit,
                    include: { user: { select: { name: true, email: true } } },
                }),
                prisma.processedDocument.count({
                    where: { businessId: user.businessId },
                }),
            ]);

            res.render('dashboard/transactional/history', {
                title: 'Branding History',
                activeService: 'transactional',
                documents,
                pagination: {
                    current: page,
                    total: Math.ceil(total / limit),
                },
            });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error({ error: message, userId: TransactionalController.getUserId(req) }, 'Error rendering transactional history');
            res.status(500).send('Error loading history');
        }
    }

    /**
     * Render the detail view of a single processed document.
     * GET /dashboard/transactional/details/:id
     *
     * Shows the document, associated usage log, and upsell data.
     *
     * @param id - ProcessedDocument ID
     */
    static async renderDetails(req: Request, res: Response): Promise<void> {
        try {
            const userId = TransactionalController.getUserId(req);
            if (!userId) { res.redirect('/auth/login'); return; }

            const { id } = req.params;

            const document: DocumentWithUser | null = await prisma.processedDocument.findUnique({
                where: { id },
                include: { user: { select: { name: true, email: true } } },
            }) as DocumentWithUser | null;

            if (!document) {
                res.status(404).render('errors/404', { message: 'Document not found' });
                return;
            }

            // Find associated usage log via flooviooId or resourceId
            const searchTerm = document.flooviooId || document.resourceId;
            const usageLog = searchTerm
                ? await prisma.usageLog.findFirst({
                      where: { metadata: { contains: searchTerm } },
                  })
                : null;

            const metadata = TransactionalController.parseMetadata(usageLog);

            res.render('dashboard/transactional/details', {
                title: `Document Details: ${document.resourceId}`,
                activeService: 'transactional',
                document,
                usageLog,
                metadata,
                originalUrl: metadata.originalUrl || '#',
                brandedUrl: document.brandedUrl || '#',
                upsells: metadata.upsells || metadata.offers || [],
            });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error({ error: message, docId: req.params.id }, 'Error rendering document details');
            res.status(500).send('Error loading document details');
        }
    }

    /**
     * Generate a new branded document by triggering the workflow engine.
     * POST /dashboard/transactional/generate/:type
     *
     * @param type - Document type (e.g. 'invoice', 'receipt')
     * @body  payload - Document data including provider and line items
     */
    static async generateDocument(req: Request, res: Response): Promise<void> {
        try {
            const userId = (req as any).session?.userId || (req as any).user?.id;
            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const { type } = req.params;
            const payload = req.body;

            const { workflowService } = await import('../services/workflow.service');
            const result = await workflowService.processWebhook(userId, {
                ...payload,
                resourceType: type,
                provider: payload.provider || 'manual',
            });

            res.json({
                success: true,
                message: 'Document generation initiated',
                result,
            });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error({ error: message }, 'Error in generateDocument');
            res.status(500).json({ error: message });
        }
    }

    /**
     * Render a "live" preview of a processed document using its stored rawPayload.
     * This is used as a fallback if n8n has not yet returned a brandedUrl.
     * GET /dashboard/transactional/history/:id/preview
     */
    static async renderPreview(req: Request, res: Response): Promise<void> {
        try {
            const userId = TransactionalController.getUserId(req);
            if (!userId) { 
                res.status(401).send('Unauthorized'); 
                return; 
            }

            const { id } = req.params;
            const document = await prisma.processedDocument.findUnique({
                where: { id },
                include: { business: true }
            });

            if (!document) {
                res.status(404).send('Document not found.');
                return;
            }

            // 2. We optionally allow rendering even if document.status === 'failed' so the user 
            // can still see the synchronous JIT output despite n8n timing out.

            const { templateGenerator } = await import('../services/template-generator.service');
            
            // 3. If rawPayload is missing (e.g. older historic/synced invoice before the field was added)
            // we cannot generate a smart preview.
            if (!document.rawPayload) {
                logger.warn({ id }, 'Cannot render JIT preview: rawPayload is missing from ProcessedDocument');
                res.status(404).send(`
                    <div style="font-family: sans-serif; padding: 2rem; color: #64748b; text-align: center;">
                        <h3 style="color: #334155;">Preview Data Unavailable</h3>
                        <p>This historical document was synced before the raw payload capture feature was enabled.</p>
                        <p>No document details are available to populate the template.</p>
                    </div>
                `);
                return;
            }
            
            const envelope: any = document.rawPayload;
            
            // Extract core payload (handles both DB structure 'data.trigger' and synthetic fallback 'trigger')
            const trigger = envelope.data?.trigger || envelope.trigger || {};
            
            // Normalize items array if already formatted (like in fallback), else extract from QBO 'Line'
            let items: any[] = [];
            const qboLines = trigger.Line || trigger._raw?.Line || [];
            
            if (Array.isArray(trigger.items) && trigger.items.length > 0) {
                items = trigger.items;
            } else if (Array.isArray(qboLines) && qboLines.length > 0) {
                items = qboLines
                    .filter((l: any) => l.DetailType === 'SalesItemLineDetail')
                    .map((l: any, i: number) => ({
                        id: i + 1,
                        name: l.SalesItemLineDetail?.ItemRef?.name || l.Description || 'Item',
                        description: l.Description || '',
                        sku: l.SalesItemLineDetail?.ItemRef?.value || 'SKU',
                        qty: l.SalesItemLineDetail?.Qty || 1,
                        price: l.SalesItemLineDetail?.UnitPrice || l.Amount || 0,
                        category: l.SalesItemLineDetail?.ItemAccountRef?.name || 'General',
                        img: '📦'
                    }));
            }

            // Normalize Customer details
            let customerDetails: any = null;
            const rawBody = trigger._raw || trigger;
            
            if (trigger.customer && trigger.customer.name) {
                customerDetails = trigger.customer;
            } else {                
                // Determine name
                const rawName = rawBody.CustomerRef?.name || rawBody.BillAddr?.Line1 || 'Valued Customer';
                
                // Determine email
                const rawEmail = rawBody.BillEmail?.Address || '';
                
                // Determine address
                const bAddr = rawBody.BillAddr || {};
                const addrParts = [bAddr.Line1, bAddr.Line2, bAddr.Line3, bAddr.Line4, bAddr.City, bAddr.Country, bAddr.PostalCode].filter(Boolean);
                const rawAddr = addrParts.length > 0 ? addrParts.join(', ') : 'Address not provided';
                
                customerDetails = {
                    name: rawName,
                    email: rawEmail,
                    address: rawAddr
                };
            }

            const payload = {
                documentId: document.id,
                ...trigger,
                items: items,
                customer: customerDetails,
                subtotal: items.reduce((sum: number, item: any) => sum + (item.price * item.qty), 0),
                total: rawBody.TotalAmt || 0,
                businessName: envelope.data?.brand?.business?.name || '',
                businessEmail: '',
                businessWebsite: envelope.data?.brand?.business?.website || '',
                smartContent: envelope.data?.smart_content || {}
            };

            logger.info({
                documentId: document.id,
                hasSmartContent: !!payload.smartContent,
                smartContentKeys: payload.smartContent ? Object.keys(payload.smartContent) : [],
                offersCount: payload.smartContent?.offers?.length || 0,
                recommendationsCount: payload.smartContent?.recommendations?.length || 0,
                itemsCount: items.length
            }, '📦 [TransactionalController.renderPreview] Payload built for template generation');

            const html = await templateGenerator.generateHtml(
                document.userId || userId,
                document.businessId,
                document.resourceType,
                payload,
                res.locals.nonce
            );

            res.render('dashboard/transactional/preview-layout', { html });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error({ error: message, docId: req.params.id }, 'Error rendering JIT preview');
            res.status(500).send(`Error generating live preview: ${message}`);
        }
    }

    /**
     * Handle interactions from Smart Widgets (e.g., Add to Order, Support CTA)
     * GET /dashboard/transactional/history/:id/interact
     */
    static async handleInteraction(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const { action, sku, channel } = req.query;

            const document = await prisma.processedDocument.findUnique({
                where: { id },
                include: { business: true }
            });

            if (!document) {
                res.status(404).send('Document not found');
                return;
            }

            // Log the interaction (Fire-and-forget for speed)
            logger.info({
                documentId: id,
                businessId: document.businessId,
                action,
                sku,
                channel
            }, '[Interaction] Smart Widget Clicked');

            // Optionally: prisma.analyticsEvent.create({...}) could go here 
            // once the Analytics module supports interaction events.

            // Action Routing Logic
            const businessUrl = document.business?.website || 'https://example.com';

            if (action === 'add_to_order' && sku) {
                // E.g. Redirect to a Shopify cart permalink or custom checkout flow.
                // For now, redirect to the business's main website with a simulated cart param
                res.redirect(`${businessUrl}/cart/add?sku=${sku}&ref=floovioo_smart_doc_${id}`);
                return;
            }

            if (action === 'support') {
                if (channel === 'email') {
                    // Redirect to a mailto link or support desk
                    res.redirect(`mailto:support@business.com?subject=Help with Order associated with Document ${document.resourceId}`);
                } else if (channel === 'chat') {
                    // Redirect to a live chat portal or contact page
                    res.redirect(`${businessUrl}/contact?ref=floovioo_smart_doc`);
                } else {
                    res.redirect(businessUrl);
                }
                return;
            }

            // Default fallback
            res.redirect(businessUrl);

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error({ error: message, docId: req.params.id }, 'Error handling widget interaction');
            res.status(500).send('An error occurred during redirect.');
        }
    }
}
