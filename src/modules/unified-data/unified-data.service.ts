import prisma from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { NormalizationEngine } from './normalization.engine';
import { DataSyncService } from '../../services/data-sync.service';

const dataSyncService = new DataSyncService();

export class UnifiedDataService {

    /**
     * ORCHESTRATOR: Fan-out per-tenant background sync jobs.
     * 
     * Called every 6 hours by BullMQ cron. For each tenant with at least
     * one connected integration, queues a 'unified:sync-business' job.
     * 
     * Jobs are staggered to prevent thundering herd on ERP APIs.
     */
    static async orchestrate() {
        const cycleId = `sync-orch-${Date.now()}`;
        console.log(`\n╔══════════════════════════════════════════════════════════════════╗`);
        console.log(`║  🔄 UNIFIED HUB ORCHESTRATOR — Cycle ${cycleId}`);
        console.log(`║  Time: ${new Date().toISOString()}`);
        console.log(`╚══════════════════════════════════════════════════════════════════╝\n`);

        const { createQueue, QUEUES } = await import('../../lib/queue');
        const syncQueue = createQueue(QUEUES.INTEGRATION_SYNC);

        // 1. Find all businesses with connected integrations (Unified Hub candidates)
        const connectedBusinesses = await prisma.business.findMany({
            where: {
                integrations: {
                    some: { status: 'connected' }
                }
            },
            select: { id: true }
        });

        if (connectedBusinesses.length === 0) {
            console.log(`[Unified Orchestrator] ⚠️ No businesses with connected integrations. Skipping cycle.`);
            return { cycleId, tenants: 0, queued: 0 };
        }

        console.log(`[Unified Orchestrator] Found ${connectedBusinesses.length} business(es) for sync`);

        // 2. STAGGERED FAN-OUT
        const STAGGER_MS = 2000; // 2 seconds between businesses to be polite to ERP APIs
        let queued = 0;

        for (let i = 0; i < connectedBusinesses.length; i++) {
            const businessId = connectedBusinesses[i].id;
            const delay = i * STAGGER_MS;

            await syncQueue.add('unified:sync-business', { businessId, cycleId }, {
                delay,
                jobId: `unified-sync-${businessId}-${new Date().toISOString().split('T')[0]}`, // Max one per day per business via orchestrator
                removeOnComplete: { age: 3600 }, // 1 hour retention for successful jobs
                removeOnFail: { age: 86400 }    // 24 hour retention for failed jobs
            });

            queued++;
            console.log(`[Unified Orchestrator] ✅ Queued business ${businessId.substring(0, 8)}… (delay: ${delay}ms)`);
        }

        console.log(`\n[Unified Orchestrator] ── Cycle Complete ──`);
        console.log(`[Unified Orchestrator]   Businesses: ${connectedBusinesses.length} | Queued: ${queued}\n`);

        return { cycleId, tenants: connectedBusinesses.length, queued };
    }
    
    /**
     * Processes all pending un-normalized documents for a specific business.
     */
    async syncBusinessData(businessId: string) {
        logger.info({ businessId }, 'Starting Global Unified Data Sync');
        
        const integrations = await prisma.integration.findMany({
            where: { businessId, status: 'connected' }
        });

        if (integrations.length === 0) {
            logger.warn({ businessId }, 'No integrations found for sync');
            return;
        }

        let totalSynced = 0;
        for (const integration of integrations) {
            try {
                const count = await this.syncIntegration(businessId, integration);
                totalSynced += count;
            } catch (err) {
                console.error(`[UNIFIED SYNC] Integration ${integration.provider} failed, skipping others.`);
            }
        }
        
        return totalSynced;
    }

    /**
     * Public method to sync a specific integration (e.g. from UI button)
     */
    async syncIntegrationData(businessId: string, integrationId: string) {
        const integration = await prisma.integration.findUnique({
            where: { id: integrationId }
        });
        if (!integration || integration.businessId !== businessId) {
            throw new Error('Integration not found or access denied');
        }
        return this.syncIntegration(businessId, integration);
    }

