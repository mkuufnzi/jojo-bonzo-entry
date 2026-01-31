import { quotaService } from '../src/services/quota.service';
import prisma from '../src/lib/prisma';

async function verifyStrictQuota() {
    console.log('🧪 Starting Strict Quota Verification...');

    // 1. Setup: Get or Create a Test User with 'Teaser' Plan (Low Quota)
    console.log('1. Setting up Test User (Teaser Plan)...');
    const userEmail = 'quota_test@example.com';
    let user = await prisma.user.findUnique({ where: { email: userEmail } });

    if (!user) {
        user = await prisma.user.create({
            data: {
                email: userEmail,
                name: 'Quota Tester',
                password: '',
                isActive: true
            }
        });
    }

    const teaserPlan = await prisma.plan.findUnique({ where: { name: 'Teaser' } }); // 5 AI docs
    if (!teaserPlan) throw new Error('Teaser plan not found');

    await prisma.subscription.upsert({
        where: { userId: user.id },
        create: { userId: user.id, planId: teaserPlan.id, status: 'active' },
        update: { planId: teaserPlan.id, status: 'active' }
    });

    console.log(`   User ${user.id} is on Teaser Plan (Limit: ${teaserPlan.aiQuota})`);

    // Fetch Real Service ID
    const service = await prisma.service.findUnique({ where: { slug: 'ai-doc-generator' } });
    if (!service) throw new Error('Service ai-doc-generator not found');

    // 2. Mock Usage to Limit - 1
    console.log('2. Mocking Usage to Limit-1 (4/5)...');
    // Clear old logs
    await prisma.usageLog.deleteMany({ where: { userId: user.id } });
    
    // Create 4 dummy logs
    const now = new Date();
    for (let i = 0; i < 4; i++) {
        await prisma.usageLog.create({
            data: {
                userId: user.id,
                serviceId: service.id, // REAL ID
                action: 'ai_generate_html',
                resourceType: 'ai',
                status: 'success',
                statusCode: 200,
                cost: 0,
                duration: 100
            }
        });
    }

    // 3. Test: Should Pass
    console.log('3. Testing CheckQuota (Should PASS)...');
    try {
        await quotaService.checkQuota(user.id, 'ai-doc-generator');
        console.log('   ✅ Passed (As Expected)');
    } catch (e: any) {
        console.error('   ❌ FAILED: blocked prematurely', e.message);
        process.exit(1);
    }

    // 4. Mock Usage to Limit (5/5)
    console.log('4. Mocking Usage to Limit (5/5)...');
    await prisma.usageLog.create({
        data: {
            userId: user.id,
            serviceId: service.id, // REAL ID
            action: 'ai_generate_html',
            resourceType: 'ai',
            status: 'success',
            statusCode: 200,
            cost: 0,
            duration: 100
        }
    });

    // 5. Test: Should Fail (Strict Quota)
    console.log('5. Testing CheckQuota (Should FAIL/THROW)...');
    try {
        await quotaService.checkQuota(user.id, 'ai-doc-generator');
        console.error('   ❌ FAILED: CheckQuota did NOT throw error!');
        process.exit(1);
    } catch (e: any) {
        if (e.statusCode === 403 && e.message.includes('Quota Exceeded')) {
            console.log('   ✅ Passed: Caught Expected 403 Error');
            console.log(`      Error: "${e.message}"`);
        } else {
            console.error('   ❌ FAILED: Caught unexpected error:', e);
            process.exit(1);
        }
    }

    console.log('\n✨ Verification Complete: Strict Quota Logic is Working.');
}

verifyStrictQuota()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
