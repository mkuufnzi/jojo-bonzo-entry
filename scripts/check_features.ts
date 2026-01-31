
import prisma from '../src/lib/prisma';

async function main() {
  try {
    const plans = await prisma.plan.findMany({
      include: {
        planFeatures: {
          include: {
            feature: true
          }
        }
      }
    });

    console.log('Plans and Features:');
    plans.forEach(plan => {
      console.log(`Plan: ${plan.name} (${plan.price})`);
      if (plan.planFeatures.length === 0) {
        console.log('  No features assigned.');
      } else {
        plan.planFeatures.forEach(pf => {
          console.log(`  - ${pf.feature.name} (${pf.feature.key}): ${pf.isEnabled ? 'Enabled' : 'Disabled'}`);
        });
      }
      console.log('---');
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
