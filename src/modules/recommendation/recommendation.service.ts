import prisma from '../../lib/prisma';
import { logger } from '../../lib/logger';

export interface RecommendationRequest {
    businessId: string;
    items: string[];
    customerId?: string;
    limit?: number;
}

export interface Recommendation {
    id: string;
    name: string;
    description?: string;
    price: number;
    currency: string;
    sku: string;
    img?: string;
    reason: string;
}

export class RecommendationService {
    /**
     * Get product recommendations based on current document items.
     * Logic: Category-based matching + priority rules.
     */

    /**
     * Rule Management: CRUD
     */
    async listRules(businessId: string) {
        return prisma.recommendationRule.findMany({
            where: { businessId },
            orderBy: { priority: 'desc' }
        });
    }

    async createRule(businessId: string, data: any) {
        return prisma.recommendationRule.create({
            data: { ...data, businessId }
        });
    }

    async updateRule(id: string, businessId: string, data: any) {
        return prisma.recommendationRule.updateMany({
            where: { id, businessId },
            data
        });
    }

    async deleteRule(id: string, businessId: string) {
        return prisma.recommendationRule.deleteMany({
            where: { id, businessId }
        });
    }

    /**
     * Sync Unified Inventory from ERP
     */
    async syncUnifiedInventory(businessId: string) {
        const { unifiedDataService } = await import('../unified-data/unified-data.service');
        logger.info({ businessId }, '[RecommendationService] Triggering inventory sync');
        return unifiedDataService.syncBusinessData(businessId);
    }

    /**
     * Sync Unified Orders from ERP
     */
    async syncUnifiedOrders(businessId: string) {
        const { unifiedDataService } = await import('../unified-data/unified-data.service');
        logger.info({ businessId }, '[RecommendationService] Triggering order sync');
        return unifiedDataService.syncBusinessData(businessId);
    }

    /**
     * Get recommendations for a specific customer cluster
     */
    async getClusterRecommendations(businessId: string, clusterName: string, limit: number = 3): Promise<Recommendation[]> {
        logger.info({ businessId, clusterName }, '[RecommendationService] Fetching cluster-specific recommendations');
        
        try {
            // Find customers in this cluster
            const customers = await prisma.unifiedCustomer.findMany({
                where: { businessId },
                include: { orders: true }
            });

            const clusterCustomers = customers.filter(c => {
                const count = c.orders.length;
                if (clusterName === 'Champions / VIP') return count > 5;
                if (clusterName === 'Steady Customers') return count > 1 && count <= 5;
                if (clusterName === 'New / At Risk') return count <= 1;
                return false;
            });

            if (clusterCustomers.length === 0) return this._padRecommendations(businessId, [], [], limit);

            // Find top products for these customers
            const orderMetadata = clusterCustomers.flatMap(c => c.orders.map(o => (o.metadata as any)));
            const skuCounts = new Map<string, number>();

            orderMetadata.forEach((meta: any) => {
                const items = meta?.line_items || [];
                items.forEach((item: any) => {
                    if (item.sku) skuCounts.set(item.sku, (skuCounts.get(item.sku) || 0) + 1);
                });
            });

            const topSkus = [...skuCounts.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, limit)
                .map(([sku]) => sku);

            const products = await prisma.unifiedProduct.findMany({
                where: { businessId, sku: { in: topSkus } }
            });

            return products.map(p => ({
                id: p.id,
                name: p.name,
                description: p.description || undefined,
                price: p.price || 0,
                currency: p.currency || 'GBP',
                sku: p.sku || 'N/A',
                img: (p.metadata as any)?.img || '🎯',
                reason: `Popular among similar ${clusterName.split(' ')[0]} customers`
            }));

        } catch (error) {
            logger.error({ businessId, clusterName, error }, '[RecommendationService] Cluster recommendations failed');
            return this._padRecommendations(businessId, [], [], limit);
        }
    }