    /**
     * Internal helper to sync a specific integration
     */
    private async syncIntegration(businessId: string, integration: any) {
        console.log(`[UNIFIED SYNC] 🔄 Targeted sync for ${integration.provider} (${integration.id})`);
        
        const syncJob = await prisma.unifiedSyncJob.create({
            data: {
                businessId,
                integrationId: integration.id,
                entityType: 'ALL',
                status: 'PROCESSING',
                startedAt: new Date()
            }
        });

        try {
            // Step 1: Pull from ERP
            console.log(`[UNIFIED SYNC] [${integration.provider}] Step 1: External Fetch`);
            await dataSyncService.syncBusiness(businessId, ['contacts', 'items', 'invoices', 'orders', 'payments', 'estimates']);

            // Step 2: Normalize
            console.log(`[UNIFIED SYNC] [${integration.provider}] Step 2: Normalization`);
            const docsToSync = await prisma.externalDocument.findMany({
                where: { businessId, integrationId: integration.id },
                orderBy: { syncedAt: 'asc' },
                take: 1000,
                include: { integration: true }
            });

            console.log(`[UNIFIED SYNC] [${integration.provider}] Found ${docsToSync.length} documents to normalize`);
            console.log(`[UNIFIED SYNC] [${integration.provider}] Step 3: Normalizing ${docsToSync.length} documents...`);
            let recordsSynced = 0;

            for (const doc of docsToSync) {
                try {
                    const success = await this.normalizeDocument(businessId, doc);
                    if (success) recordsSynced++;
                } catch (err: any) {
                    console.error(`[UNIFIED SYNC] [${integration.provider}] Normalization error for doc ${doc.id}:`, err.message);
                }
            }
            console.log(`[UNIFIED SYNC] [${integration.provider}] Completed. Synced: ${recordsSynced}/${docsToSync.length}`);

            await prisma.unifiedSyncJob.update({
                where: { id: syncJob.id },
                data: {
                    status: 'COMPLETED',
                    completedAt: new Date(),
                    recordsSynced
                }
            });

            // Update Integration Last Sync / Status
            await prisma.integration.update({
                where: { id: integration.id },
                data: { updatedAt: new Date() }
            });

            return recordsSynced;
        } catch (error: any) {
            console.error(`[UNIFIED SYNC] ❌ Fatal error for ${integration.provider}:`, error.message);
            await prisma.unifiedSyncJob.update({
                where: { id: syncJob.id },
                data: {
                    status: 'FAILED',
                    completedAt: new Date(),
                    errorMessage: error.message
                }
            });
            throw error;
        }
    }

