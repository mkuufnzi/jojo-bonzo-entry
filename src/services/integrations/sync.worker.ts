
import prisma from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { IERPProvider, ERPDocument } from './providers/types';
import { webhookService } from '../webhook.service';
import { ZohoProvider } from './providers/zoho.provider';
import crypto from 'crypto';
import { workflowService } from '../workflow.service';
import { n8nPayloadFactory } from '../n8n/n8n-payload.factory';
import { OnboardingEventTypes } from '../../domain-events';
import { analyticsService } from '../analytics.service';

export class SyncWorker {
    
    /**
     * Synchronizes all active entities for a business
     * @param businessId 
     * @param options Optional filters { entities: { 'invoices': ['id1'] } }
     */
    async syncBusiness(businessId: string, options?: { filters?: Record<string, string[]> }): Promise<{ success: boolean, synced: number, errors: string[] }> {
        const business = await prisma.business.findUnique({
            where: { id: businessId }
        });

        if (!business) throw new Error('Business not found');

        const integration = await prisma.integration.findFirst({
            where: { businessId, status: 'connected' }
        });

        if (!integration) throw new Error('No connected integration found for this business');

        const provider = await this.getProvider(integration);
        // We sync more entities now
        
        // Accumulator for Unified Payload
        const masterData: Record<string, any[]> = {
            items: [],
            contacts: [],
            invoices: [],
            payments: [],
            salesorders: [],
            purchaseorders: [],
            estimates: [],
            accounts: [],
            bills: []
        };

        // Entities to sync
        const entities = ['invoices', 'estimates', 'salesorders', 'contacts', 'accounts', 'items', 'purchaseorders', 'bills', 'payments'];
        
        let totalSynced = 0;
        const errors: string[] = [];

        console.log(`[SyncWorker] Starting sync for business: ${businessId}`, options?.filters ? 'with filters' : 'full sync');
        
        for (const entity of entities) {
            try {
                const filterIds = options?.filters?.[entity];
                
                // Fetch & Persist (internal syncEntity already does upsert)
                // We need syncEntity to RETURN the docs so we can accumulate them
                const docs = await this.syncEntityAndReturnDocs(business, integration.id, integration.provider, provider, entity as any, filterIds);
                
                // Accumulate
                if (masterData[entity]) {
                    masterData[entity] = docs;
                }

                console.log(`[SyncWorker] Entity ${entity} synced: ${docs.length} items`);
                totalSynced += docs.length;

            } catch (e: any) {
                if (e.message.includes('is not a function')) {
                    console.log(`[SyncWorker] Provider ${integration.provider} does not support entity ${entity}. Skipping.`);
                    continue;
                }
                console.error(`[SyncWorker] Entity Sync Failed: ${entity}`, e.message);
                logger.error({ businessId, entity, error: e.message }, 'Entity Sync Failed');
                errors.push(`${entity}: ${e.message}`);
            }
        }

        // --- FINAL UNIFIED TRIGGER ---
        if (integration.provider !== 'manual' && totalSynced > 0) {
            try {
                const context = {
                    serviceId: 'transactional-branding',
                    serviceTenantId: businessId,
                    appId: 'system-sync',
                    requestId: `sync_${businessId.substring(0, 8)}_${Date.now()}`
                };

                // Fetch Business Owner for Floovioo ID
                const owner = await prisma.user.findFirst({
                    where: { businessId: business.id, role: 'OWNER' }
                });

                if (!owner) {
                    logger.warn({ businessId }, 'No OWNER found for business during sync. Using businessId as fallback for tracing.');
                }
                
                // UUID Enforcement: If no owner, we MUST use a valid UUID. BusinessID is a UUID.
                const flooviooId = owner?.id || business.id;

                const unifiedPayload = n8nPayloadFactory.createUnifiedPayload(
                    masterData as any, 
                    business, 
                    integration,
                    flooviooId, 
                    context
                );

                await webhookService.sendTrigger('transactional-branding', OnboardingEventTypes.DATA_SYNC, unifiedPayload);
                
                // Log Master Event
                await analyticsService.logEvent({
                    businessId,
                    type: OnboardingEventTypes.DATA_SYNC,
                    amount: totalSynced, 
                    metadata: { provider: integration.provider, mode: 'unified' }
                });

                console.log(`[SyncWorker] Sent UNIFIED Webhook (Size: ${totalSynced} items across all types)`);

            } catch (e: any) {
                logger.error({ error: e.message }, 'Failed to send unified payload');
            }
        }

        // Update Business Onboarding Progress
        await (prisma as any).business.update({
             where: { id: businessId },
             data: { 
                 onboardingStatus: 'IN_PROGRESS', 
                 currentOnboardingStep: 3 
             }
        });
        
        try {
            await analyticsService.triggerRecalculation(businessId);
        } catch (e) {
            logger.warn({ businessId }, 'Failed to trigger analytics recalculation');
        }

        console.log(`[SyncWorker] Sync complete for ${businessId}. Total synced: ${totalSynced}. Errors: ${errors.length}`);
        return { success: errors.length === 0, synced: totalSynced, errors };
    }

    private async getProvider(integration: any): Promise<IERPProvider> {
        const { ProviderRegistry } = await import('./providers');
        const provider = ProviderRegistry.createInstance(integration.provider);
        await provider.initialize(integration);
        return provider;
    }

    // Refactored to return docs instead of just count
    private async syncEntityAndReturnDocs(
        business: any, 
        integrationId: string, 
        providerSlug: string, 
        provider: IERPProvider, 
        entity: 'invoices' | 'estimates' | 'salesorders' | 'contacts' | 'accounts' | 'items' | 'purchaseorders' | 'bills' | 'payments', 
        filterIds?: string[]
    ): Promise<ERPDocument[]> {
        
        let docs: ERPDocument[] = [];
        
        switch (entity) {
            case 'invoices': docs = await provider.getInvoices(); break;
            case 'estimates': docs = await provider.getEstimates(); break;
            case 'salesorders': docs = await (provider as any).getSalesOrders(); break;
            case 'contacts': docs = await provider.getContacts(); break;
            case 'accounts': docs = await provider.getChartOfAccounts(); break;
            case 'items': docs = await (provider as any).getItems(); break;
            case 'purchaseorders': docs = await (provider as any).getPurchaseOrders(); break;
            case 'bills': docs = await (provider as any).getBills(); break;
            case 'payments': docs = await (provider as any).getPayments(); break;
        }

        if (filterIds && filterIds.length > 0) {
            docs = docs.filter(d => filterIds.includes(d.id));
        }

        const businessId = business.id;

        // Database Persistence
        for (const doc of docs) {
            const hash = crypto.createHash('md5').update(JSON.stringify(doc.rawData)).digest('hex');
             
            const normalizedData = {
                amount: doc.total,
                date: doc.date,
                status: doc.status,
                contactName: doc.contactName,
                externalId: doc.externalId
            };
            
            await (prisma as any).externalDocument.upsert({
                where: {
                    integrationId_externalId_type: {
                        integrationId,
                        externalId: doc.id,
                        type: doc.type
                    }
                },
                update: {
                    data: doc.rawData,
                    normalized: normalizedData as any,
                    hash,
                    syncedAt: new Date()
                },
                create: {
                    businessId,
                    integrationId,
                    externalId: doc.id,
                    type: doc.type,
                    data: doc.rawData,
                    normalized: normalizedData as any,
                    hash,
                    syncedAt: new Date()
                }
            });
            
            // Legacy individual webhook trigger removed to avoid duplication with unified payload
        }

        return docs;
    }
}

export const syncWorker = new SyncWorker();
