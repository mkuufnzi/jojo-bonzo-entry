import { Request, Response } from 'express';
import { StripeProvider } from '../services/payment/stripe.provider';
import { workflowService } from '../services/workflow.service';
import { createQueue, QUEUES } from '../lib/queue';
import { logger } from '../lib/logger';
import prisma from '../lib/prisma';
import { config } from '../config/env';

export class WebhookController {
  private stripeProvider: StripeProvider;

  constructor() {
    this.stripeProvider = new StripeProvider();
  }

  async handleStripeWebhook(req: Request, res: Response) {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = config.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
      return res.status(400).send('Webhook Error: Missing signature or secret');
    }

    let event;

    try {
      // Note: req.body must be raw buffer for signature verification
      // If using express.json(), we need to ensure we get the raw body
      // The route configuration should handle this.
      event = this.stripeProvider.constructWebhookEvent(req.body, sig as string, webhookSecret);
    } catch (err: any) {
      console.error(`Webhook signature verification failed: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      // Async: Push to Queue and return 200 immediately
      const queue = createQueue(QUEUES.WEBHOOKS);
      await queue.add('stripe-webhook', {
        eventType: event.type,
        data: event.data.object
      });

      console.log(`Webhook enqueued: ${event.type}`);
    } catch (error) {
      console.error('Error enqueuing webhook:', error);
      // Still return 200 to Stripe to avoid retries if it's our internal queue error? 
      // Or 500 to let Stripe retry? 
      // Usually 500 is better if queue is down.
      return res.status(500).send('Internal Server Error');
    }


    res.json({ received: true });
  }

  async handleSubscriptionUpdate(stripeSubscription: any) {
    const stripeId = stripeSubscription.id;
    const status = stripeSubscription.status;
    const customerId = stripeSubscription.customer;
    const priceId = stripeSubscription.items?.data[0]?.price?.id;
    const periodEnd = stripeSubscription.current_period_end;

    // Find user by stripe customer ID
    const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId as string } });
    if (!user) {
      console.warn(`[Webhook] User not found for Stripe customer ${customerId}`);
      return;
    }

    // Find plan by price ID
    let planId: string | undefined = undefined;
    if (priceId) {
      const plan = await prisma.plan.findFirst({ where: { stripePriceId: priceId } });
      if (plan) planId = plan.id;
    }

    // Map Stripe status to our status
    const localStatus = this.mapStripeStatus(status);

    // Upsert subscription
    await prisma.subscription.upsert({
      where: { userId: user.id },
      update: {
        stripeSubscriptionId: stripeId,
        status: localStatus,
        endDate: periodEnd ? new Date(periodEnd * 1000) : null,
        ...(planId ? { planId } : {}),
      },
      create: {
        userId: user.id,
        planId: planId || await this.getFreePlanId(),
        stripeSubscriptionId: stripeId,
        status: localStatus,
        endDate: periodEnd ? new Date(periodEnd * 1000) : null,
      }
    });

    console.log(`[Webhook] ✅ Subscription synced: user=${user.id}, status=${localStatus}`);
  }

  async handleSubscriptionDeleted(stripeSubscription: any) {
    const customerId = stripeSubscription.customer;

    const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId as string } });
    if (!user) return;

    const freePlanId = await this.getFreePlanId();

    await prisma.subscription.update({
      where: { userId: user.id },
      data: {
        planId: freePlanId,
        stripeSubscriptionId: null,
        status: 'canceled',
        endDate: new Date(),
      }
    });

    console.log(`[Webhook] ✅ Subscription canceled, downgraded to Free: user=${user.id}`);
  }

  private async handleInvoicePaymentSucceeded(invoice: any) {
    const customerId = invoice.customer;
    const amountPaid = (invoice.amount_paid || 0) / 100;
    const currency = (invoice.currency || 'usd').toUpperCase();
    const stripeInvoiceId = invoice.id;
    const subscriptionId = invoice.subscription;

    // Find user
    const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId as string } });
    if (!user) {
      console.warn(`[Webhook] Invoice payment succeeded but user not found for customer ${customerId}`);
      return;
    }

    // Check for duplicate (idempotency)
    const existingInvoice = await prisma.invoice.findFirst({
      where: { stripeInvoiceId }
    });
    if (existingInvoice) {
      console.log(`[Webhook] Invoice ${stripeInvoiceId} already recorded, skipping`);
      return;
    }

    // Get subscription and default payment method
    const subscription = await prisma.subscription.findUnique({ where: { userId: user.id } });
    const paymentMethod = await prisma.paymentMethod.findFirst({ where: { userId: user.id, isDefault: true } });

    // Create invoice record
    await prisma.invoice.create({
      data: {
        userId: user.id,
        subscriptionId: subscription?.id,
        paymentMethodId: paymentMethod?.id,
        stripeInvoiceId: stripeInvoiceId,
        amount: amountPaid,
        currency: currency,
        status: 'paid',
      }
    });

    console.log(`[Webhook] ✅ Payment recorded: $${amountPaid} ${currency} for user ${user.id}`);
  }

  private async handleInvoicePaymentFailed(invoice: any) {
    const customerId = invoice.customer;
    const attemptCount = invoice.attempt_count || 1;

    const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId as string } });
    if (!user) return;

    await prisma.subscription.update({
      where: { userId: user.id },
      data: { status: 'past_due' }
    });

    console.warn(`[Webhook] ⚠️ Payment failed: user=${user.id}, attempt=${attemptCount}`);
  }

  private mapStripeStatus(stripeStatus: string): string {
    const map: Record<string, string> = {
      active: 'active',
      past_due: 'past_due',
      canceled: 'canceled',
      unpaid: 'past_due',
      incomplete: 'pending',
      incomplete_expired: 'canceled',
      trialing: 'active',
      paused: 'paused',
    };
    return map[stripeStatus] || 'active';
  }

  private freePlanIdCache: string | null = null;
  private async getFreePlanId(): Promise<string> {
    if (this.freePlanIdCache) return this.freePlanIdCache;
    const plan = await prisma.plan.findFirst({ where: { OR: [{ name: 'Free' }, { price: 0 }] } });
    if (!plan) throw new Error('Free plan not found');
    this.freePlanIdCache = plan.id;
    return this.freePlanIdCache;
  }

  async handleErpWebhook(req: Request, res: Response) {
    const { provider } = req.params;
    const userIdFromPath = req.params.userId;

    if (!provider) {
        return res.status(400).json({ error: 'Missing provider' });
    }

    try {
      // 1. Initialize Provider
      const { ProviderRegistry } = await import('../services/integrations/providers'); 
      const providerInstance = ProviderRegistry.createInstance(provider);

      // 2. Verify Signature (Generic)
      // Pass rawBody if available, else JSON stringified (less reliable but fallback)
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);
      const isVerified = await providerInstance.verifyWebhookSignature(rawBody, req.headers, req.query);
      
      if (!isVerified) {
          logger.warn({ provider }, '⚠️ [Webhook] Signature Verification Failed');
          // return res.status(401).send('Unauthorized'); // Strict mode?
      } else {
          logger.info({ provider }, '✅ [Webhook] Signature Verified');
      }

      // 3. Parse Webhook Event (Normalized)
      const events = await providerInstance.parseWebhook(req.body, req.headers);
      
      if (!events || events.length === 0) {
          return res.status(200).send('No events processed');
      }

      for (const event of events) {
           let userId = userIdFromPath;

           // 4. Resolve Context (User/App)
            if (!userId && event.tenantId) {
                // Determine Metadata Key based on Provider
                // Different providers store Tenant ID in different metadata keys
                let metadataKey = 'realmId'; // Default for QBO
                if (provider === 'xero') metadataKey = 'tenantId';
                else if (provider === 'zoho') metadataKey = 'organization_id';
                
                // Find Integration by TenantID (Metadata)
                const integration = await prisma.integration.findFirst({
                    where: { 
                        provider,
                        metadata: {
                            path: [metadataKey], 
                            equals: event.tenantId 
                        }
                    },
                    include: { business: { include: { users: true } } }
                });

                if (integration && integration.business?.users?.length) {
                    userId = integration.business.users[0].id; // Heuristic: First user
                }
           }

           if (!userId) {
               logger.warn({ provider, tenantId: event.tenantId }, '[Webhook] Unknown User/Tenant - Skipping Event');
               continue;
           }

           logger.info({ userId, provider, eventType: event.type }, '⚡ [Webhook] Processing Event');

           // 6. Action Dispatch
           const { serviceRegistry } = await import('../services/service-registry.service');
           const designEngine = serviceRegistry.getProvider('transactional-core');

           if (designEngine) {
                const user = await prisma.user.findUnique({ 
                    where: { id: userId },
                    include: { business: true } // Include Business context if needed by engine
                });
                if (!user) continue;

                if (event.type === 'invoice.created' || event.type === 'invoice.updated') {
                    // Fetch PDF
                    let pdfBuffer: Buffer | null = null;
                    try {
                        pdfBuffer = await providerInstance.getInvoicePdf(event.entityId);
                    } catch (e) { console.error('PDF Fetch Error', e); }

                    const payload = {
                        ...event.payload,
                        provider,
                        source: provider,
                        // Attach PDF
                        ...(pdfBuffer ? { original_pdf: pdfBuffer.toString('base64') } : {})
                    };
                    
                    // We interpret 'user' as full context, but DesignEngine might need businessId explicitly
                    const contextUser = { ...user, businessId: user.business?.id };

                    designEngine.executeAction('invoice_created', payload, contextUser)
                        .catch((e: any) => logger.error({ e }, 'DesignEngine Failed'));
                }
                else if (event.type === 'contact.created' || event.type === 'contact.updated') {
                     const contact = await providerInstance.getContact(event.entityId);
                     const contextUser = { ...user, businessId: user.business?.id };
                     designEngine.executeAction('contact_sync', { ...contact, provider }, contextUser)
                        .catch((e: any) => logger.error({ e }, 'Contact Sync Failed'));
                }
                else if (event.type === 'item.created' || event.type === 'item.updated') {
                     const item = await providerInstance.getItem(event.entityId);
                     const contextUser = { ...user, businessId: user.business?.id };
                     designEngine.executeAction('product_sync', { ...item, provider }, contextUser)
                        .catch((e: any) => logger.error({ e }, 'Product Sync Failed'));
                }
           }
      }

      res.status(200).send('Processed');

    } catch (error: any) {
      console.error('ERP Webhook Error', error);
      res.status(500).json({ error: 'Processing failed' });
    }
  }

  /**
   * [Proto 2] Zoho Invoice Webhook
   * Endpoint: POST /api/v1/webhooks/zoho/invoice
   * Query: ?key=API_KEY
   */
  // Removed specific Zoho handler (Legacy) - Handled Generic
  // async handleZohoInvoiceWebhook...

  /**
    * QuickBooks Online Webhook
    * Endpoint: POST /api/v1/webhooks/quickbooks/notification
    * Header: intuit-signature
    */
  // Removed specific QBO handler (Legacy) - Handled Generic
  // async handleQuickBooksWebhook...
}
