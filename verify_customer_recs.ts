
import { recommendationService } from './src/modules/recommendation/recommendation.service';
import prisma from './src/lib/prisma';
import { logger } from './src/lib/logger';

async function verify() {
    try {
        // 1. Fetch a sample customer
        const customer = await prisma.unifiedCustomer.findFirst({
            take: 1
        });

        if (!customer) {
            console.error('No customers found in Unified Hub');
            return;
        }

        console.log(`\n--- TESTING RECOMMENDATION FOR: ${customer.name} (${customer.id}) ---`);
        console.log(`Business ID: ${customer.businessId}\n`);

        // 2. Fetch 3 recommendations
        const recs = await recommendationService.getRecommendations({
            businessId: customer.businessId,
            customerId: customer.id,
            items: [], // Testing pure personalization
            limit: 3
        });

        console.log(`\n--- RESULTS: ${recs.length} RECOMMENDATIONS ---`);
        recs.forEach((r, idx) => {
            console.log(`${idx + 1}. [${r.sku}] ${r.name}`);
            console.log(`   Price: ${r.price} ${r.currency}`);
            console.log(`   Reason: ${r.reason}`);
            console.log(`   Img: ${r.img}\n`);
        });

        if (recs.length === 3) {
            console.log('✅ SUCCESS: Exactly 3 recommendations retrieved.');
        } else {
            console.log(`⚠️ WARNING: Retrieved ${recs.length} recommendations instead of 3.`);
        }

    } catch (error) {
        console.error('Verification failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

verify();
