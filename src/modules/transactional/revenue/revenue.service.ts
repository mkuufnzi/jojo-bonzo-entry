
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

        try {
            // 1. Fetch Rules (Cached in Redis ideally, currently DB)
            // Priority: Specific SKU Trigger > Category Trigger > Global Fallback
            
            // For MVP: Fetch ALL active rules for business and filter in memory 
            // (Assumes < 100 rules per tenant, safe for now)
            const rules = await prisma.recommendationRule.findMany({
                where: { businessId, isActive: true },
                orderBy: { priority: 'desc' }
            });

            if (rules.length === 0) return [];

            // 2. Logic Engine: Find best match
            for (const item of items) {
                // Exact Match
                const skuMatch = rules.find(r => r.triggerSku && item.includes(r.triggerSku));
                if (skuMatch) {
                    await this.addOffer(offers, skuMatch, businessId);
                    continue;
                }
            }

            // 3. Fallback: If no offers yet, use Global/Category rules
            if (offers.length === 0) {
                const globalRule = rules.find(r => !r.triggerSku && !r.triggerCategory);
                if (globalRule) {
                    await this.addOffer(offers, globalRule, businessId);
                }
            }

            return offers;

        } catch (error) {
            logger.error({ err: error, businessId }, 'Failed to generate recommendations');
            return []; // Fail gracefully (empty upsells)
        }
    }

    /**
     * Context Provider: Gets enriched "Smart Content" for a document dispatch.
     * Consolidates personal message and potential upsells into a single block.
     */
    async getEnrichedContext(businessId: string, items: string[]): Promise<any> {
        logger.info({ businessId, itemCount: items.length }, '🧠 [RevenueService] Generating Enriched Context');
        
        const offers = await this.getRecommendations({ 
            businessId, 
            items, 
            totalAmount: 0 // Amount check logic can be expanded later
        });

        // Format for n8n consumption (Strict Schema)
        return {
            has_offers: offers.length > 0,
            offers: offers.map(o => ({
                sku: o.sku,
                name: o.productName,
                copy: o.copy,
                price: o.price,
                currency: o.currency,
                reason: o.reason
            })),
            // Default personal message if no specific logic exists yet
            personal_message: offers.length > 0 
                ? `We thought you might like these additions to your ${items[0] || 'order'}!`
                : "Thank you for being a valued customer!",
            timestamp: new Date().toISOString()
        };
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
