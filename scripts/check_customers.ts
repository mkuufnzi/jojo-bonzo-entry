import { StripeProvider } from '../src/services/payment/stripe.provider';

async function checkCustomerBalance() {
  console.log('🔍 Checking Customer Balances and Payment Methods...\n');
  
  const stripeProvider = new StripeProvider();
  const stripe = (stripeProvider as any).stripe;
  
  try {
    // Get customers
    const customers = await stripe.customers.list({ limit: 10 });
    
    console.log(`👥 Customers: ${customers.data.length}\n`);
    
    for (const customer of customers.data) {
      console.log(`Customer: ${customer.email || customer.id}`);
      console.log(`  Balance: ${customer.balance / 100} ${customer.currency?.toUpperCase() || 'GBP'}`);
      console.log(`  Delinquent: ${customer.delinquent ? 'YES ⚠️' : 'NO'}`);
      
      // Get payment methods
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customer.id,
        type: 'card',
      });
      
      console.log(`  Payment Methods: ${paymentMethods.data.length}`);
      paymentMethods.data.forEach((pm: any) => {
        console.log(`    - ${pm.card.brand} ****${pm.card.last4} (${pm.id})`);
      });
      
      // Get subscriptions
      const subs = await stripe.subscriptions.list({
        customer: customer.id,
      });
      
      console.log(`  Subscriptions: ${subs.data.length}`);
      subs.data.forEach((sub: any) => {
        console.log(`    - ${sub.id}: ${sub.status} - Default PM: ${sub.default_payment_method || 'NONE'}`);
      });
      
      console.log('');
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

checkCustomerBalance();
