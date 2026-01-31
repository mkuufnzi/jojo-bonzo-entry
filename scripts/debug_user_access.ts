
import prisma from '../src/lib/prisma';

async function main() {
  const email = 'bwj.afs.tools.test@gmail.com';
  console.log(`🔍 Inspecting user: ${email}`);

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      subscription: {
        include: {
          plan: {
            include: {
              // @ts-ignore
              planFeatures: {
                include: {
                  feature: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!user) {
    console.log('❌ User not found');
    return;
  }

  const userAny = user as any;

  console.log(`✅ User found: ${userAny.id}`);
  
  if (!userAny.subscription) {
    console.log('❌ No subscription found');
    return;
  }

  console.log(`📋 Subscription Status: ${userAny.subscription.status}`);
  console.log(`📋 Plan: ${userAny.subscription.plan.name} (ID: ${userAny.subscription.plan.id})`);
  
  console.log('\n🧩 Plan Features (New System):');
  if (userAny.subscription.plan.planFeatures && userAny.subscription.plan.planFeatures.length > 0) {
    userAny.subscription.plan.planFeatures.forEach((pf: any) => {
      console.log(`   - ${pf.feature.key} (${pf.feature.name}): ${pf.isEnabled ? '✅ Enabled' : '❌ Disabled'}`);
    });
  } else {
    console.log('   ❌ No PlanFeatures found for this plan.');
  }

  console.log('\n📜 Legacy Features String:');
  console.log(`   ${userAny.subscription.plan.features}`);
  
  // Check specifically for ai_generation
  const aiFeature = userAny.subscription.plan.planFeatures.find((pf: any) => pf.feature.key === 'ai_generation');
  console.log('\n🤖 AI Generation Check:');
  if (aiFeature && aiFeature.isEnabled) {
    console.log('   ✅ Access SHOULD be granted via PlanFeature.');
  } else {
    console.log('   ❌ Access blocked via PlanFeature.');
  }

}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
