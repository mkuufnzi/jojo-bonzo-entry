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
                const cat = (p.metadata as any)?.category || 'Uncategorized';
                categories.set(cat, (categories.get(cat) || 0) + 1);
            });

            const categoryDistribution = [...categories.entries()].map(([name, value]) => ({ name, value }));

            // 2. Customer Clusters (RFM - Simplified for Dashboard)
            // Low: 0-1 orders, Mid: 2-5 orders, High: 5+ orders
            const clusters = {
                'New / At Risk': 0,
                'Steady Customers': 0,
                'Champions / VIP': 0
            };

            customers.forEach(c => {
                const orderCount = c.orders.length;
                if (orderCount <= 1) clusters['New / At Risk']++;
                else if (orderCount <= 5) clusters['Steady Customers']++;
                else clusters['Champions / VIP']++;
            });

            const customerClusters = Object.entries(clusters).map(([name, value]) => ({ name, value }));

            // 3. Purchase Affinity (Frequently Bought Together)
            // We'll analyze orders to find product pairs
            const affinities = await this.getPurchaseAffinity(businessId);

            const basicAnalytics = await this.getAnalyticsOverview(businessId);

            return {
                ...basicAnalytics,
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
     * Analyzes Order metadata to see which SKUs appear together.
     */
    async getPurchaseAffinity(businessId: string) {
        if (!(prisma as any).unifiedOrder) return [];

        try {
            const orders = await (prisma as any).unifiedOrder.findMany({
                where: { businessId },
                select: { metadata: true }
            });

            const pairCounts = new Map<string, number>();

            orders.forEach((order: any) => {
                const lineItems = (order.metadata as any)?.line_items || [];
                const skus = Array.from(new Set(lineItems.map((li: any) => li.sku).filter(Boolean))) as string[];

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
                .slice(0, 10)
                .map(async ([pair, count]) => {
                    const [skuA, skuB] = pair.split('<=>');
                    const [prodA, prodB] = await Promise.all([
                        prisma.unifiedProduct.findFirst({ where: { businessId, sku: skuA } }),
                        prisma.unifiedProduct.findFirst({ where: { businessId, sku: skuB } })
                    ]);

                    return {
                        baseProduct: prodA?.name || skuA,
                        matchedProduct: prodB?.name || skuB,
                        matchedSku: skuB,
                        strength: count,
                        confidence: 'High'
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
        const { businessId, items, limit = 3 } = req;
        logger.info({ businessId, itemCount: items.length }, '[RecommendationService] Generating smart recommendations');

        try {
            // 1. Get products for current items
            const products = await prisma.unifiedProduct.findMany({
                where: { businessId, name: { in: items } }
            });
            const skus = products.map(p => p.sku).filter(Boolean) as string[];

            // 2. Fetch Affinity data for these SKUs
            const affinities = await this.getPurchaseAffinity(businessId);
            const affinityMatches = affinities.filter(a => skus.includes(a.matchedSku as string));

            // 3. Fallback to basic rule logic (existing)
            const baseRecommendations = await this._getRuleBasedRecommendations(businessId, products, limit);
            
            // 4. Merge results, prioritizing affinity matches if they aren't duplicates
            const finalResults: Recommendation[] = [...baseRecommendations];

            if (affinityMatches.length > 0 && finalResults.length < limit) {
                for (const match of affinityMatches) {
                    if (finalResults.length >= limit) break;
                    
                    const p = await prisma.unifiedProduct.findFirst({
                        where: { businessId, sku: match.matchedSku }
                    });

                    if (p && !finalResults.find(r => r.sku === p.sku)) {
                        finalResults.push({
                            id: p.id,
                            name: p.name,
                            description: p.description || undefined,
                            price: p.price || 0,
                            currency: p.currency || 'USD',
                            sku: p.sku || 'N/A',
                            img: (p.metadata as any)?.img || '💫',
                            reason: `Frequently bought with ${match.baseProduct}`
                        });
                    }
                }
            }
            
            // 5. If still not at limit, pad with random high-performers (existing logic refactored into helper)
            if (finalResults.length < limit) {
                const padded = await this._padRecommendations(businessId, finalResults, skus, limit - finalResults.length);
                return [...finalResults, ...padded];
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
        const existingSkus = current.map(c => c.sku);
        const allExcluded = [...excludedSkus, ...existingSkus];
        const ghostKeywords = ['delete', 'test', 'sample', 'example', 'mock', 'guide'];

        const fallbackProducts = await prisma.unifiedProduct.findMany({
            where: {
                businessId,
                ...(allExcluded.length > 0 ? { sku: { notIn: allExcluded } } : {}),
                AND: [
                    { price: { gt: 0 } },
                    ...ghostKeywords.map(kw => ({
                        NOT: { OR: [{ name: { contains: kw } }, { description: { contains: kw } }] }
                    }))
                ]
            },
            orderBy: { createdAt: 'desc' },
            take: count
        });

        return fallbackProducts.map(p => ({
            id: p.id,
            name: p.name,
            description: p.description || undefined,
            price: p.price || 0,
            currency: p.currency || 'USD',
            sku: p.sku || 'N/A',
            img: (p.metadata as any)?.img || '📦',
            reason: 'Top trending'
        }));
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
