
import prisma from '../src/lib/prisma';
import { FeatureAccessService } from '../src/services/feature-access.service';

async function main() {
    try {
        console.log('🔍 Checking Features Table...');
        const features = await prisma.feature.findMany();
        features.forEach(f => console.log(`   - [${f.key}] ${f.name} (ID: ${f.id})`));

        console.log('\n🔍 Checking Recent Users (Last 5)...');
        const users = await prisma.user.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: {
                subscription: {
                    include: {
                        plan: {
                            include: {
                                planFeatures: {
                                    include: { feature: true }
                                }
                            }
                        }
                    }
                }
            }
        });

        for (const user of users) {
            console.log(`\n👤 User: ${user.email} (${user.id})`);
            console.log(`   Plan: ${user.subscription?.plan?.name || 'None'}`);
            console.log(`   Status: ${user.subscription?.status || 'N/A'}`);
            console.log(`   Stripe Sub ID: ${user.subscription?.stripeSubscriptionId || 'N/A'}`);
            
            if (user.subscription?.plan) {
                 console.log(`   Quotas: AI=${user.subscription.plan.aiQuota}, PDF=${user.subscription.plan.pdfQuota}`);
                 console.log(`   Real Check: hasAiAccess=${FeatureAccessService.hasAiAccess(user)}`);
                 
                 const pfs = user.subscription.plan.planFeatures || [];
                 if (pfs.length === 0) {
                     console.log('   ⚠️ No PlanFeatures linked!');
                 } else {
                     console.log('   Linked Features:');
                     pfs.forEach(pf => console.log(`      - ${pf.feature.key}: ${pf.isEnabled ? 'Enabled' : 'Disabled'}`));
                 }
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