    /**
     * Analytics: Retrieve aggregated insights from the Unified Hub
     * This provides the "Categories" and "Clusters" data requested by the user.
     */
    async getRichAnalytics(businessId: string) {
        logger.info({ businessId }, '[RecommendationService] Fetching rich analytics from Unified Hub');

        try {
            const [products, customers, orders] = await Promise.all([
                prisma.unifiedProduct.findMany({ where: { businessId } }),
                prisma.unifiedCustomer.findMany({ where: { businessId }, include: { orders: true, invoices: true } }),
                (prisma as any).unifiedOrder ? (prisma as any).unifiedOrder.findMany({ where: { businessId } }) : Promise.resolve([])
            ]);

            // 1. Category Distribution
            const categories = new Map<string, number>();
            products.forEach(p => {
                let cat = (p.metadata as any)?.category;
                if (!cat || cat.trim() === '') {
                    cat = 'Uncategorized';
                } else {
                    // Ensure nice casing for labels
                    cat = cat.trim().split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
                }
                categories.set(cat, (categories.get(cat) || 0) + 1);
            });

            const categoryDistribution = [...categories.entries()]
                .map(([name, value]) => ({ name, value }))
                .sort((a, b) => b.value - a.value); // Sort by most frequent first

            // 2. Customer Clusters (RFM - Enhanced for Segments Page)
            const clusters = [
                { 
                    name: 'Champions & VIP', 
                    count: 0, 
                    totalSpend: 0,
                    description: 'Your most valuable customers. High frequency and high total spend.',
                    strategy: 'Reward with exclusive early access and VIP discounts.'
                },
                { 
                    name: 'Steady Customers', 
                    count: 0, 
                    totalSpend: 0,
                    description: 'Consistent buyers who provide stable revenue.',
                    strategy: 'Encourage higher order value with bundle recommendations.'
                },
                { 
                    name: 'New / At Risk', 
                    count: 0, 
                    totalSpend: 0,
                    description: 'Customers with only one purchase or declining activity.',
                    strategy: 'Re-engage with personalized "We Miss You" offers.'
                }
            ];

            customers.forEach(c => {
                const orderCount = (c.orders?.length || 0) + (c.invoices?.length || 0);
                const spend = c.invoices?.reduce((acc, inv) => acc + (inv.amount || 0), 0) || 0;
                
                if (orderCount > 5 || spend > 1000) {
                    clusters[0].count++;
                    clusters[0].totalSpend += spend;
                } else if (orderCount > 1) {
                    clusters[1].count++;
                    clusters[1].totalSpend += spend;
                } else {
                    clusters[2].count++;
                    clusters[2].totalSpend += spend;
                }
            });

            const customerClusters = clusters.map((c, idx) => ({ 
                clusterId: `cluster-${idx + 1}`,
                name: c.name, 
                size: c.count,
                description: c.description,
                strategy: c.strategy,
                avgOrderValue: c.count > 0 
                    ? (c.totalSpend / c.count).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' }) 
                    : '£0.00',
                color: c.name.includes('Champion') ? 'emerald' : (c.name.includes('Steady') ? 'indigo' : 'rose')
            }));

            // 3. Purchase Affinity (Frequently Bought Together)
            // We'll analyze orders to find product pairs
            const affinities = await this.getPurchaseAffinity(businessId);

            const basicAnalytics = await this.getAnalyticsOverview(businessId);
            const catalogInsights = await this.getCatalogInsights(businessId);

            return {
                ...basicAnalytics,
                ...catalogInsights,
                categoryDistribution,
                customerClusters,
                affinities: affinities.slice(0, 5) // Top 5 pairs
            };

        } catch (error: any) {
            logger.error({ err: error.message, businessId }, '[RecommendationService] Rich analytics failure');
            return {
                impressions: 0, conversions: 0, conversionRate: '0%', revenueLift: '£0.00', topPerformers: [],
                categoryDistribution: [], customerClusters: [], affinities: []
            };
        }
    }

