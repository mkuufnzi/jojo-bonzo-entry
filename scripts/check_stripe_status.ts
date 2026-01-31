import { StripeProvider } from '../src/services/payment/stripe.provider';

async function checkStripeStatus() {
  console.log('🔍 Checking Stripe Account Status...\n');
  
  const stripeProvider = new StripeProvider();
  
  try {
    // Fetch account balance to confirm API access
    const balance = await (stripeProvider as any).stripe.balance.retrieve();
    
    console.log('✅ Stripe API Connection: SUCCESS');
    console.log(`📊 Account Mode: ${balance.livemode ? 'LIVE' : 'TEST'}`);
    console.log(`💰 Available Balance: ${balance.available.map((b: any) => `${b.amount / 100} ${b.currency.toUpperCase()}`).join(', ')}`);
    console.log(`⏳ Pending Balance: ${balance.pending.map((b: any) => `${b.amount / 100} ${b.currency.toUpperCase()}`).join(', ')}`);
    
    // Fetch recent charges to see if any payments are processing
    const charges = await (stripeProvider as any).stripe.charges.list({ limit: 5 });
    console.log(`\n📋 Recent Charges: ${charges.data.length}`);
    charges.data.forEach((charge: any, i: number) => {
      console.log(`  ${i + 1}. ${charge.amount / 100} ${charge.currency.toUpperCase()} - Status: ${charge.status} - ${new Date(charge.created * 1000).toLocaleString()}`);
    });
    
    // Fetch recent payment intents
    const paymentIntents = await (stripeProvider as any).stripe.paymentIntents.list({ limit: 5 });
    console.log(`\n💳 Recent Payment Intents: ${paymentIntents.data.length}`);
    paymentIntents.data.forEach((pi: any, i: number) => {
      console.log(`  ${i + 1}. ${pi.amount / 100} ${pi.currency.toUpperCase()} - Status: ${pi.status} - ${new Date(pi.created * 1000).toLocaleString()}`);
    });
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

checkStripeStatus();
