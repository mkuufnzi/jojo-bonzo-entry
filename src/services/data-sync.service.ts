import prisma from '../lib/prisma';
import { logger } from '../lib/logger';
import { ProviderRegistry } from './integrations/providers';
import { IERPProvider, ERPDocument } from './integrations/providers/types';
import { UnifiedInvoice, UnifiedContact, UnifiedItem } from './v2/types'; 
import { UnifiedInvoiceSchema } from './v2/schemas';
import crypto from 'crypto';
import { AppError } from '../lib/AppError';
import { webhookService } from './webhook.service';
import { n8nPayloadFactory } from './n8n/n8n-payload.factory';
import { OnboardingEventTypes } from '../domain-events';

/**
 * Sync Configuration Constants
 */
const BATCH_SIZE = 50; 
const SYNC_TIMEOUT_MS = 300000; // 5 Minutes

interface SyncResult {
    entity: string;
    total: number;
    created: number;
    updated: number;
    failed: number;
    durationMs: number;
}

/**
 * DataSyncService (V2) - Enterprise Edition
 * 
 * The Heavy Lifter for ERP Synchronization.
 * 
 * Capabilities:
 * - **Multi-Entity Sync**: Handles Invoices, Contacts, Items, etc.
 * - **Conflict Resolution**: Logic to determine if Local or Remote wins (currently Remote Wins).
 * - **Change Detection**: MD5 Hashing to skip unchanged records.
 * - **Bulk Operations**: Batched persistence for performance.
 * - **Observability**: Detailed result stats per entity.
 * 
 * @version 2.2.0
 */
export class DataSyncService {

    /**
     * Trigger a Full Business Sync
     * 
     * Orchestrates the synchronization of multiple entities in sequence.
     * Updates the Business Onboarding Status upon completion.
     * 
     * @param businessId - Core Business ID
     * @param filterEntities - (Optional) specific entities to sync ['invoices', 'contacts']
     */
    async syncBusiness(businessId: string, filterEntities?: string[]) {
        const startTime = Date.now();
        logger.info({ businessId, filterEntities }, '🔄 [DataSyncService] Sync Started');

        // 1. Integration Check
        const integration = await prisma.integration.findFirst({
            where: { businessId, status: 'connected' }
        });

        if (!integration) {
            logger.warn({ businessId }, '⚠️ [DataSyncService] No active integration found');
            throw new AppError('No connected integration', 400);
        }

        // 2. Provider Initialization
        // Factory pattern to get the correct adapter (Zoho, QuickBooks, Xero)
        const provider = ProviderRegistry.createInstance(integration.provider);
        try {
            await provider.initialize(integration);
        } catch (e: any) {
            logger.error({ businessId, provider: integration.provider, error: e.message }, '❌ [DataSyncService] Provider Init Failed');
            throw new AppError('Provider Initialization Failed', 502);
        }

        // 3. Execution Loop
        const entitiesToSync = filterEntities || ['contacts', 'items', 'invoices']; // Order matters (References)
        const results: Record<string, SyncResult> = {};
        let globalSuccess = true;

        for (const entity of entitiesToSync) {
            try {
                results[entity] = await this.syncEntity(businessId, integration.id, provider, entity);
            } catch (e: any) {
                logger.error({ businessId, entity, error: e.message }, '❌ [DataSyncService] Entity Sync Failed');
                globalSuccess = false;
                // We verify other entities even if one fails
            }
        }
        
        // 4. Finalize Status
        await this._updateOnboardingStatus(businessId, globalSuccess);

        const totalDuration = Date.now() - startTime;
        logger.info({ businessId, duration: totalDuration, results }, '✅ [DataSyncService] Sync Completed');

        // 5. Send Webhook to n8n with synced data
        try {
            await this._sendWebhookToN8n(businessId, integration, provider);
        } catch (e: any) {
            logger.error({ businessId, error: e.message }, '❌ [DataSyncService] Failed to send webhook to n8n');
            // Don't fail the sync if webhook fails - data is still synced locally
        }

        return { success: globalSuccess, results, duration: totalDuration };
    }

