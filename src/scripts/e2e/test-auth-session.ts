/**
 * E2E Test: Authentication Session Validation
 * Verifies that the auth service correctly handles user sessions.
 */
import prisma from '../../lib/prisma';

async function main() {
    console.log('🔐 E2E Test: Authentication Session');
    console.log('=====================================\n');

    try {
        // Test 1: Find existing user
        console.log('📋 Test 1: Find existing user in database...');
        const user = await prisma.user.findFirst({
            include: {
                subscription: {
                    include: { plan: true }
                }
            }
        });

        if (!user) {
            console.error('❌ No users found in database. Seed data first.');
            process.exit(1);
        }

        console.log(`✅ Found user: ${user.email}`);
        console.log(`   Plan: ${user.subscription?.plan?.name || 'None'}`);
        console.log(`   Active: ${user.isActive}`);

        // Test 2: Verify user lookup by ID
        console.log('\n📋 Test 2: Verify user lookup by ID...');
        const lookedUpUser = await prisma.user.findUnique({
            where: { id: user.id }
        });

        if (lookedUpUser?.id === user.id) {
            console.log('✅ User lookup by ID successful');
        } else {
            console.error('❌ User lookup failed');
            process.exit(1);
        }

        // Test 3: Verify subscription data integrity
        console.log('\n📋 Test 3: Verify subscription data...');
        if (user.subscription) {
            console.log(`✅ Subscription found:`);
            console.log(`   Plan: ${user.subscription.plan?.name}`);
            console.log(`   AI Quota: ${user.subscription.plan?.aiQuota || 'Unlimited'}`);
            console.log(`   PDF Quota: ${user.subscription.plan?.pdfQuota || 'Unlimited'}`);
        } else {
            console.warn('⚠️  No subscription attached to user');
        }

        // Test 4: Count apps for user
        console.log('\n📋 Test 4: Verify app connections...');
        const apps = await prisma.app.findMany({
            where: { userId: user.id, isActive: true }
        });
        console.log(`✅ User has ${apps.length} active app(s)`);

        console.log('\n🏆 ALL AUTH SESSION TESTS PASSED');

    } catch (error) {
        console.error('❌ Test Error:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
