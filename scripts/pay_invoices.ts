import { StripeProvider } from '../src/services/payment/stripe.provider';

async function payPendingInvoices() {
  console.log('💳 Attempting to Pay Pending Invoices...\n');
  
  const stripeProvider = new StripeProvider();
  const stripe = (stripeProvider as any).stripe;
  
  try {
    // Get unpaid/open invoices
    const invoices = await stripe.invoices.list({ 
      status: 'open',
      limit: 10 
    });
    
    console.log(`📋 Open Invoices: ${invoices.data.length}\n`);
    
    for (const invoice of invoices.data) {
      console.log(`Invoice: ${invoice.id}`);
      console.log(`  Amount: ${invoice.amount_due / 100} ${invoice.currency.toUpperCase()}`);
      console.log(`  Customer: ${invoice.customer_email || invoice.customer}`);
      
      try {
        // Attempt to pay the invoice
        const paid = await stripe.invoices.pay(invoice.id, {
          paid_out_of_band: false, // Actually charge the card
        });
        
        console.log(`  ✅ Payment successful! Status: ${paid.status}`);
      } catch (error: any) {
        console.log(`  ❌ Payment failed: ${error.message}`);
      }
      console.log('');
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

payPendingInvoices();