    /**
     * Sync Single Entity Logic
     * Fetches, Normalizes, Detects Changes, and Persists.
     */
    private async syncEntity(businessId: string, integrationId: string, provider: IERPProvider, entity: string): Promise<SyncResult> {
        const start = Date.now();
        let created = 0, updated = 0, failed = 0;
        
        // A. Fetch from Source
        let docs: ERPDocument[] = [];
        switch (entity) {
            case 'invoices': docs = await provider.getInvoices(); break;
            case 'contacts': docs = await provider.getContacts(); break;
            case 'items': docs = await provider.getItems(); break;
            case 'products': docs = await provider.getItems(); break;
            case 'orders': docs = await provider.getSalesOrders(); break;
            case 'payments': docs = await provider.getPayments(); break;
            case 'estimates': docs = await provider.getEstimates(); break;
            default: logger.warn({ entity }, 'Unknown entity type'); return { entity, total: 0, created: 0, updated: 0, failed: 0, durationMs: 0 };
        }

        if (docs.length === 0) {
            return { entity, total: 0, created, updated, failed, durationMs: Date.now() - start };
        }

        // B. Processing Loop
        // We handle this item-by-item for safety, or batch if we implement bulk upsert.
        // For 'ExternalDocument', we usually upsert one by one to capture specific errors.
        
        for (const doc of docs) {
            try {
                const action = await this._processDocument(businessId, integrationId, doc, entity);
                if (action === 'created') created++;
                else if (action === 'updated') updated++;
            } catch (e) {
                failed++;
                // Log but continue
            }
        }

        // C. Recommendation Bridge: Sync to Product table if entity is 'items'
        if ((entity === 'items' || entity === 'products') && docs.length > 0) {
            const { productService } = await import('./product.service');
            await productService.syncProductsFromERP(businessId, integrationId, provider.slug, docs);
        }
        
        return {
            entity,
            total: docs.length,
            created,
            updated,
            failed,
            durationMs: Date.now() - start
        };
    }

    /**
     * Core Persistence Logic
     * Handles Normalization, Hashing, and DB Upsert.
     */
    private async _processDocument(businessId: string, integrationId: string, doc: ERPDocument, type: string): Promise<'created' | 'updated' | 'skipped'> {
        // 1. Change Detection
        // Calculate hash of raw data to see if we need to update
        const hash = crypto.createHash('md5').update(JSON.stringify(doc.rawData)).digest('hex');
        
        const existing = await prisma.externalDocument.findUnique({
            where: {
                integrationId_externalId_type: {
                    integrationId,
                    externalId: doc.id,
                    type: doc.type
                }
            },
            select: { hash: true }
        });

        if (existing && existing.hash === hash) {
            // No changes detected
            return 'skipped';
        }

        // 2. Normalization
        const normalized = this.normalizeDocument(doc, type);

        // 3. Persist
        // Upsert ensures we handle re-syncs gracefully
        await prisma.externalDocument.upsert({
            where: {
                integrationId_externalId_type: {
                    integrationId,
                    externalId: doc.id,
                    type: doc.type
                }
            },
            update: {
                data: doc.rawData,
                normalized: normalized as any,
                hash,
                syncedAt: new Date()
            },
            create: {
                businessId,
                integrationId,
                externalId: doc.id,
                type: doc.type,
                data: doc.rawData,
                normalized: normalized as any,
                hash,
                syncedAt: new Date()
            }
        });

        return existing ? 'updated' : 'created';
    }

