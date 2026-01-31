import { SubscriptionRepository } from '../repositories/subscription.repository';
import { logger } from '../lib/logger';
import { PlanRepository } from '../repositories/plan.repository';
import { BillingService } from './billing.service';
import { AppError } from '../lib/AppError';
import { notificationService } from './notification.service';
import { emailService } from './email.service';
import { webhookService } from './webhook.service';
import { n8nPayloadFactory } from './n8n/n8n-payload.factory';
import prisma from '../lib/prisma';
import { Prisma } from '@prisma/client';

export class SubscriptionService {
  private subscriptionRepository: SubscriptionRepository;
  private planRepository: PlanRepository;
  private billingService: BillingService;

  constructor() {
    this.subscriptionRepository = new SubscriptionRepository();
    this.planRepository = new PlanRepository();
    this.billingService = new BillingService();
  }

  async getSubscription(userId: string) {
    let subscription = await this.subscriptionRepository.findByUserId(userId);
    
    // Auto-fix: If user has no subscription, create a default "Free" one immediately.
    // This ensures we NEVER have a null subscription and NEVER need mock data.
    if (!subscription) {
        logger.info(`[Auto-Fix] User ${userId} has no subscription. Creating default Free plan.`);
        try {
            subscription = await this.createDefaultSubscription(userId);
        } catch (error) {
            logger.error({ error: error as any }, '[Auto-Fix] Failed to create default subscription');
            // If this fails, we genuinely have a system problem, but we try our best.
            return null;
        }
    }
    
    return subscription;
  }

  // Helper to ensure every user has at least a basic plan
  private async createDefaultSubscription(userId: string) {
      // 1. Ensure Free plan exists
      let freePlan = await this.planRepository.findByName('Free');
      // If DB is completely empty, create the plan too (Self-Healing DB)
      if (!freePlan) {
          freePlan = await prisma.plan.create({
              data: {
                  name: 'Free',
                  price: 0,
                  requestLimit: 100,
                  pdfQuota: 15, // Default limits
                  aiQuota: 5,
                  features: '["Basic PDF Tools", "5 AI Docs/mo"]'
              }
          });
      }

      // 2. Create the subscription
      await this.subscriptionRepository.create(userId, freePlan.id);
      
      // 3. Return full object with plan for type safety
      return this.subscriptionRepository.findByUserId(userId);
  }

  async getAllPlans() {
    return this.planRepository.findAll();
  }

