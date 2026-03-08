
import prisma from '../../../lib/prisma';
import { getRedisClient } from '../../../lib/redis';
import { logger } from '../../../lib/logger';

export interface RecommendationRequest {
    businessId: string;
    items: string[]; // List of SKUs or Item Names
    totalAmount: number;
}

export interface Offer {
    sku: string;
    productName: string;
    copy: string;
    discountCode?: string;
    price?: number;
    currency?: string;
    reason: string;
}

export class RevenueService {
    
    /**
     * Main Entry Point: Get Smart Upsells for an Invoice
     */
    async getRecommendations(req: RecommendationRequest): Promise<Offer[]> {
        const { businessId, items } = req;
        const offers: Offer[] = [];
        
        logger.info({ businessId, items }, '🧠 [RevenueService.getRecommendations] Input received');

        try {
            // 1. Fetch Rules (Cached in Redis ideally, currently DB)
            // Priority: Specific SKU Trigger > Category Trigger > Global Fallback
            
            // For MVP: Fetch ALL active rules for business and filter in memory 
            // (Assumes < 100 rules per tenant, safe for now)
            const rules = await prisma.recommendationRule.findMany({
                where: { businessId, isActive: true },
                orderBy: { priority: 'desc' }
            });

            logger.info({ businessId, ruleCount: rules.length }, '🧠 [RevenueService.getRecommendations] Active rules found for business');

            if (rules.length === 0) return [];

            // 2. Logic Engine: Find best match
            for (const item of items) {
                // Exact Match
                const skuMatch = rules.find(r => r.triggerSku && item.includes(r.triggerSku));
                if (skuMatch) {
                    logger.info({ item, ruleId: skuMatch.id, targetSku: skuMatch.targetSku }, '🧠 [RevenueService.getRecommendations] Exact SKU match found');
                    await this.addOffer(offers, skuMatch, businessId);
                    continue;
                }
            }

            // 3. Fallback: If no offers yet, use Global/Category rules
            if (offers.length === 0) {
                const globalRule = rules.find(r => !r.triggerSku && !r.triggerCategory);
                if (globalRule) {
                    logger.info({ ruleId: globalRule.id, targetSku: globalRule.targetSku }, '🧠 [RevenueService.getRecommendations] Using global fallback rule');
                    await this.addOffer(offers, globalRule, businessId);
                } else {
                    logger.info('🧠 [RevenueService.getRecommendations] No global rule found');
                }
            }

            logger.info({ offersCount: offers.length, offers: offers.map(o => o.sku) }, '🧠 [RevenueService.getRecommendations] Final offers generated');
            return offers;

        } catch (error) {
            logger.error({ err: error, businessId }, 'Failed to generate recommendations');
            return []; // Fail gracefully (empty upsells)
        }
    }

    /**
     * Context Provider: Gets enriched "Smart Content" for a document dispatch.
     * Consolidates personal message and potential upsells into a single block.
     * 
     * DELEGATES to the canonical RecommendationService which properly queries
     * the Product table with category matching and fallback padding.
     */
    async getEnrichedContext(businessId: string, items: string[]): Promise<any> {
        logger.info({ businessId, itemCount: items.length, items }, '🧠 [RevenueService.getEnrichedContext] Starting Context Gen (delegating to RecommendationService)');
        
        // Import the canonical RecommendationService (lazy to avoid circular)
        const { recommendationService } = require('../../recommendation/recommendation.service');

        let recommendations: any[] = [];
        try {
            recommendations = await recommendationService.getRecommendations({
                businessId,
                items,
                limit: 3
            });
            logger.info({ businessId, count: recommendations.length }, '🧠 [RevenueService.getEnrichedContext] RecommendationService returned');
        } catch (err: any) {
            logger.warn({ err: err.message, businessId }, '🧠 [RevenueService.getEnrichedContext] RecommendationService failed, falling back');
            // Fallback to legacy matching if new service fails
            const offers = await this.getRecommendations({ businessId, items, totalAmount: 0 });
            recommendations = offers.map(o => ({
                id: o.sku,
                name: o.productName,
                price: o.price || 0,
                currency: o.currency || 'USD',
                sku: o.sku,
                img: '✨',
                reason: o.reason
            }));
        }

        // Format for downstream consumption (n8n + SmartInvoice.fromPayload)
        // Emit BOTH `offers` (for n8n envelope) and `recommendations` (for SmartInvoice bridge)
        const enriched = {
            has_offers: recommendations.length > 0,
            offers: recommendations.map(r => ({
                sku: r.sku || 'N/A',
                name: r.name,
                copy: r.description || r.reason || 'Recommended for you',
                price: r.price,
                currency: r.currency || 'USD',
                reason: r.reason || 'Popular choice'
            })),
            recommendations: recommendations.map(r => ({
                id: r.id,
                name: r.name,
                price: r.price || 0,
                img: r.img || '✨',
                sku: r.sku || 'N/A',
                reason: r.reason || 'Recommended',
                match: 90,
                badge: 'Smart Match',
                sales: ''
            })),
            personal_message: "",
            product_support: {},
            timestamp: new Date().toISOString()
        };

        logger.info({ smartContentHasOffers: enriched.has_offers, recsCount: enriched.recommendations.length }, '🧠 [RevenueService.getEnrichedContext] Context built and returning');
        return enriched;
    }

    private async addOffer(offers: Offer[], rule: any, businessId: string) {
        // Prevent duplicates
        if (offers.find(o => o.sku === rule.targetSku)) return;

        // Fetch Target Product details
        const product = await prisma.product.findFirst({
            where: { businessId, sku: rule.targetSku }
        });

        if (!product) {
            logger.warn(`Recommendation Rule ${rule.id} points to missing SKU: ${rule.targetSku}`);
            return;
        }

        // AI Copy Generation (Simulated for now if no template)
        let copy = rule.copyTemplate || `Upgrade to ${product.name}!`;
        if (rule.aiPromptContext && !rule.copyTemplate) {
            // TODO: Call LLM here with rule.aiPromptContext
            copy = `[AI Generated] ${product.name} is the perfect addition. ${rule.aiPromptContext}`;
        }

        offers.push({
            sku: product.sku || 'UNKNOWN',
            productName: product.name,
            copy: copy,
            price: product.price || 0,
            currency: product.currency,
            reason: rule.name
        });
    }
}