    /**
     * Calculate Purchase Affinity (Frequently Bought Together)
     * Analyzes Invoice metadata to see which SKUs appear together.
     */
    async getPurchaseAffinity(businessId: string) {
        if (!(prisma as any).unifiedInvoice) return [];

        try {
            const invoices = await (prisma as any).unifiedInvoice.findMany({
                where: { businessId },
                select: { metadata: true }
            });

            const pairCounts = new Map<string, number>();

            invoices.forEach((invoice: any) => {
                const lineItems = (invoice.metadata as any)?.line_items || [];
                const skus = Array.from(new Set(lineItems.map((li: any) => li.sku || li.name).filter(Boolean))) as string[];

                // Generate pairs
                for (let i = 0; i < skus.length; i++) {
                    for (let j = i + 1; j < skus.length; j++) {
                        const pair = [skus[i], skus[j]].sort().join('<=>');
                        pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
                    }
                }
            });

            const affinityResults = await Promise.all([...pairCounts.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 50) // More pairs for better matching depth
                .map(async ([pair, count]) => {
                    const [skuA, skuB] = pair.split('<=>');
                    const [prodA, prodB] = await Promise.all([
                        prisma.unifiedProduct.findFirst({ where: { businessId, sku: skuA } }),
                        prisma.unifiedProduct.findFirst({ where: { businessId, sku: skuB } })
                    ]);

                    return {
                        baseProduct: skuA,
                        matchedProduct: prodB?.name || skuB,
                        matchedSku: skuB,
                        strength: count,
                        confidence: count > 3 ? 'High' : (count > 1 ? 'Medium' : 'Low')
                    };
                }));

            return affinityResults;

        } catch (e) {
            logger.error({ businessId }, '[RecommendationService] Affinity analysis failed');
            return [];
        }
    }

