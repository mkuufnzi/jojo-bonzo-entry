import Stripe from 'stripe';
import { User } from '@prisma/client';
import { PaymentProvider, CreateSubscriptionResult } from './payment.provider';
import { config } from '../../config/env';
import { logger } from '../../lib/logger';

export class StripeProvider implements PaymentProvider {
  private stripe: Stripe;

  constructor() {
    logger.debug({ version: '2024-06-20', keyPartial: config.STRIPE_SECRET_KEY ? 'Present' : 'MISSING' }, '🔧 Initializing Stripe');
    
    this.stripe = new Stripe(config.STRIPE_SECRET_KEY, {
      apiVersion: '2024-06-20' as any, // Type assertion needed due to package version mismatch
    });
  }

  async createCustomer(user: User): Promise<string> {
    const customer = await this.stripe.customers.create({
      email: user.email,
      name: user.name || undefined,
      metadata: {
        userId: user.id,
      },
    });
    return customer.id;
  }

  async getSubscription(subscriptionId: string) {
    try {
      return await this.stripe.subscriptions.retrieve(subscriptionId);
    } catch (error) {
      logger.error({ error, subscriptionId }, 'Error retrieving subscription');
      throw error;
    }
  }

  async createSubscription(customerId: string, priceId: string, paymentMethodId?: string): Promise<CreateSubscriptionResult> {
    const subscriptionData: any = {
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'error_if_incomplete', // Fail fast if payment can't complete
      off_session: true, // Allow charging without customer present
      payment_settings: { 
        save_default_payment_method: 'on_subscription',
        payment_method_types: ['card']
      },
      expand: ['latest_invoice.payment_intent'],
    };

    // If payment method provided, set it as default to trigger immediate charge
    if (paymentMethodId) {
      subscriptionData.default_payment_method = paymentMethodId;
    }

    const subscription = await this.stripe.subscriptions.create(subscriptionData);

    const invoice = subscription.latest_invoice as Stripe.Invoice;
    const paymentIntent = (invoice as any).payment_intent as Stripe.PaymentIntent;

    return {
      subscriptionId: subscription.id,
      clientSecret: paymentIntent?.client_secret || undefined,
      status: subscription.status,
    };
  }

  async cancelSubscription(subscriptionId: string, atPeriodEnd: boolean = false): Promise<void> {
    if (atPeriodEnd) {
      await this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    } else {
      await this.stripe.subscriptions.cancel(subscriptionId);
    }
  }

  async createSetupIntent(customerId: string): Promise<string> {
    const setupIntent = await this.stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    });
    
    if (!setupIntent.client_secret) {
        throw new Error('Failed to create setup intent client secret');
    }
    
    return setupIntent.client_secret;
  }

  async getPaymentMethodDetails(paymentMethodId: string) {
    const paymentMethod = await this.stripe.paymentMethods.retrieve(paymentMethodId);
    return {
      last4: paymentMethod.card?.last4 || '****',
      brand: paymentMethod.card?.brand || 'unknown',
      expMonth: paymentMethod.card?.exp_month || 0,
      expYear: paymentMethod.card?.exp_year || 0,
    };
  }
  
  // Helper to construct event from webhook signature
  constructWebhookEvent(payload: string | Buffer, signature: string, secret: string): Stripe.Event {
      return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }

  async createPaymentIntent(customerId: string, amount: number, currency: string, paymentMethodId: string): Promise<string> {
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Stripe expects cents
      currency,
      customer: customerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
    });
    return paymentIntent.id;
  }

  async detachPaymentMethod(paymentMethodId: string): Promise<void> {
    await this.stripe.paymentMethods.detach(paymentMethodId);
  }

  async updateSubscription(subscriptionId: string, newPriceId: string, paymentMethodId?: string): Promise<Stripe.Subscription> {
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    const itemId = subscription.items.data[0].id;

    const updateData: any = {
      items: [{
        id: itemId,
        price: newPriceId,
      }],
      proration_behavior: 'create_prorations',
      expand: ['latest_invoice.payment_intent'],
    };

    // If payment method provided, set it as default to trigger immediate charge
    if (paymentMethodId) {
      updateData.default_payment_method = paymentMethodId;
    }

    return this.stripe.subscriptions.update(subscriptionId, updateData);
  }

  /**
   * Fetch all active prices from Stripe with their product names
   * Used to sync Stripe Price IDs to the database Plans table
   */
  async fetchAllPricesWithProducts(): Promise<Array<{ priceId: string; productName: string; amount: number; currency: string; interval: string | null }>> {
    try {
      console.log('🔍 Fetching prices from Stripe...');
      console.log(`   Mode: ${config.STRIPE_SECRET_KEY.startsWith('sk_test_') ? 'TEST' : 'LIVE'}`);
      
      const prices = await this.stripe.prices.list({
        active: true,
        expand: ['data.product'],
        limit: 100,
      });

      console.log(`📊 Stripe returned ${prices.data.length} active prices`);
      
      if (prices.data.length === 0) {
        logger.warn('⚠️ No active prices found. Checking for ANY prices (including archived)...');
        const allPrices = await this.stripe.prices.list({
          expand: ['data.product'],
          limit: 10,
        });
        logger.info(`   Total prices (active + archived): ${allPrices.data.length}`);
        if (allPrices.data.length > 0) {
          allPrices.data.forEach(p => {
            logger.debug(`   - ${(p.product as Stripe.Product).name}: $${(p.unit_amount || 0) / 100} (${p.id}) [Active: ${p.active}]`);
          });
        }
      }

      // Group by product name and select highest price if multiple active prices exist
      const pricesByProduct = new Map<string, Stripe.Price>();
      
      for (const price of prices.data) {
        const productName = (price.product as Stripe.Product).name;
        const existing = pricesByProduct.get(productName);
        
        console.log(`   → ${productName}: $${(price.unit_amount || 0) / 100} (${price.id})`);
        
        // Select highest price if multiple exist for same product
        if (!existing || (price.unit_amount || 0) > (existing.unit_amount || 0)) {
          pricesByProduct.set(productName, price);
        }
      }

      console.log(`📦 After deduplication: ${pricesByProduct.size} unique products`);

      // Convert map to array
      return Array.from(pricesByProduct.values()).map(price => ({
        priceId: price.id,
        productName: (price.product as Stripe.Product).name,
        amount: price.unit_amount ? price.unit_amount / 100 : 0,
        currency: price.currency.toUpperCase(),
        interval: price.recurring?.interval || null,
      }));
    } catch (error: any) {
      logger.error({ error }, '❌ Stripe API Error in fetchAllPricesWithProducts');
      throw error; // Re-throw so boot.ts can handle it
    }
  }

  async createProduct(name: string, amount: number, interval: 'month' | 'year' = 'month'): Promise<{ priceId: string; productId: string }> {
    logger.info(`Creating Stripe Product: ${name} ($${amount}/${interval})`);
    
    // 1. Create Product
    const product = await this.stripe.products.create({
      name: name,
    });

    // 2. Create Price
    const price = await this.stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(amount * 100),
      currency: 'usd',
      recurring: {
        interval: interval,
      },
    });

    return {
      priceId: price.id,
      productId: product.id,
    };
  }

  async fetchAllInvoices(): Promise<Stripe.Invoice[]> {
    try {
        return await this.stripe.invoices.list({
            limit: 100,
            status: 'paid', // Mostly interested in paid invoices for MRR
            expand: ['data.charge'] 
        }).autoPagingToArray({ limit: 1000 });
    } catch (error) {
        logger.error({ error }, 'Error fetching Stripe invoices');
        return [];
    }
  }
}
