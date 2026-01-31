
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
     * Helper: Resolve Target Product & Format Offer
     */
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