  async upgradeSubscription(userId: string, planId: string) {
    const plan = await this.planRepository.findById(planId);
    if (!plan) throw new AppError('Invalid plan', 400);

    const subscription = await this.subscriptionRepository.findByUserId(userId);
    const defaultPaymentMethod = await this.billingService.getDefaultPaymentMethod(userId);

    let stripeSubscriptionId: string | null = null;
    let stripeStatus: string = 'active'; // Default for Free plan or non-stripe
    let clientSecret: string | undefined;

    // If upgrading to a paid plan, check for payment method
    if (plan.price > 0) {
      // Ensure plan is properly configured with Stripe
      if (!plan.stripePriceId) {
        throw new AppError('Plan configuration error: Missing Stripe Price ID. Please contact support.', 500);
      }

      // Validate user has payment method before proceeding
      if (!defaultPaymentMethod) {
        throw new AppError('Please add a payment method before upgrading', 400);
      }

      // Determine if we can reuse the existing Stripe subscription
      let reuseSubscription = false;
      if (subscription && subscription.stripeSubscriptionId) {
          try {
              const currentSub = await this.billingService.getStripeSubscription(subscription.stripeSubscriptionId);
              // Reuse if it is NOT in a terminal/problematic state that forbids updates.
              // incomplete, incomplete_expired, and canceled cannot be updated to a new price.
              if (currentSub && !['incomplete', 'incomplete_expired', 'canceled'].includes(currentSub.status)) {
                  reuseSubscription = true;
              }
          } catch (error) {
              logger.warn({ error, subscriptionId: subscription.stripeSubscriptionId }, `Could not retrieve existing Stripe subscription, assuming invalid/deleted.`);
              reuseSubscription = false;
          }
      }

      if (reuseSubscription && subscription?.stripeSubscriptionId) {
        // Update existing Stripe subscription
        const stripeSub = await this.billingService.updateStripeSubscription(subscription.stripeSubscriptionId, plan.stripePriceId);
        stripeSubscriptionId = stripeSub.id;
        stripeStatus = stripeSub.status;
        const invoice = stripeSub.latest_invoice as any;
        clientSecret = invoice?.payment_intent?.client_secret;
      } else {
        // Create new Stripe subscription (either new user or previous was expired/canceled)
        const result = await this.billingService.createStripeSubscription(userId, plan.stripePriceId);
        stripeSubscriptionId = result.subscriptionId;
        stripeStatus = result.status;
        clientSecret = result.clientSecret;
      }

    } else {
      // Downgrading to free? (Price is 0)
      if (subscription && subscription.stripeSubscriptionId) {
        // Retrieve current status to decide cancellation mode
        let atPeriodEnd = true;
        try {
            const currentSub = await this.billingService.getStripeSubscription(subscription.stripeSubscriptionId);
            // Incomplete subscriptions cannot be cancelled at period end
            if (currentSub && currentSub.status === 'incomplete') {
                atPeriodEnd = false;
            }
        } catch (e) {
            // Ignore error, default to true
        }

        // Cancel Stripe Sub
        try {
            await this.billingService.cancelStripeSubscription(subscription.stripeSubscriptionId, atPeriodEnd);
            stripeStatus = atPeriodEnd ? 'canceling' : 'canceled'; 
        } catch (error: any) {
            // Fallback: If we tried to cancel at period end but failed because status is incomplete,
            // force immediate cancellation.
            if (atPeriodEnd && error.message && error.message.includes('incomplete')) {
                logger.warn('Force cancelling incomplete subscription that refused period-end update');
                await this.billingService.cancelStripeSubscription(subscription.stripeSubscriptionId, false);
                stripeStatus = 'canceled';
            } else {
                throw error;
            }
        } 
      }
    }

    // Determine Local Status
    // If it's a paid plan (price > 0) and Stripe status is NOT active/trialing, set incomplete.
    // If it's free plan, it's active (unless cancelling previous).
    let localStatus = 'active';
    if (plan.price > 0) {
        localStatus = (stripeStatus === 'active' || stripeStatus === 'trialing') ? 'active' : 'incomplete';
    } else {
        // Free plan
        if (stripeStatus === 'canceling') localStatus = 'canceling'; // Or keep as active but marks as cancelling end of period
    }

    // 3. Updates (Atomic)
    const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default 30 days if new

    return prisma.$transaction(async (tx) => {
        let result;
        const data: any = {
            plan: { connect: { id: plan.id } },
            status: localStatus,
            endDate
        };

        if (stripeSubscriptionId) {
            data.stripeSubscriptionId = stripeSubscriptionId;
        }

        if (subscription) {
            result = await this.subscriptionRepository.update(subscription.id, data, tx);
        } else {
            // New subscription locally
            // Default create sets active, so passing tx to create and then updating if needed
            // But repo.create signature is (userId, planId, stripeSubId, tx)
            result = await this.subscriptionRepository.create(userId, plan.id, stripeSubscriptionId || undefined, tx);
            
            if (localStatus !== 'active') {
                await this.subscriptionRepository.update(result.id, { status: localStatus }, tx);
                result.status = localStatus;
            }
        }

        // Create Invoice Record IF active and PAID
        if (localStatus === 'active' && plan.price > 0 && defaultPaymentMethod) {
            await this.createInvoiceRecord(userId, result.id, defaultPaymentMethod.id, plan.price, tx);
        }

        return { ...result, clientSecret, stripeStatus };
    });
  }

  async cancelSubscription(userId: string): Promise<void> {
    const subscription = await this.subscriptionRepository.findByUserId(userId);
    if (subscription) {
      if (subscription.stripeSubscriptionId) {
          await this.billingService.cancelStripeSubscription(subscription.stripeSubscriptionId, true);
      }
      
      await this.subscriptionRepository.update(subscription.id, {
        status: 'canceling'
        // Don't change endDate, let it run out.
      });

      // Trigger Webhook (Standardized)
      const user = await prisma.user.findUnique({ where: { id: userId }, include: { business: true } });
      const context = {
          serviceId: 'transactional-branding',
          serviceTenantId: user?.business?.id || 'unknown',
          appId: 'system-subscription',
          requestId: `sub_${subscription.id.substring(0, 8)}`
      };

      const envelope = n8nPayloadFactory.createEventPayload('subscription_canceled', {
        userId: userId,
        subscriptionId: subscription.id,
        timestamp: new Date().toISOString()
      }, user?.id || userId, context);

      webhookService.sendTrigger('subscription', 'subscription_canceled', envelope);
    }
  }

  /**
   * Create an invoice record for a subscription payment
   */
  private async createInvoiceRecord(userId: string, subscriptionId: string, paymentMethodId: string, amount: number, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx || prisma;
    try {
      await client.invoice.create({
        data: {
          userId,
          subscriptionId,
          paymentMethodId,
          amount,
          currency: 'USD',
          status: 'paid',
          paidAt: new Date(),
        }
      });
      logger.debug(`Invoice created for user ${userId}: $${amount}`);
    } catch (error) {
      logger.warn({ error: error as any }, '[Non-Fatal] Failed to create invoice record');
      // Non-fatal - don't fail the upgrade if invoice creation fails
    }
  }
}
