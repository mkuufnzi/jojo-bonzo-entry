
import dotenv from 'dotenv';
import path from 'path';

// Force load development env
dotenv.config({ path: path.resolve(__dirname, '../../../../environments/.env.development') });

import { RevenueService } from '../revenue/revenue.service';
import { EventBus } from '../events/event.bus';
import prisma from '../../../lib/prisma'; // Adjusted from ../../../../lib/prisma

// Helper to create test data
async function setup() {
    console.log('🏗️ Setting up test data...');
    
    // 1. Create Business
    const business = await prisma.business.create({
        data: { name: 'Verif Corp_' + Date.now() }
    });
    console.log('✅ Created Business:', business.id);

    // 2. Create Target Product (Upsell Item)
    const product = await prisma.product.create({
        data: {
            businessId: business.id,
            name: 'Premium Support Pack',
            sku: 'SUP-001',
            price: 99.00,
            currency: 'USD',
            source: 'manual',
            externalId: 'ext_sup_001'
        }
    });
    console.log('✅ Created Product:', product.sku);

    // 3. Create Rule (Trigger: "Basic Plan" -> Suggest: "Premium Support")
    await prisma.recommendationRule.create({
        data: {
            businessId: business.id,
            name: 'Upsell Support',
            triggerSku: 'BASIC-PLAN',
            targetSku: 'SUP-001',
            copyTemplate: 'Get peace of mind with 24/7 Premium Support!',
            priority: 10
        }
    });
    console.log('✅ Created Recommendation Rule');

    return { businessId: business.id };
}

async function verifyRevenueEngine(businessId: string) {
    console.log('\n🔍 Verifying Revenue Engine...');
    const service = new RevenueService();

    // Scenario: Customer bought "BASIC-PLAN"
    const offers = await service.getRecommendations({
        businessId,
        items: ['BASIC-PLAN'], // Matches trigger
        totalAmount: 50
    });

    if (offers.length > 0) {
        console.log('✅ Revenue Engine Success! Offers generated:', offers.length);
        console.log('   Offer:', offers[0].productName, '| Copy:', offers[0].copy);
    } else {
        console.error('❌ Revenue Engine Failed: No offers generated.');
        process.exit(1);
    }
}

async function verifyEventBus() {
    console.log('\n📡 Verifying Event Bus...');
    // We can't easily verify Redis reception in a script without a listener, 
    // but we can ensure the publish command doesn't throw.
    await EventBus.publish('verification.test_event', { status: 'ok' });
    console.log('✅ Event Bus Publish executed without error.');
}

async function main() {
    try {
        const { businessId } = await setup();
        await verifyRevenueEngine(businessId);
        await verifyEventBus();
        console.log('\n✨ Verification Complete!');
    } catch (e) {
        console.error('❌ Verification Error:', e);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