    /**
     * Enhanced Recommendation Logic with Hub Insights
     */
    async getRecommendations(req: RecommendationRequest): Promise<Recommendation[]> {
        const { businessId, items, customerId, limit = 3 } = req;
        logger.info({ businessId, customerId, items }, '[RecommendationService] Generating smart recommendations');

        try {
            let finalResults: Recommendation[] = [];

            // 1. Normalize input SKUs for strict exclusion
            const inputSkus = items.map(s => s.trim().toLowerCase()).filter(Boolean);
            const inputProducts = await prisma.unifiedProduct.findMany({
                where: { businessId, sku: { in: items } }
            });

            // 2. Customer Personalization
            let customerTopCategories: string[] = [];
            if (customerId) {
                const customer = await prisma.unifiedCustomer.findFirst({
                    where: { businessId, id: customerId },
                    include: { orders: true, invoices: true }
                });

                if (customer) {
                    const orderCount = (customer.orders?.length || 0) + (customer.invoices?.length || 0);
                    const spend = customer.invoices?.reduce((acc, inv) => acc + (inv.amount || 0), 0) || 0;
                    
                    const historyMetadata = [...(customer.orders || []), ...(customer.invoices || [])].map(o => (o.metadata as any));
                    const categoryCounts = new Map<string, number>();
                    historyMetadata.forEach(meta => {
                        (meta?.line_items || []).forEach((li: any) => {
                            if (li.category) {
                                const cat = li.category.trim().toLowerCase();
                                categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
                            }
                        });
                    });
                    customerTopCategories = [...categoryCounts.entries()].sort((a,b) => b[1] - a[1]).map(e => e[0]);

                    let clusterName = 'New / At Risk';
                    if (orderCount > 5 || spend > 1000) clusterName = 'Champions & VIP';
                    else if (orderCount > 1) clusterName = 'Steady Customers';

                    const clusterRecs = await this.getClusterRecommendations(businessId, clusterName, limit + 2);
                    // Filter out input SKUs from cluster recs
                    finalResults = clusterRecs.filter(r => !inputSkus.includes(r.sku.toLowerCase()));
                }
            }

            // 3. Affinity Matching (Frequently Bought Together)
            if (inputSkus.length > 0) {
                const globalAffinities = await this.getPurchaseAffinity(businessId);
                const relatedAffinities = globalAffinities.filter(a => 
                    inputSkus.includes(a.baseProduct.toLowerCase()) || 
                    inputSkus.includes(a.matchedSku.toLowerCase())
                );

                for (const aff of relatedAffinities) {
                    if (finalResults.length >= limit + 5) break;
                    
                    const targetSku = inputSkus.includes(aff.baseProduct.toLowerCase()) ? aff.matchedSku : aff.baseProduct;
                    if (inputSkus.includes(targetSku.toLowerCase())) continue;

                    const p = await prisma.unifiedProduct.findFirst({
                        where: { businessId, sku: { equals: targetSku, mode: 'insensitive' } }
                    });

                    if (p && !finalResults.find(r => r.sku.toLowerCase() === p.sku?.toLowerCase())) {
                        finalResults.push({
                            id: p.id,
                            name: p.name,
                            description: p.description || undefined,
                            price: p.price || 0,
                            currency: p.currency || 'GBP',
                            sku: p.sku || 'N/A',
                            img: (p.metadata as any)?.img || '💫',
                            reason: `Frequently bought with ${inputSkus.includes(aff.baseProduct.toLowerCase()) ? aff.baseProduct : aff.matchedSku}`
                        });
                    }
                }

                // 4. Rule-based recommendations
                const baseRecommendations = await this._getRuleBasedRecommendations(businessId, inputProducts, limit);
                baseRecommendations.forEach(rec => {
                    const isInput = inputSkus.includes(rec.sku.toLowerCase());
                    const isDuplicate = finalResults.find(r => r.sku.toLowerCase() === rec.sku.toLowerCase());
                    if (!isInput && !isDuplicate) {
                        finalResults.unshift(rec); // Rules have highest priority
                    }
                });
            }

            // 5. Ranking & Deduplication
            finalResults = finalResults.filter((v, i, a) => a.findIndex(t => (t.sku.toLowerCase() === v.sku.toLowerCase())) === i);
            
            finalResults.sort((a, b) => {
                const aMatch = customerTopCategories.some(c => a.reason.toLowerCase().includes(c)) ? 1 : 0;
                const bMatch = customerTopCategories.some(c => b.reason.toLowerCase().includes(c)) ? 1 : 0;
                return bMatch - aMatch;
            });

            // 6. Padding
            if (finalResults.length < limit) {
                const currentSkus = finalResults.map(r => r.sku.toLowerCase());
                const allExcluded = Array.from(new Set([...inputSkus, ...currentSkus]));
                const padded = await this._padRecommendations(businessId, finalResults, allExcluded, limit - finalResults.length);
                finalResults = [...finalResults, ...padded];
            }

            return finalResults.slice(0, limit);

        } catch (error: any) {
            logger.error({ err: error.message, businessId }, '[RecommendationService] Smart recommendation failure');
            return [];
        }
    }

    private async _getRuleBasedRecommendations(businessId: string, products: any[], limit: number): Promise<Recommendation[]> {
        const categories = Array.from(new Set(products.map(p => p.metadata ? (p.metadata as any).category : 'General').filter(Boolean)));
        
        const rules = await prisma.recommendationRule.findMany({
            where: {
                businessId,
                isActive: true,
                OR: [
                    { triggerSku: { in: products.map(p => p.sku).filter(Boolean) as string[] } },
                    { triggerCategory: { in: categories as string[] } }
                ]
            },
            orderBy: { priority: 'desc' },
            take: limit
        });

        const targetSkus = rules.map(r => r.targetSku);
        const ghostKeywords = ['delete', 'test', 'sample', 'example', 'mock', 'guide'];
        const matchedProducts = await prisma.unifiedProduct.findMany({
            where: {
                businessId,
                sku: { in: targetSkus },
                AND: ghostKeywords.map(kw => ({
                    NOT: { OR: [{ name: { contains: kw } }, { description: { contains: kw } }] }
                }))
            }
        });

        return matchedProducts.map(p => {
            const rule = rules.find(r => r.targetSku === p.sku);
            return {
                id: p.id,
                name: p.name,
                description: p.description || undefined,
                price: p.price || 0,
                currency: p.currency || 'USD',
                sku: p.sku || 'N/A',
                img: (p.metadata as any)?.img || '✨',
                reason: rule?.aiPromptContext || 'Rule-based match'
            };
        });
    }

