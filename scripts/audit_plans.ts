
import prisma from '../src/lib/prisma';

async function main() {
  console.log('🤖 Auditing Plans & Features...\n');

  const plans = await prisma.plan.findMany({
    include: {
      planFeatures: {
        include: {
          feature: true
        }
      }
    },
    orderBy: { price: 'asc' }
  });

  for (const plan of plans) {
    console.log(`\n📦 Plan: ${plan.name} ($${plan.price}) [ID: ${plan.id}]`);
    console.log(`   Legacy Features String: ${plan.features}`);
    
    if (plan.planFeatures.length === 0) {
      console.log('   ⚠️ NO PLAN FEATURES ASSIGNED (New System)');
    } else {
      console.log('   ✅ Assigned Features:');
      plan.planFeatures.forEach(pf => {
        console.log(`      - [${pf.isEnabled ? 'x' : ' '}] ${pf.feature.key} ("${pf.feature.name}")`);
      });
    }

    // specific check for AI
    const hasAi = plan.planFeatures.some(pf => pf.feature.key === 'ai_generation' && pf.isEnabled);
    console.log(`   🤖 AI Access: ${hasAi ? 'GRANTED' : 'DENIED'}`);
  }

  console.log('\n\n🔑 Checking Feature Definitions:');
  const features = await prisma.feature.findMany();
  features.forEach(f => {
    console.log(`   - ${f.key}: "${f.name}" (${f.description})`);
  });
}

main()
  .catch(console.error)
  .finally(async () => await prisma.$disconnect());
