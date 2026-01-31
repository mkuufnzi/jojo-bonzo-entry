import prisma from '../lib/prisma';
import { logger } from '../lib/logger';
import { webhookService } from './webhook.service';
import { n8nPayloadFactory } from './n8n/n8n-payload.factory';
import { OnboardingEventTypes } from '../domain-events';

export class DunningService {
    /**
     * Fetches invoices that are unpaid and overdue
     * @param businessId 
     */
    async getOverdueInvoices(businessId: string) {
        return await prisma.externalDocument.findMany({
            where: {
                businessId,
                type: 'invoice',
                normalized: {
                    path: ['status'],
                    equals: 'unpaid'
                }
            },
            orderBy: { syncedAt: 'desc' },
            take: 20
        });
    }

    /**
     * Triggers a branded followup action via n8n
     * @param userId User triggering the action (Owner)
     * @param businessId 
     * @param externalInvoiceId 
     */
    async triggerFollowup(userId: string, businessId: string, externalInvoiceId: string) {
        logger.info({ businessId, externalInvoiceId }, '[DunningService] Triggering followup');

        const invoice = await prisma.externalDocument.findUnique({
            where: { id: externalInvoiceId }
        });

        if (!invoice) throw new Error('Invoice not found');

        const business = await prisma.business.findUnique({
            where: { id: businessId }
        });

        if (!business) throw new Error('Business not found');

        // Create Dunning Action log
        const dunningAction = await prisma.dunningAction.create({
            data: {
                businessId,
                externalInvoiceId: (invoice.normalized as any)?.externalId || invoice.externalId,
                actionType: 'FOLLOWUP_EMAIL',
                status: 'pending',
                sentAt: new Date()
            }
        });

        try {
            const context = {
                serviceId: 'transactional-branding',
                serviceTenantId: businessId,
                appId: 'system-dunning',
                requestId: `dun_${businessId.substring(0, 8)}_${Date.now()}`
            };

            const payload = n8nPayloadFactory.createEventPayload('invoice_followup', {
                invoiceId: invoice.id,
                externalId: invoice.externalId,
                amount: (invoice.normalized as any)?.amount,
                contactName: (invoice.normalized as any)?.contactName,
                actionId: dunningAction.id,
                brandingConfig: (business.metadata as any)?.branding
            }, userId, context);

            await webhookService.sendTrigger('transactional-branding', 'invoice.overdue.followup', payload);

            await prisma.dunningAction.update({
                where: { id: dunningAction.id },
                data: { status: 'sent' }
            });

            return { success: true, actionId: dunningAction.id };
        } catch (error: any) {
            logger.error({ error: error.message, actionId: dunningAction.id }, 'Dunning trigger failed');
            await prisma.dunningAction.update({
                where: { id: dunningAction.id },
                data: { status: 'failed' }
            });
            throw error;
        }
    }
}

export const dunningService = new DunningService();