    private async _padRecommendations(businessId: string, current: Recommendation[], excludedSkus: string[], count: number): Promise<Recommendation[]> {
        const ghostKeywords = ['delete', 'test', 'sample', 'example', 'mock', 'guide'];
        const normalizedExcluded = excludedSkus.map(s => s.toLowerCase());

        const fallbackProducts = await prisma.unifiedProduct.findMany({
            where: {
                businessId,
                AND: [
                    { price: { gt: 0 } },
                    { sku: { notIn: excludedSkus } }, // Direct exclusion
                    ...ghostKeywords.map(kw => ({
                        NOT: { OR: [{ name: { contains: kw } }, { description: { contains: kw } }] }
                    }))
                ]
            },
            orderBy: { createdAt: 'desc' },
            take: count * 3 // Take more to filter manually
        });

        // Manual case-insensitive filtering
        const filtered = fallbackProducts
            .filter(p => p.sku && !normalizedExcluded.includes(p.sku.toLowerCase()))
            .slice(0, count);

        return filtered.map(p => {
            const cat = (p.metadata as any)?.category;
            return {
                id: p.id,
                name: p.name,
                description: p.description || undefined,
                price: p.price || 0,
                currency: p.currency || 'GBP',
                sku: p.sku || 'N/A',
                img: (p.metadata as any)?.img || '✨',
                reason: cat ? `Trending in ${cat}` : 'Customer Favorite'
            };
        });
    }

    async getAnalyticsOverview(businessId: string) {
        const events = await prisma.analyticsEvent.findMany({
            where: { 
                businessId,
                type: { in: ['recommendation_impression', 'recommendation_conversion'] }
            }
        });

        const impressions = events.filter(e => e.type === 'recommendation_impression').length;
        const conversions = events.filter(e => e.type === 'recommendation_conversion').length;
        const revenueLift = events
            .filter(e => e.type === 'recommendation_conversion')
            .reduce((acc, current) => acc + (current.amount || 0), 0);

        const conversionRate = impressions > 0 
            ? ((conversions / impressions) * 100).toFixed(1) + '%' 
            : '0%';

        // Get Top Performers (most conversions)
        const conversionEvents = events.filter(e => e.type === 'recommendation_conversion');
        const skuCounts = new Map<string, number>();
        conversionEvents.forEach(e => {
            const sku = (e.metadata as any)?.sku;
            if (sku) skuCounts.set(sku, (skuCounts.get(sku) || 0) + 1);
        });

        const topSkus = [...skuCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([sku]) => sku);

        const topProducts = await prisma.unifiedProduct.findMany({
            where: {
                businessId,
                sku: { in: topSkus }
            }
        });

        const topPerformers = topProducts.map(p => ({
            name: p.name,
            img: (p.metadata as any)?.img || '📦',
            conversions: skuCounts.get(p.sku!) || 0
        }));

        return {
            impressions,
            conversions,
            conversionRate,
            revenueLift: revenueLift.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' }),
            topPerformers
        };
    }

