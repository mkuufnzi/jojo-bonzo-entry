import prisma from '../lib/prisma';
import { logger } from '../lib/logger';
import { ERPDocument } from './integrations/providers/types';

/**
 * ProductService
 * Manages the unified product catalog and bridges ERP entities (ExternalDocument) to the Product model.
 */
export class ProductService {
    /**
     * Upsert products from ERP data sync
     * Maps ERP 'items' to the local 'Product' table for use in recommendations and templates.
     */
    async syncProductsFromERP(businessId: string, integrationId: string, source: string, items: ERPDocument[]) {
        logger.info({ businessId, integrationId, count: items.length }, '🔍 [ProductService] Syncing products from ERP items');

        const results = { created: 0, updated: 0, failed: 0 };

        for (const item of items) {
            try {
                // Map ERP fields to Product schema
                const productData = {
                    businessId,
                    externalId: item.id,
                    source,
                    name: item.name || 'Unknown Item',
                    sku: item.externalId || item.id,
                    description: (item.rawData as any)?.Description || (item.rawData as any)?.PurchaseDesc || '',
                    price: item.total || 0,
                    currency: (item.rawData as any)?.CurrencyCode || 'USD',
                    metadata: item.rawData as any,
                };

                await prisma.product.upsert({
                    where: {
                        businessId_source_externalId: {
                            businessId,
                            source,
                            externalId: item.id
                        }
                    },
                    update: {
                        name: productData.name,
                        sku: productData.sku,
                        description: productData.description,
                        price: productData.price,
                        currency: productData.currency,
                        metadata: productData.metadata,
                        updatedAt: new Date()
                    },
                    create: productData
                });

                results.created++; // Simplified tracking
            } catch (e: any) {
                logger.error({ businessId, itemId: item.id, error: e.message }, '❌ [ProductService] Product sync failed for item');
                results.failed++;
            }
        }

        logger.info({ businessId, results }, '✅ [ProductService] Product Sync Completed');
        return results;
    }
}

export const productService = new ProductService();
