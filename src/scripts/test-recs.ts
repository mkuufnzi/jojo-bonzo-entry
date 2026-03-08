import prisma from '../lib/prisma';
import { RecommendationService } from '../modules/recommendation/recommendation.service';

const recService = new RecommendationService();

async function main() {
    console.log('Testing Recommendation Engine with Unified Hub data...');
    
    // Find a business that actually has unified products
    const business = await prisma.business.findFirst({
        where: { unifiedProducts: { some: {} } }
    });
    
    if (!business) {
        console.log('No business with unifiedProducts found.');
        return;
    }
    
    console.log('Running recommendations for business:', business.id);
    
    const recs = await recService.getRecommendations({
        businessId: business.id,
        items: ['Some Random Item'], // Trigger fallback padding
        limit: 3
    });
    
    console.log('Generated Recommendations:', JSON.stringify(recs, null, 2));
}

main().finally(() => prisma.$disconnect());