    private async normalizeDocument(businessId: string, doc: any): Promise<boolean> {
        const provider = doc.integration.provider;
        const integrationId = doc.integrationId;

        if (doc.type === 'customer' || doc.type === 'contact') {
            const normalizedCustomer = NormalizationEngine.normalizeCustomer(provider, doc.data);
            await prisma.unifiedCustomer.upsert({
                where: {
                    businessId_integrationId_externalId: { businessId, integrationId, externalId: normalizedCustomer.externalId }
                },
                update: {
                    name: normalizedCustomer.name,
                    email: normalizedCustomer.email,
                    phone: normalizedCustomer.phone,
                    source: provider,
                    metadata: normalizedCustomer.metadata
                },
                create: {
                    businessId,
                    integrationId,
                    externalId: normalizedCustomer.externalId,
                    name: normalizedCustomer.name,
                    email: normalizedCustomer.email,
                    phone: normalizedCustomer.phone,
                    source: provider,
                    metadata: normalizedCustomer.metadata
                }
            });
            return true;
        } 
        
        if (doc.type === 'invoice') {
            const normalizedInvoice = NormalizationEngine.normalizeInvoice(provider, doc.data);
            
            // Upsert Customer placeholder if it doesn't exist yet to satisfy FK
            if (normalizedInvoice.customerId) {
                await prisma.unifiedCustomer.upsert({
                    where: { businessId_integrationId_externalId: { businessId, integrationId, externalId: normalizedInvoice.customerId } },
                    update: {},
                    create: { businessId, integrationId, externalId: normalizedInvoice.customerId, name: "Unknown Customer (Created via Invoice)", source: provider }
                });
            }

            const internalCustomer = normalizedInvoice.customerId ? await prisma.unifiedCustomer.findUnique({
                where: { businessId_integrationId_externalId: { businessId, integrationId, externalId: normalizedInvoice.customerId } }
            }) : null;

            if (internalCustomer) {
                await prisma.unifiedInvoice.upsert({
                    where: { businessId_integrationId_externalId: { businessId, integrationId, externalId: normalizedInvoice.externalId } },
                    update: {
                        amount: normalizedInvoice.amount,
                        balance: normalizedInvoice.balance,
                        status: normalizedInvoice.status,
                        dueDate: normalizedInvoice.dueDate,
                        issuedDate: normalizedInvoice.issuedDate,
                        invoiceNumber: normalizedInvoice.invoiceNumber,
                        metadata: normalizedInvoice.metadata,
                        source: provider
                    },
                    create: {
                        businessId,
                        integrationId,
                        customerId: internalCustomer.id,
                        externalId: normalizedInvoice.externalId,
                        amount: normalizedInvoice.amount,
                        balance: normalizedInvoice.balance,
                        status: normalizedInvoice.status,
                        dueDate: normalizedInvoice.dueDate,
                        issuedDate: normalizedInvoice.issuedDate,
                        invoiceNumber: normalizedInvoice.invoiceNumber,
                        metadata: normalizedInvoice.metadata,
                        source: provider
                    }
                });
                return true;
            }
        }

        if (doc.type === 'order' || doc.type === 'salesorder') {
            const normalizedOrder = NormalizationEngine.normalizeOrder(provider, doc.data);
            if (normalizedOrder.customerId) {
                await prisma.unifiedCustomer.upsert({
                    where: { businessId_integrationId_externalId: { businessId, integrationId, externalId: normalizedOrder.customerId } },
                    update: {},
                    create: { businessId, integrationId, externalId: normalizedOrder.customerId, name: "Unknown Customer (Created via Order)", source: provider }
                });
            }
            const internalCustomer = normalizedOrder.customerId ? await prisma.unifiedCustomer.findUnique({
                where: { businessId_integrationId_externalId: { businessId, integrationId, externalId: normalizedOrder.customerId } }
            }) : null;

            if (internalCustomer) {
                const existingOrder = await prisma.unifiedOrder.findUnique({
                    where: { businessId_integrationId_externalId: { businessId, integrationId, externalId: normalizedOrder.externalId } }
                });

                if (existingOrder) {
                    await prisma.unifiedOrder.update({
                        where: { id: existingOrder.id },
                        data: {
                            totalAmount: normalizedOrder.totalAmount,
                            totalPaid: normalizedOrder.totalPaid || 0,
                            status: normalizedOrder.status,
                            orderDate: normalizedOrder.orderDate ? new Date(normalizedOrder.orderDate) : null,
                            orderNumber: normalizedOrder.orderNumber,
                            metadata: normalizedOrder.metadata || {},
                            source: provider
                        } as any
                    });
                } else {
                    await prisma.unifiedOrder.create({
                        data: {
                            businessId,
                            integrationId,
                            customerId: internalCustomer.id,
                            externalId: normalizedOrder.externalId,
                            orderNumber: normalizedOrder.orderNumber,
                            totalAmount: normalizedOrder.totalAmount,
                            totalPaid: normalizedOrder.totalPaid || 0,
                            status: normalizedOrder.status,
                            orderDate: normalizedOrder.orderDate ? new Date(normalizedOrder.orderDate) : null,
                            source: provider,
                            metadata: normalizedOrder.metadata || {}
                        } as any
                    });
                }
                return true;
            }
        }

        if (doc.type === 'payment') {
            const normalizedPayment = NormalizationEngine.normalizePayment(provider, doc.data);
            if (normalizedPayment.customerId) {
                await prisma.unifiedCustomer.upsert({
                    where: { businessId_integrationId_externalId: { businessId, integrationId, externalId: normalizedPayment.customerId } },
                    update: {},
                    create: { businessId, integrationId, externalId: normalizedPayment.customerId, name: "Unknown Customer (Created via Payment)", source: provider }
                });
            }
            const internalCustomer = normalizedPayment.customerId ? await prisma.unifiedCustomer.findUnique({
                where: { businessId_integrationId_externalId: { businessId, integrationId, externalId: normalizedPayment.customerId } }
            }) : null;

            if (internalCustomer) {
                await prisma.unifiedPayment.upsert({
                    where: { businessId_integrationId_externalId: { businessId, integrationId, externalId: normalizedPayment.externalId } },
                    update: { amount: normalizedPayment.amount, method: normalizedPayment.method, status: normalizedPayment.status, paymentDate: normalizedPayment.paymentDate, metadata: normalizedPayment.metadata, source: provider },
                    create: { businessId, integrationId, customerId: internalCustomer.id, externalId: normalizedPayment.externalId, amount: normalizedPayment.amount, method: normalizedPayment.method, status: normalizedPayment.status, paymentDate: normalizedPayment.paymentDate, metadata: normalizedPayment.metadata, source: provider }
                });
                return true;
            }
        }

        if (doc.type === 'estimate' || doc.type === 'quote') {
            const normalizedEstimate = NormalizationEngine.normalizeEstimate(provider, doc.data);
            if (normalizedEstimate.customerId) {
                await prisma.unifiedCustomer.upsert({
                    where: { businessId_integrationId_externalId: { businessId, integrationId, externalId: normalizedEstimate.customerId } },
                    update: {},
                    create: { businessId, integrationId, externalId: normalizedEstimate.customerId, name: "Unknown Customer (Created via Estimate)", source: provider }
                });
            }
            const internalCustomer = normalizedEstimate.customerId ? await prisma.unifiedCustomer.findUnique({
                where: { businessId_integrationId_externalId: { businessId, integrationId, externalId: normalizedEstimate.customerId } }
            }) : null;

            if (internalCustomer) {
                await prisma.unifiedEstimate.upsert({
                    where: { businessId_integrationId_externalId: { businessId, integrationId, externalId: normalizedEstimate.externalId } },
                    update: { estimateNum: normalizedEstimate.estimateNum, amount: normalizedEstimate.amount, status: normalizedEstimate.status, estimateDate: normalizedEstimate.estimateDate, expiryDate: normalizedEstimate.expiryDate, metadata: normalizedEstimate.metadata, source: provider },
                    create: { businessId, integrationId, customerId: internalCustomer.id, externalId: normalizedEstimate.externalId, estimateNum: normalizedEstimate.estimateNum, amount: normalizedEstimate.amount, status: normalizedEstimate.status, estimateDate: normalizedEstimate.estimateDate, expiryDate: normalizedEstimate.expiryDate, metadata: normalizedEstimate.metadata, source: provider }
                });
                return true;
            }
        }

        if (doc.type === 'item' || doc.type === 'product') {
            const normalizedProduct = NormalizationEngine.normalizeProduct(provider, doc.data);
            const existingProduct = await prisma.unifiedProduct.findUnique({
                where: { businessId_integrationId_externalId: { businessId, integrationId, externalId: normalizedProduct.externalId } }
            });

            if (existingProduct) {
                await prisma.unifiedProduct.update({
                    where: { id: existingProduct.id },
                    data: {
                        name: normalizedProduct.name,
                        sku: normalizedProduct.sku,
                        description: normalizedProduct.description,
                        price: normalizedProduct.price,
                        currency: normalizedProduct.currency,
                        quantity: normalizedProduct.quantity || 0,
                        category: normalizedProduct.category,
                        metadata: normalizedProduct.metadata || {},
                        source: provider
                    } as any
                });
            } else {
                await prisma.unifiedProduct.create({
                    data: {
                        businessId,
                        integrationId,
                        externalId: normalizedProduct.externalId,
                        name: normalizedProduct.name,
                        sku: normalizedProduct.sku,
                        description: normalizedProduct.description,
                        price: normalizedProduct.price,
                        currency: normalizedProduct.currency,
                        quantity: normalizedProduct.quantity || 0,
                        category: normalizedProduct.category,
                        source: provider,
                        metadata: normalizedProduct.metadata || {}
                    } as any
                });
            }
            return true;
        }

        return false;
    }

