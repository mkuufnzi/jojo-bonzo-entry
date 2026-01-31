import { Job } from 'bullmq';
// We need to import the controller logic or service that handles the actual DB update.
import { WebhookController } from '../controllers/webhook.controller';

const webhookController = new WebhookController();

/**
 * Webhook Processor
 * Handles jobs from the 'webhooks' queue.
 */
export const webhookProcessor = async (job: Job) => {
    const { eventType, data } = job.data;
    console.log(`[Worker] Processing Webhook job ${job.id}: ${eventType}`);

    try {
        // Cast to any to access internal logic for this refactor to avoid massive architectural changes
        switch (eventType) {
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
                await (webhookController as any).handleSubscriptionUpdate(data);
                break;
            case 'customer.subscription.deleted':
                await (webhookController as any).handleSubscriptionDeleted(data);
                break;
            case 'invoice.payment_succeeded':
                await (webhookController as any).handleInvoicePaymentSucceeded(data);
                break;
            case 'invoice.payment_failed':
                await (webhookController as any).handleInvoicePaymentFailed(data);
                break;
            default:
                console.log(`Unhandled event type ${eventType}`);
        }

    } catch (error: any) {
        console.error(`[Worker] Webhook job ${job.id} failed:`, error.message);
        throw error;
    }
};
