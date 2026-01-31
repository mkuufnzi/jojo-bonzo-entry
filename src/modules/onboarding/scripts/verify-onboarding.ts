
import dotenv from 'dotenv';
import path from 'path';

// Force load development env
dotenv.config({ path: path.resolve(__dirname, '../../../../environments/.env.development') });

import { OnboardingService } from '../services/onboarding.service';
import prisma from '../../../lib/prisma'; // Corrected depth
import { OnboardingStatus } from '@prisma/client';

async function setup() {
    console.log('🏗️ Setting up Onboarding test data...');
    
    // 1. Create Business
    const business = await prisma.business.create({
        data: { 
            name: 'Onboard Corp_' + Date.now(),
            onboardingStatus: 'NOT_STARTED',
            currentOnboardingStep: 0
        } as any // Bypass stale IDE types
    });
    console.log('✅ Created Business:', business.id);
    return { businessId: business.id };
}

async function verifyOnboarding(businessId: string) {
    console.log('\n🔍 Verifying Onboarding Service...');
    const service = new OnboardingService();

    // 1. Check Initial Status
    console.log('👉 Case 1: Initial Status');
    const result1 = await service.getOnboardingStatus({
        businessId,
        appId: 'test-app', // Mock App ID
        userId: 'test-user'
    });
    console.log('   Result:', result1);

    if (result1.status === 'NOT_STARTED' && result1.redirectUrl?.includes('step/1')) {
        console.log('✅ Correctly redirects to Step 1');
    } else {
        throw new Error('Failed Case 1');
    }

    // 2. Simulate Update (Direct DB update for test)
    console.log('\n👉 Case 2: In Progress');
    await prisma.business.update({
        where: { id: businessId },
        data: { onboardingStatus: 'IN_PROGRESS', currentOnboardingStep: 2 } as any
    });

    const result2 = await service.getOnboardingStatus({
        businessId,
        appId: 'test-app'
    });
    console.log('   Result:', result2);

    if (result2.step === 2 && result2.redirectUrl?.includes('step/3')) {
        console.log('✅ Correctly redirects to Step 3');
    } else {
        throw new Error('Failed Case 2');
    }
}

async function main() {
    try {
        const { businessId } = await setup();
        await verifyOnboarding(businessId);
        console.log('\n✨ Onboarding Verification Complete!');
    } catch (e) {
        console.error('❌ Verification Error:', e);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
