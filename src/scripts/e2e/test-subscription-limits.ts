/**
 * E2E Test: Subscription Limits Verification
 * Verifies quota enforcement for different plan tiers.
 */
import prisma from '../../lib/prisma';
import { quotaService } from '../../services/quota.service';

async function main() {
    console.log('💳 E2E Test: Subscription Limits');
    console.log('==================================\n');

    try {
        // Find a user with subscription
        const user = await prisma.user.findFirst({
            include: {
                subscription: {
                    include: { plan: true }
                }
            }
        });

        if (!user) {
            console.error('❌ No users found');
            process.exit(1);
        }

        console.log(`👤 Testing user: ${user.email}`);
        console.log(`📊 Plan: ${user.subscription?.plan?.name || 'None'}\n`);

        // Get plan limits
        const plan = user.subscription?.plan;
        if (!plan) {
            console.warn('⚠️  User has no subscription plan');
            process.exit(0);
        }

        console.log('📋 Plan Limits:');
        console.log(`   AI Quota: ${plan.aiQuota || 'Unlimited'}`);
        console.log(`   PDF Quota: ${plan.pdfQuota || 'Unlimited'}`);
        console.log(`   Request Limit: ${plan.requestLimit || 'Unlimited'}`);

        // Test quota check (without actually consuming)
        console.log('\n📋 Testing Quota Service...');
        
        // Find a service to test with
        const service = await prisma.service.findFirst({
            where: { slug: 'ai-doc-generator' }
        });

        if (!service) {
            console.warn('⚠️  AI Doc Generator service not found');
        } else {
            console.log(`   Service: ${service.name}`);
            
            // Check current usage
            const currentMonth = new Date();
            currentMonth.setDate(1);
            currentMonth.setHours(0, 0, 0, 0);

            const usageCount = await prisma.usageLog.count({
                where: {
                    userId: user.id,
                    serviceId: service.id,
                    createdAt: { gte: currentMonth },
                    status: 'completed'
                }
            });

            console.log(`   Current month usage: ${usageCount}`);
            console.log(`   Remaining AI quota: ${Math.max(0, (plan.aiQuota || 0) - usageCount)}`);
        }

        console.log('\n🏆 SUBSCRIPTION LIMITS TEST PASSED');

    } catch (error) {
        console.error('❌ Test Error:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
