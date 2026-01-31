import { PaymentRepository } from '../repositories/payment.repository';
import { StripeProvider } from './payment/stripe.provider';
import { SubscriptionRepository } from '../repositories/subscription.repository';
import { emailService } from './email.service';
import { notificationService } from './notification.service';
import prisma from '../lib/prisma';

export class BillingService {
  private paymentRepository: PaymentRepository;
  private stripeProvider: StripeProvider;
  private subscriptionRepository: SubscriptionRepository;

  constructor() {
    this.paymentRepository = new PaymentRepository();
    this.stripeProvider = new StripeProvider();
    this.subscriptionRepository = new SubscriptionRepository();
  }

  /**
   * Ensure user has a Stripe Customer ID
   */
  async ensureCustomer(userId: string): Promise<string> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    if (user.stripeCustomerId) {
      return user.stripeCustomerId;
    }

    const customerId = await this.stripeProvider.createCustomer(user);
    
    await prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customerId }
    });

    return customerId;
  }

  /**
   * Create a SetupIntent for adding a card
   */
  async createSetupIntent(userId: string) {
    const customerId = await this.ensureCustomer(userId);
    return this.stripeProvider.createSetupIntent(customerId);
  }

  /**
   * Save a payment method after frontend confirmation
   */
  async savePaymentMethod(userId: string, paymentMethodId: string) {
    const details = await this.stripeProvider.getPaymentMethodDetails(paymentMethodId);
    
    // Check if it's the first one, make it default
    const existing = await this.paymentRepository.findAllMethods(userId);
    const isDefault = existing.length === 0;

    return this.paymentRepository.createMethod({
      user: { connect: { id: userId } },
      provider: 'stripe',
      type: 'card',
      providerMethodId: paymentMethodId,
      last4: details.last4,
      expiry: `${details.expMonth}/${details.expYear}`,
      isDefault,
    });
  }

  /**
   * Create a pending invoice for a subscription upgrade
   */
  async createPendingInvoice(userId: string, amount: number, subscriptionId: string | null, paymentMethodId: string) {
    // Idempotency check
    const existingInvoice = await this.paymentRepository.findPendingInvoice(userId, amount);

    if (existingInvoice) {
      return existingInvoice;
    }

    return await this.paymentRepository.createInvoice({
      user: { connect: { id: userId } },
      paymentMethod: { connect: { id: paymentMethodId } },
      subscription: subscriptionId ? { connect: { id: subscriptionId } } : undefined,
      amount,
      status: 'pending',
      currency: 'USD',
    });
  }


  async getStripeSubscription(subscriptionId: string) {
    return this.stripeProvider.getSubscription(subscriptionId);
  }

  /**
   * Process payment for an invoice
   */
  async processInvoicePayment(invoiceId: string) {
    const invoice = await this.paymentRepository.findInvoiceById(invoiceId);

    if (!invoice) throw new Error('Invoice not found');
    if (invoice.status === 'paid') return invoice; // Idempotent success

    if (!invoice.paymentMethod) throw new Error('No payment method attached to invoice');
    if (!invoice.paymentMethod.providerMethodId) throw new Error('Payment method has no provider ID');

    try {
      // Charge the card
      const user = await prisma.user.findUnique({ where: { id: invoice.userId } });
      if (!user || !user.stripeCustomerId) throw new Error('User has no stripe customer ID');

      await this.stripeProvider.createPaymentIntent(
        user.stripeCustomerId,
        invoice.amount,
        invoice.currency,
        invoice.paymentMethod.providerMethodId
      );

      return await this.paymentRepository.updateInvoiceStatus(invoiceId, 'paid');
    } catch (error) {
      await this.paymentRepository.updateInvoiceStatus(invoiceId, 'failed');
      throw error;
    }
  }

  async getPaymentMethods(userId: string) {
    return this.paymentRepository.findAllMethods(userId);
  }

  async getInvoices(userId: string, limit: number = 20, skip: number = 0) {
    return this.paymentRepository.findInvoicesByUserId(userId, limit, skip);
  }

  async getInvoiceCount(userId: string) {
    return this.paymentRepository.countInvoicesByUserId(userId);
  }

  async getInvoiceById(id: string) {
    return this.paymentRepository.findInvoiceById(id);
  }

  async getDefaultPaymentMethod(userId: string) {
    return this.paymentRepository.findDefaultMethod(userId);
  }

  async removePaymentMethod(userId: string, methodId: string) {
    // 1. Get all payment methods
    const methods = await this.paymentRepository.findAllMethods(userId);
    const method = methods.find(m => m.id === methodId);

    if (!method) {
      throw new Error('Payment method not found');
    }

    // 2. Check for active subscription
    const subscription = await this.subscriptionRepository.findByUserId(userId);
    const hasActiveSubscription = subscription && subscription.status === 'active' && subscription.plan.price > 0;

    // 3. Prevent removal if it's the last method and user has active paid subscription
    if (hasActiveSubscription && methods.length <= 1) {
      throw new Error('Cannot remove the last payment method while having an active subscription. Please add another method first.');
    }

    // 4. If removing default method, make another one default if available (though we just blocked last one, so this is for > 1 case)
    if (method.isDefault && methods.length > 1) {
      const nextMethod = methods.find(m => m.id !== methodId);
      if (nextMethod) {
        await this.paymentRepository.updateMethod(nextMethod.id, { isDefault: true });
      }
    }

    // 5. Remove from Stripe
    if (method.providerMethodId) {
      try {
        await this.stripeProvider.detachPaymentMethod(method.providerMethodId);
      } catch (error) {
        console.error('Failed to detach payment method from Stripe:', error);
      }
    }

    const result = await this.paymentRepository.deleteMethod(methodId);

    // Notify User
    await notificationService.notifyUser(userId, 'info', 'Payment Method Removed', `Your card ending in ${method.last4} has been removed.`);
    
    // Send Email (if we had user email, but we only have userId here. We could fetch user.)
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) {
        await emailService.sendNotification('Payment Method Removed', `Your card ending in ${method.last4} has been removed from your account.`);
    }

    return result;
  }

  async setDefaultPaymentMethod(userId: string, methodId: string) {
    await this.paymentRepository.clearDefaultMethod(userId);
    const result = await this.paymentRepository.updateMethod(methodId, { isDefault: true });
    
    await notificationService.notifyUser(userId, 'success', 'Default Payment Method Updated', `Your default payment method has been updated.`);
    return result;
  }

  async createStripeSubscription(userId: string, priceId: string) {
    const customerId = await this.ensureCustomer(userId);
    
    // Get the user's default payment method
    const defaultPaymentMethod = await this.getDefaultPaymentMethod(userId);
    if (!defaultPaymentMethod || !defaultPaymentMethod.providerMethodId) {
      throw new Error('No payment method found. Please add a payment method first.');
    }

    try {
      return await this.stripeProvider.createSubscription(customerId, priceId, defaultPaymentMethod.providerMethodId);
    } catch (error: any) {
      if (error.message && error.message.includes('No such customer')) {
        console.warn(`Stripe customer ID ${customerId} invalid, resetting...`);
        // Reset customer ID
        await prisma.user.update({
          where: { id: userId },
          data: { stripeCustomerId: null }
        });
        // Retry
        return this.createStripeSubscription(userId, priceId);
      }
      throw error;
    }
  }

  async updateStripeSubscription(subscriptionId: string, newPriceId: string) {
    // Get the user's subscription to find userId
    const subscription = await this.subscriptionRepository.findByStripeSubscriptionId(subscriptionId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Get the user's default payment method
    const defaultPaymentMethod = await this.getDefaultPaymentMethod(subscription.userId);
    const paymentMethodId = defaultPaymentMethod?.providerMethodId || undefined;

    return this.stripeProvider.updateSubscription(subscriptionId, newPriceId, paymentMethodId);
  }

  async cancelStripeSubscription(subscriptionId: string, atPeriodEnd: boolean = false) {
    return this.stripeProvider.cancelSubscription(subscriptionId, atPeriodEnd);
  }

  /**
   * Sync All Plans from Stripe to Database
   */
  async syncPlansFromStripe() {
    console.log('🔗 BillingService: Syncing Plans from Stripe...');
    const stripePrices = await this.stripeProvider.fetchAllPricesWithProducts();
    
    if (stripePrices.length === 0) {
      return { count: 0, message: 'No prices found in Stripe' };
    }

    const plans = await prisma.plan.findMany();
    let updatedCount = 0;
    let createdCount = 0;

    // 1. Update Existing Plans
    for (const plan of plans) {
        if (plan.name.toLowerCase() === 'free' || plan.price === 0) continue;

        const match = stripePrices.find(sp => sp.productName.toLowerCase() === plan.name.toLowerCase());
        
        if (match) {
            const needsUpdate = plan.stripePriceId !== match.priceId || plan.price !== match.amount;
            if (needsUpdate) {
                await prisma.plan.update({
                    where: { id: plan.id },
                    data: {
                        stripePriceId: match.priceId,
                        price: match.amount,
                        currency: match.currency
                    }
                });
                updatedCount++;
            }
        }
    }

    // 2. Create Missing Stripe Products for Local Plans (Optional/Auto-fix)
    // Note: BootManager had logic for this. We'll simplify to just sync *from* Stripe here mostly, 
    // but enabling auto-create if ID is missing is helpful.
    for (const plan of plans) {
        if (plan.name.toLowerCase() === 'free' || plan.price === 0) continue;
        if (!plan.stripePriceId) {
             const match = stripePrices.find(sp => sp.productName.toLowerCase() === plan.name.toLowerCase());
             if (!match) {
                 // Create in Stripe
                 try {
                     const newProduct = await this.stripeProvider.createProduct(plan.name, plan.price, 'month');
                     await prisma.plan.update({
                         where: { id: plan.id },
                         data: { stripePriceId: newProduct.priceId }
                     });
                     createdCount++;
                 } catch (e) {
                     console.error(`Failed to auto-create Stripe product for ${plan.name}`, e);
                 }
             }
        }
    }

    return { updatedCount, createdCount, message: 'Sync successful' };
  }

  /**
   * Sync Invoices from Stripe (Backfill)
   */
  async syncInvoicesFromStripe() {
    console.log('🔗 BillingService: Syncing Invoices from Stripe...');
    const invoices = await this.stripeProvider.fetchAllInvoices();
    
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const stripeInvoice of invoices) {
        if (!stripeInvoice.customer) continue;

        // Find user by Stripe Customer ID
        const user = await prisma.user.findFirst({
            where: { stripeCustomerId: stripeInvoice.customer as string }
        });

        if (!user) {
            skippedCount++;
            continue;
        }

        // Check if invoice exists
        const existingInvoice = await prisma.invoice.findFirst({
            where: { stripeInvoiceId: stripeInvoice.id }
        });

        const status = stripeInvoice.status === 'paid' ? 'paid' : 
                       stripeInvoice.status === 'open' ? 'pending' : 'failed';
        
        const amount = stripeInvoice.amount_paid / 100;
        const currency = stripeInvoice.currency.toUpperCase();
        const paidAt = stripeInvoice.status_transitions?.paid_at ? new Date(stripeInvoice.status_transitions.paid_at * 1000) : null;

        if (existingInvoice) {
            // Update status if changed
            if (existingInvoice.status !== status || existingInvoice.paidAt?.getTime() !== paidAt?.getTime()) {
                await prisma.invoice.update({
                    where: { id: existingInvoice.id },
                    data: { status, paidAt }
                });
                updatedCount++;
            }
        } else {
            // Create new invoice
            // Try to link to subscription if possible
            let subscriptionId: string | undefined = undefined;
            const stripeSubRef = (stripeInvoice as any).subscription;
            if (stripeSubRef) {
                const stripeSubId = typeof stripeSubRef === 'string' 
                    ? stripeSubRef 
                    : stripeSubRef.id;
                    
                const sub = await prisma.subscription.findFirst({
                    where: { stripeSubscriptionId: stripeSubId }
                });
                if (sub) subscriptionId = sub.id;
            }

            // Try to link payment method
            let paymentMethodId = undefined;
            // (Optional: could try to fetch from Stripe if critical, but for stats, mostly amount matters)

            await prisma.invoice.create({
                data: {
                    userId: user.id,
                    stripeInvoiceId: stripeInvoice.id,
                    amount,
                    currency,
                    status,
                    paidAt,
                    createdAt: new Date(stripeInvoice.created * 1000),
                    subscriptionId // Type is now correctly string | undefined
                }
            });
            createdCount++;
        }
    }

    return { createdCount, updatedCount, skippedCount, message: 'Invoice sync successful' };
  }
}

