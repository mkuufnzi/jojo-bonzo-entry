import prisma from '../src/lib/prisma';
import { StripeProvider } from '../src/services/payment/stripe.provider';

async function resetAllSubscriptions() {
  console.log('🔄 Starting subscription reset...');
  
  const stripeProvider = new StripeProvider();
  
  // Get all users with active Stripe subscriptions
  const users = await prisma.user.findMany({
    where: {
      stripeCustomerId: { not: null }
    },
    include: {
      subscription: true
    }
  });

  console.log(`Found ${users.length} users with Stripe customer IDs`);

  // Get the Free plan
  const freePlan = await prisma.plan.findFirst({
    where: { name: 'Free' }
  });

  if (!freePlan) {
    throw new Error('Free plan not found in database');
  }

  let cancelledCount = 0;
  let errorCount = 0;

  for (const user of users) {
    try {
      // Cancel Stripe subscription if exists
      if (user.subscription?.stripeSubscriptionId) {
        console.log(`Cancelling subscription for ${user.email}...`);
        await stripeProvider.cancelSubscription(user.subscription.stripeSubscriptionId, false);
        cancelledCount++;
      }

      // Update local subscription to Free plan
      if (user.subscription) {
        await prisma.subscription.update({
          where: { id: user.subscription.id },
          data: {
            planId: freePlan.id,
            status: 'active',
            stripeSubscriptionId: null,
            startDate: new Date(),
            endDate: null
          }
        });
      } else {
        // Create Free subscription if none exists
        await prisma.subscription.create({
          data: {
            userId: user.id,
            planId: freePlan.id,
            status: 'active',
            startDate: new Date()
          }
        });
      }

      console.log(`✅ Reset ${user.email} to Free plan`);
    } catch (error: any) {
      console.error(`❌ Error resetting ${user.email}:`, error.message);
      errorCount++;
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   Subscriptions cancelled: ${cancelledCount}`);
  console.log(`   Users reset to Free: ${users.length - errorCount}`);
  console.log(`   Errors: ${errorCount}`);
  console.log('\n✅ Reset complete!');
  
  await prisma.$disconnect();
}

resetAllSubscriptions().catch(console.error);
