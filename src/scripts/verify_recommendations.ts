import { RecommendationService } from '../modules/recommendation/recommendation.service';
import prisma from '../lib/prisma';
import { logger } from '../lib/logger';

async function verifyRecommendationEngine() {
    const service = new RecommendationService();
    
    // Find a business with synchronized data
    const business = await prisma.business.findFirst({
        include: {
            unifiedProducts: true,
            unifiedCustomers: { include: { orders: true } }
        }
    });

    if (!business) {
        console.error('❌ No business found for testing.');
        process.exit(1);
    }

    console.log(`\n🧪 Testing Recommendation Engine for Business: ${business.name} (${business.id})`);

    try {
        // 1. Test Rich Analytics
        console.log('\n--- 📊 Rich Analytics ---');
        const analytics = await service.getRichAnalytics(business.id);
        console.log('Category Distribution:', JSON.stringify(analytics.categoryDistribution, null, 2));
        console.log('Customer Clusters:', JSON.stringify(analytics.customerClusters, null, 2));
        console.log('Top Affinities:', JSON.stringify(analytics.affinities, null, 2));

        if (analytics.categoryDistribution.length > 0) console.log('✅ Categories fetched successfully');
        else console.log('⚠️ No categories found (check UnifiedProduct metadata)');

        // 2. Test Affinity-based Recommendations
        console.log('\n--- 🤖 Affinity-based Recommendations ---');
        const firstProd = business.unifiedProducts[0];
        if (firstProd) {
            const recommendations = await service.getRecommendations({
                businessId: business.id,
                items: [firstProd.name],
                limit: 3
            });
            console.log(`Recommendations for "${firstProd.name}":`, JSON.stringify(recommendations, null, 2));
            
            if (recommendations.length > 0) console.log('✅ Recommendations generated successfully');
            else console.log('❌ Failed to generate any recommendations');
        } else {
            console.log('⚠️ No products found to test recommendations');
        }

    } catch (error) {
        console.error('❌ Verification failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

verifyRecommendationEngine().catch(console.error);
