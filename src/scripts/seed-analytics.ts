import { PrismaClient } from '@prisma/client';
import { analyticsService } from '../services/analytics.service';
import { recommendationService } from '../modules/recommendation/recommendation.service';

const prisma = new PrismaClient();

async function main() {
    const businessId = '00000000-0000-0000-0000-000000000000'; // Replace with a real ID if available, or use dummy
    
    // 1. Find a real business if possible
    const business = await prisma.business.findFirst();
    if (!business) {
        console.error('No business found to seed analytics for');
        return;
    }
    
    const targetBusinessId = business.id;
    console.log(`Seeding analytics for business: ${targetBusinessId}`);

    // 2. Clear old events for this business (optional, for clean test)
    await prisma.analyticsEvent.deleteMany({
        where: { businessId: targetBusinessId }
    });

    // 3. Log Impressions
    console.log('Logging 10 impressions...');
    for (let i = 0; i < 10; i++) {
        await analyticsService.logEvent({
            businessId: targetBusinessId,
            type: 'recommendation_impression',
            metadata: { sku: 'SKU-TEST-' + (i % 3) }
        });
    }

    // 4. Log Conversions
    console.log('Logging 2 conversions...');
    await analyticsService.logEvent({
        businessId: targetBusinessId,
        type: 'recommendation_conversion',
        amount: 25.50,
        metadata: { sku: 'SKU-TEST-0' }
    });
    await analyticsService.logEvent({
        businessId: targetBusinessId,
        type: 'recommendation_conversion',
        amount: 15.00,
        metadata: { sku: 'SKU-TEST-1' }
    });

    // 5. Verify via RecommendationService
    console.log('Fetching analytics summary...');
    const result = await recommendationService.getAnalyticsOverview(targetBusinessId);
    console.log('Analytics Result:', JSON.stringify(result, null, 2));

    if (result.impressions === 10 && result.conversions === 2) {
        console.log('✅ Verification Successful: Counts match');
    } else {
        console.error('❌ Verification Failed: Counts mismatch');
    }
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
