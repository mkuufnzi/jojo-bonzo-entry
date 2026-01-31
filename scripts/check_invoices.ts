import { StripeProvider } from '../src/services/payment/stripe.provider';

async function checkInvoices() {
  console.log('🔍 Checking Recent Invoices and Payments...\n');
  
  const stripeProvider = new StripeProvider();
  const stripe = (stripeProvider as any).stripe;
  
  try {
    // Get recent invoices
    const invoices = await stripe.invoices.list({ limit: 10 });
    
    console.log(`📋 Recent Invoices: ${invoices.data.length}\n`);
    
    invoices.data.forEach((invoice: any, i: number) => {
      console.log(`Invoice ${i + 1}:`);
      console.log(`  Amount: ${invoice.amount_paid / 100} ${invoice.currency.toUpperCase()}`);
      console.log(`  Status: ${invoice.status}`);
      console.log(`  Paid: ${invoice.paid ? 'YES ✅' : 'NO ❌'}`);
      console.log(`  Customer: ${invoice.customer_email || invoice.customer}`);
      console.log(`  Created: ${new Date(invoice.created * 1000).toLocaleString()}`);
      console.log(`  Subscription: ${invoice.subscription || 'N/A'}`);
      console.log('');
    });
    
    // Get recent successful charges
    const charges = await stripe.charges.list({ limit: 10 });
    const successfulCharges = charges.data.filter((c: any) => c.status === 'succeeded');
    
    console.log(`💰 Successful Charges: ${successfulCharges.length}/${charges.data.length}\n`);
    
    successfulCharges.forEach((charge: any, i: number) => {
      console.log(`Charge ${i + 1}:`);
      console.log(`  Amount: ${charge.amount / 100} ${charge.currency.toUpperCase()}`);
      console.log(`  Card: ${charge.payment_method_details?.card?.brand} ****${charge.payment_method_details?.card?.last4}`);
      console.log(`  Created: ${new Date(charge.created * 1000).toLocaleString()}`);
      console.log('');
    });
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

checkInvoices();