    /**
     * Get isolated unified data for presentation layers (Dashboard)
     */
    async getUnifiedInvoices(businessId: string, page = 1, limit = 50, filters?: { source?: string }) {
        const skip = (page - 1) * limit;
        const where: any = { businessId };
        if (filters?.source && filters.source !== 'all') where.source = filters.source;

        const invoices = await prisma.unifiedInvoice.findMany({
            where,
            include: { customer: true },
            orderBy: { issuedDate: 'desc' },
            skip,
            take: limit
        });
        console.log(`[UnifiedDataHub] ✅ Fetched ${invoices.length} Invoices for Business: ${businessId}`);
        return invoices;
    }

    async getUnifiedCustomers(businessId: string, page = 1, limit = 50, filters?: { source?: string }) {
        const skip = (page - 1) * limit;
        const where: any = { businessId };
        if (filters?.source && filters.source !== 'all') where.source = filters.source;

        return prisma.unifiedCustomer.findMany({
            where,
            include: { _count: { select: { invoices: true, orders: true } } },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit
        });
    }

    async getUnifiedCustomerDetail(businessId: string, customerId: string) {
        const customer = await prisma.unifiedCustomer.findFirst({
            where: { id: customerId, businessId }
        });

        if (!customer) return null;

        const [invoices, orders, payments, estimates] = await Promise.all([
            prisma.unifiedInvoice.findMany({ where: { customerId, businessId }, orderBy: { issuedDate: 'desc' } }),
            prisma.unifiedOrder.findMany({ where: { customerId, businessId }, orderBy: { orderDate: 'desc' } }),
            prisma.unifiedPayment.findMany({ where: { customerId, businessId }, orderBy: { paymentDate: 'desc' } }),
            prisma.unifiedEstimate.findMany({ where: { customerId, businessId }, orderBy: { estimateDate: 'desc' } })
        ]);

        return {
            ...customer,
            invoices,
            orders,
            payments,
            estimates
        };
    }

