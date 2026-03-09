
import { recommendationService } from './src/modules/recommendation/recommendation.service';
import prisma from './src/lib/prisma';

async function verifyPlaygroundLogic() {
    try {
        const businessId = '211697f7-22e5-4f21-b218-daf742db70db'; // Sample business
        
        console.log('--- TEST 1: ITEMS ONLY ---');
        const res1 = await recommendationService.getRecommendations({
            businessId,
            items: ['Remote Control Car'],
            limit: 3
        });
        console.log('Results (Items):', JSON.stringify(res1.map(r => ({ name: r.name, reason: r.reason })), null, 2));

        console.log('\n--- TEST 2: CUSTOMER ONLY ---');
        const customer = await prisma.unifiedCustomer.findFirst({ where: { businessId } });
        if (customer) {
            const res2 = await recommendationService.getRecommendations({
                businessId,
                customerId: customer.id,
                items: [],
                limit: 3
            });
            console.log(`Results (Customer: ${customer.name}):`, JSON.stringify(res2.map(r => ({ name: r.name, reason: r.reason })), null, 2));
        }

        console.log('\n--- TEST 3: HYBRID (Items + Customer) ---');
        if (customer) {
            const res3 = await recommendationService.getRecommendations({
                businessId,
                customerId: customer.id,
                items: ['Puzzle Game 1000 Pieces'],
                limit: 3
            });
            console.log('Results (Hybrid):', JSON.stringify(res3.map(r => ({ name: r.name, reason: r.reason })), null, 2));
        }

    } catch (error) {
        console.error('Logic verification failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

verifyPlaygroundLogic();