    /**
     * Get Catalog Insights (Price Ranges, Common Categories, Density)
     */
    async getCatalogInsights(businessId: string) {
        try {
            const products = await prisma.unifiedProduct.findMany({
                where: { businessId }
            });

            if (products.length === 0) {
                return { priceRanges: [], catalogSize: 0, topCategories: [], categoryDiversity: 'Low', categoryCount: 0 };
            }

            // 1. Price Ranges (Histogram)
            const prices = products.map(p => p.price || 0).filter(p => p > 0);
            let priceDistribution: { label: string; value: number }[] = [];
            
            if (prices.length > 0) {
                const minPrice = Math.min(...prices);
                const maxPrice = Math.max(...prices);
                const range = maxPrice - minPrice;
                const step = range / 5 || 10;

                const ranges = [
                    { min: minPrice, max: minPrice + step },
                    { min: minPrice + step, max: minPrice + 2 * step },
                    { min: minPrice + 2 * step, max: minPrice + 3 * step },
                    { min: minPrice + 3 * step, max: minPrice + 4 * step },
                    { min: minPrice + 4 * step, max: maxPrice }
                ];

                priceDistribution = ranges.map(r => {
                    const count = products.filter(p => (p.price || 0) >= r.min && (p.price || 0) <= r.max).length;
                    return {
                        label: `£${r.min.toFixed(0)}${r.min === r.max ? '' : ' - £' + r.max.toFixed(0)}`,
                        value: count
                    };
                });
            } else {
                priceDistribution = [{ label: 'No Pricing Data', value: 0 }];
            }

            // 2. Top Categories & Diversity
            const categories = new Map<string, number>();
            products.forEach(p => {
                const cat = (p.metadata as any)?.category || 'General';
                categories.set(cat, (categories.get(cat) || 0) + 1);
            });

            const topCategories = [...categories.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([name, count]) => ({ name, count }));

            const categoryDiversity = categories.size > 10 ? 'High' : (categories.size > 3 ? 'Medium' : 'Low');

            return {
                priceRanges: priceDistribution,
                catalogSize: products.length,
                topCategories,
                categoryDiversity,
                categoryCount: categories.size
            };

        } catch (error) {
            logger.error({ businessId }, '[RecommendationService] Catalog insights failure');
            return { priceRanges: [], catalogSize: 0, topCategories: [], categoryDiversity: 'Low', categoryCount: 0 };
        }
    }


    /**
     * Service Manifest for Registry
     */
    getManifest() {
        return {
            slug: 'recommendation-service',
            name: 'Smart Recommendation Engine',
            description: 'Generates product recommendations for transactional documents',
            version: '1.0.0',
            actions: [
                {
                    key: 'get_recommendations',
                    label: 'Get Recommendations',
                    description: 'Get relevant products for a document',
                    endpoint: '/recommendations/document',
                    method: 'POST' as any,
                    isBillable: true
                },
                {
                    key: 'list_rules',
                    label: 'List Rules',
                    description: 'List all recommendation rules',
                    endpoint: '/recommendations/rules',
                    method: 'GET' as any,
                    isBillable: false
                },
                {
                    key: 'create_rule',
                    label: 'Create Rule',
                    description: 'Create a new recommendation rule',
                    endpoint: '/recommendations/rules',
                    method: 'POST' as any,
                    isBillable: false
                },
                {
                    key: 'get_analytics',
                    label: 'Get Analytics',
                    description: 'Retrieve recommendation performance stats',
                    endpoint: '/recommendations/analytics/overview',
                    method: 'GET' as any,
                    isBillable: false
                },
                {
                    key: 'sync_products',
                    label: 'Sync Products',
                    description: 'Sync product catalog for recommendations',
                    endpoint: '/recommendations/sync/products',
                    method: 'POST' as any,
                    isBillable: false
                },
                {
                    key: 'sync_orders',
                    label: 'Sync Orders',
                    description: 'Sync order history for smart context',
                    endpoint: '/recommendations/sync/orders',
                    method: 'POST' as any,
                    isBillable: false
                }
            ]
        };
    }
}

export const recommendationService = new RecommendationService();