    async getUnifiedOrders(businessId: string, page = 1, limit = 50, filters?: { source?: string }) {
        const skip = (page - 1) * limit;
        const where: any = { businessId };
        if (filters?.source && filters.source !== 'all') where.source = filters.source;

        const orders = await prisma.unifiedOrder.findMany({
            where,
            include: { customer: true },
            orderBy: { orderDate: 'desc' },
            skip,
            take: limit
        });
        console.log(`[UnifiedDataHub] ✅ Fetched ${orders.length} Orders for Business: ${businessId}`);
        return orders;
    }

    async getUnifiedPayments(businessId: string, page = 1, limit = 50, filters?: { source?: string }) {
        const skip = (page - 1) * limit;
        const where: any = { businessId };
        if (filters?.source && filters.source !== 'all') where.source = filters.source;

        const payments = await prisma.unifiedPayment.findMany({
            where,
            include: { customer: true },
            orderBy: { paymentDate: 'desc' },
            skip,
            take: limit
        });
        console.log(`[UnifiedDataHub] ✅ Fetched ${payments.length} Payments for Business: ${businessId}`);
        return payments;
    }

    async getUnifiedEstimates(businessId: string, page = 1, limit = 50, filters?: { source?: string }) {
        const skip = (page - 1) * limit;
        const where: any = { businessId };
        if (filters?.source && filters.source !== 'all') where.source = filters.source;

        const estimates = await prisma.unifiedEstimate.findMany({
            where,
            include: { customer: true },
            orderBy: { estimateDate: 'desc' },
            skip,
            take: limit
        });
        console.log(`[UnifiedDataHub] ✅ Fetched ${estimates.length} Estimates for Business: ${businessId}`);
        return estimates;
    }

    async getUnifiedProducts(businessId: string, page = 1, limit = 50, filters?: { source?: string }) {
        const skip = (page - 1) * limit;
        const where: any = { businessId };
        if (filters?.source && filters.source !== 'all') where.source = filters.source;

        const products = await prisma.unifiedProduct.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit
        });
        console.log(`[UnifiedDataHub] ✅ Fetched ${products.length} Products for Business: ${businessId}`);
        return products;
    }

    async getUnifiedBusinessStats(businessId: string) {
        console.log(`[UnifiedDataService] Aggregating stats for Business: ${businessId}`);
        try {
            const [invoiceStats, customerCount, orderCount] = await Promise.all([
                prisma.unifiedInvoice.aggregate({
                    where: { 
                        businessId,
                        status: { notIn: ['VOIDED', 'DELETED', 'DRAFT'] }
                    },
                    _sum: { amount: true, balance: true },
                    _count: { id: true }
                }),
                prisma.unifiedCustomer.count({ where: { businessId } }),
                prisma.unifiedOrder.count({ where: { businessId } })
            ]);

            console.log(`[UnifiedDataService] Stats Results: Invoices=${invoiceStats._count.id}, Customers=${customerCount}, Orders=${orderCount}`);
            console.log(`[UnifiedDataService] Financials: Revenue=${invoiceStats._sum.amount}, Balance=${invoiceStats._sum.balance}`);

            return {
                totalInvoices: invoiceStats._count.id,
                totalCustomers: customerCount,
                totalOrders: orderCount,
                totalRevenue: invoiceStats._sum.amount || 0,
                outstandingBalance: invoiceStats._sum.balance || 0,
                totalPaid: (invoiceStats._sum.amount || 0) - (invoiceStats._sum.balance || 0)
            };
        } catch (error: any) {
            console.error(`[UnifiedDataService] ❌ Error aggregating stats for ${businessId}: ${error.message}`);
            return {
                totalInvoices: 0,
                totalCustomers: 0,
                totalOrders: 0,
                totalRevenue: 0,
                outstandingBalance: 0,
                totalPaid: 0
            };
        }
    }
}

export const unifiedDataService = new UnifiedDataService();
