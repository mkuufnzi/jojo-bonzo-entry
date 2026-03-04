import { createWorker, QUEUES } from '../lib/queue';
import { pdfProcessor } from './pdf.processor';
import { webhookProcessor } from './webhook.processor';
import { config } from '../config/env';
import { initSentry } from '../config/sentry';
import { logger } from '../lib/logger';
import * as Sentry from '@sentry/node';

// Initialize Sentry for Worker Process
initSentry();

/**
 * Worker Service Entrypoint
 * This script starts all background workers.
 */

logger.info('--- Starting Background Workers ---');

// Initialize Services & Configuration (Crucial for WebhookService)
import { BootManager } from '../lib/boot';
import prisma from '../lib/prisma'; // Fix: Default import

(async () => {
    try {
        logger.info('⚙️ [Worker] Initializing Service Registry...');
        // We pass null for app since we don't have an express app here, 
        // but we need the registry side-effects (DB load)
        await BootManager.initializeServiceRegistry(null);
        logger.info('✅ [Worker] Services Initialized.');
    } catch (e: any) {
        logger.error(`❌ [Worker] Service Init Failed: ${e.message}`);
    }
})();

// Initialize PDF Worker
const pdfWorker = createWorker(QUEUES.PDF_GENERATION, pdfProcessor, {
    concurrency: config.NODE_ENV === 'production' ? 5 : 2
});

pdfWorker.on('completed', job => {
    logger.info({ jobId: job.id, queue: QUEUES.PDF_GENERATION }, '[PDF] Job completed');
});

pdfWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err, queue: QUEUES.PDF_GENERATION }, '[PDF] Job failed');
    Sentry.captureException(err, { tags: { job_id: job?.id, queue: QUEUES.PDF_GENERATION } });
});

logger.info(`✅ PDF Worker listening on: ${QUEUES.PDF_GENERATION}`);

// Initialize Webhook Worker
const webhookWorker = createWorker(QUEUES.WEBHOOKS, webhookProcessor, {
    concurrency: config.NODE_ENV === 'production' ? 10 : 3
});

webhookWorker.on('completed', job => {
    logger.info({ jobId: job.id, eventType: job.data?.eventType, queue: QUEUES.WEBHOOKS }, '[Webhook] Job processed');
});

webhookWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err, queue: QUEUES.WEBHOOKS }, '[Webhook] Job failed');
    Sentry.captureException(err, { tags: { job_id: job?.id, queue: QUEUES.WEBHOOKS } });
});

logger.info(`✅ Webhook Worker listening on: ${QUEUES.WEBHOOKS}`);

// Initialize AI Worker
import { aiProcessor } from './ai.processor';
const aiWorker = createWorker(QUEUES.AI_GENERATION, aiProcessor, {
    concurrency: config.NODE_ENV === 'production' ? 5 : 2
});

aiWorker.on('completed', job => {
    logger.info({ jobId: job.id, queue: QUEUES.AI_GENERATION }, '[AI] Job completed');
});

aiWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err, queue: QUEUES.AI_GENERATION }, '[AI] Job failed');
    Sentry.captureException(err, { tags: { job_id: job?.id, queue: QUEUES.AI_GENERATION } });
});

// Initialize Onboarding Worker
// Initialize Onboarding Worker
import { onboardingProcessor } from './onboarding.processor';
const onboardingWorker = createWorker(QUEUES.ONBOARDING_SYNC as string, onboardingProcessor, {
    concurrency: config.NODE_ENV === 'production' ? 2 : 1
});

onboardingWorker.on('completed', job => {
    logger.info({ jobId: job.id, queue: QUEUES.ONBOARDING_SYNC }, '[Onboarding] Job completed');
});

onboardingWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err, queue: QUEUES.ONBOARDING_SYNC }, '[Onboarding] Job failed');
    Sentry.captureException(err, { tags: { job_id: job?.id, queue: QUEUES.ONBOARDING_SYNC } });
});

logger.info(`✅ Onboarding Worker listening on: ${QUEUES.ONBOARDING_SYNC}`);

// Initialize Analytics Worker (Revenue Engine)
import { analyticsProcessor } from './analytics.processor';
const analyticsWorker = createWorker(QUEUES.REVENUE_ENGINE, analyticsProcessor, {
    concurrency: config.NODE_ENV === 'production' ? 5 : 1
});

analyticsWorker.on('completed', job => {
    logger.info({ jobId: job.id, queue: QUEUES.REVENUE_ENGINE }, '[Analytics] Job completed');
});

analyticsWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err, queue: QUEUES.REVENUE_ENGINE }, '[Analytics] Job failed');
    Sentry.captureException(err, { tags: { job_id: job?.id, queue: QUEUES.REVENUE_ENGINE } });
});

logger.info(`✅ Analytics Worker listening on: ${QUEUES.REVENUE_ENGINE}`);

// Initialize Smart Recovery Worker
import recoveryWorker from '../modules/recovery/recovery.worker';

recoveryWorker.on('completed', job => {
    logger.info({ jobId: job.id, queue: QUEUES.RECOVERY_ENGINE }, '[Recovery] Job completed');
});

recoveryWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err, queue: QUEUES.RECOVERY_ENGINE }, '[Recovery] Job failed');
    Sentry.captureException(err, { tags: { job_id: job?.id, queue: QUEUES.RECOVERY_ENGINE } });
});

logger.info(`✅ Recovery Worker listening on: ${QUEUES.RECOVERY_ENGINE}`);

// Keep process alive
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received. Closing workers...');
    await Promise.all([
        pdfWorker.close(), 
        webhookWorker.close(), 
        aiWorker.close(), 
        onboardingWorker.close(),
        analyticsWorker.close(),
        recoveryWorker.close()
    ]);
    process.exit(0);
});