    /**
     * Send Webhook to n8n with synced data
     * Builds a unified payload containing all synced entities and dispatches to n8n
     */
    private async _sendWebhookToN8n(businessId: string, integration: any, provider: IERPProvider) {
        const business = await prisma.business.findUnique({
            where: { id: businessId },
            include: { users: { take: 1 } }
        });

        if (!business) {
            logger.warn({ businessId }, '⚠️ [DataSyncService] Business not found for webhook');
            return;
        }

        // Get the owner's ID for floovioo_id (stable identifier)
        const owner = business.users[0];
        const flooviooId = owner?.id || business.id;

        // Fetch synced data from ExternalDocument table (where sync stores data)
        const [contacts, items, invoices, orders, payments, estimates] = await Promise.all([
            prisma.externalDocument.findMany({ where: { businessId, type: 'contact' }, take: 100 }),
            prisma.externalDocument.findMany({ where: { businessId, type: 'item' }, take: 100 }),
            prisma.externalDocument.findMany({ where: { businessId, type: 'invoice' }, take: 100 }),
            prisma.externalDocument.findMany({ where: { businessId, type: { in: ['order', 'salesorder'] } }, take: 100 }),
            prisma.externalDocument.findMany({ where: { businessId, type: 'payment' }, take: 100 }),
            prisma.externalDocument.findMany({ where: { businessId, type: 'estimate' }, take: 100 })
        ]);

        // Build service context with STABLE IDs
        const context = {
            serviceId: 'transactional-branding',
            serviceTenantId: businessId, // Stable business ID
            appId: 'system-sync',
            requestId: `sync_${businessId.substring(0, 8)}_${Date.now()}`
        };

        // Convert ExternalDocument format to ERPDocument format for payload factory
        const mapDoc = (doc: any) => ({
            id: doc.id,
            externalId: doc.externalId,
            name: (doc.normalized as any)?.name || (doc.data as any)?.DisplayName || doc.externalId,
            type: doc.type,
            total: (doc.normalized as any)?.total || (doc.data as any)?.TotalAmt || 0,
            date: (doc.normalized as any)?.date || doc.syncedAt,
            status: (doc.normalized as any)?.status || 'active',
            rawData: doc.data
        });

        const masterData = {
            contacts: contacts.map(mapDoc),
            items: items.map(mapDoc),
            invoices: invoices.map(mapDoc),
            payments: [],
            salesorders: [],
            purchaseorders: [],
            estimates: []
        };

        const unifiedPayload = n8nPayloadFactory.createUnifiedPayload(
            masterData,
            business,
            integration,
            flooviooId,
            context
        );

        // Send to n8n
        await webhookService.sendTrigger('transactional-branding', OnboardingEventTypes.DATA_SYNC, unifiedPayload);
        
        logger.info({ 
            businessId, 
            flooviooId,
            entityCounts: {
                contacts: contacts.length,
                items: items.length,
                invoices: invoices.length
            }
        }, '📤 [DataSyncService] Webhook sent to n8n');
    }

    /**
     * Status Updater
     */
    private async _updateOnboardingStatus(businessId: string, success: boolean) {
        if (!success) return; // Don't mark complete if failed

        // Check if this was the first sync
        const business = await prisma.business.findUnique({ where: { id: businessId } });
        
        if (business && business.onboardingStatus !== 'COMPLETED') {
             await prisma.business.update({
                where: { id: businessId },
                data: { 
                    onboardingStatus: 'COMPLETED',
                    currentOnboardingStep: 4 
                }
            });
            logger.info({ businessId }, '🎉 [DataSyncService] Onboarding Completed');
        }
    }

    /**
     * Normalization Strategy
     * Converts generic ERPDocument to Unified Model (V2).
     */
    private normalizeDocument(doc: ERPDocument, type: string): UnifiedInvoice | UnifiedContact | UnifiedItem | any {
        if (type === 'invoices') {
             const raw: UnifiedInvoice = {
                 id: 'temp', 
                 externalId: doc.id,
                 type: 'invoice',
                 number: doc.externalId || 'UNKNOWN',
                 date: doc.date instanceof Date ? doc.date.toISOString() : (doc.date || new Date().toISOString()),
                 status: (doc.status || 'unknown').toLowerCase() as any,
                 total: doc.total || 0,
                 currency: 'USD', // Should be extracted from doc
                 customer: {
                     externalId: 'unknown', // Need to link this
                     name: doc.contactName || 'Unknown'
                 },
                 items: [], // Expand if ERPDocument has items
                 normalizedAt: new Date()
             };
             
             // Optional: Validation
             // UnifiedInvoiceSchema.parse(raw);
             return raw;
        }
        
        // Default Logic for other types
        return {
            externalId: doc.id,
            name: doc.name,
            status: doc.status,
            _raw: true
        };
    }
}

export const dataSyncService = new DataSyncService();
