import { Job } from 'bullmq';
import { createWorker, createQueue, QUEUES } from '../../lib/queue';
import { logger } from '../../lib/logger';
import { RecoveryService } from './recovery.service';

/**
 * Smart Recovery Worker
 * 
 * Handles async recovery tasks via BullMQ:
 * 
 * ORCHESTRATION (Production-Grade):
 * - `recovery:orchestrate`      — Fan-out per-tenant jobs (every 15 min via cron)
 * - `recovery:tenant-sync`      — Per-tenant ERP data refresh
 * - `recovery:tenant-process`   — Per-tenant due session processing
 * 
 * EXECUTION:
 * - `recovery:sync`             — Legacy: single-tenant sync (manual trigger)
 * - `recovery:execute`          — Single dunning step (email/SMS via n8n)
 * - `recovery:process-business`  — Per-business overdue processing
 * - `recovery:batch-execute`     — Batch: all invoices for ONE customer → n8n
 * - `recovery:daily-dispatch`    — Legacy: process all tenants (kept for compat)
 */
const recoveryWorker = createWorker(QUEUES.RECOVERY_ENGINE, async (job: Job) => {
    logger.info(`[RecoveryWorker] Processing job ${job.id}: ${job.name}`);

    try {
        const service = new RecoveryService();

        switch (job.name) {

            // ═══════════════════════════════════════════════════
            // ██  ORCHESTRATION JOBS (Production-Grade)
            // ═══════════════════════════════════════════════════

            case 'recovery:orchestrate': {
                console.log(`\n[RecoveryWorker] 🔄 Orchestrator triggered (${job.data?.trigger || 'cron'})`);
                const result = await service.orchestrate();
                return result;
            }

            case 'recovery:tenant-sync': {
                const { businessId, cycleId } = job.data;
                const result = await service.tenantSync(businessId, cycleId);
                return result;
            }

            case 'recovery:tenant-process': {
                const { businessId, cycleId } = job.data;
                const result = await service.tenantProcess(businessId, cycleId);
                return result;
            }

            // ═══════════════════════════════════════════════════
            // ██  EXECUTION JOBS (Per-Invoice / Per-Customer)
            // ═══════════════════════════════════════════════════

            case 'recovery:sync': {
                const { businessId } = job.data;
                logger.info({ businessId }, '[RecoveryWorker] Starting overdue invoice sync');
                const result = await service.syncOverdueInvoices(businessId);
                logger.info({ businessId, result }, '[RecoveryWorker] Sync complete');
                return result;
            }

            case 'recovery:execute': {
                const { businessId, externalInvoiceId, customerEmail, amount, currency, dueDate } = job.data;
                logger.info({ businessId, externalInvoiceId }, '[RecoveryWorker] Executing recovery action');
                const result = await service.processRecovery({
                    businessId,
                    externalInvoiceId,
                    customerEmail,
                    amount,
                    currency,
                    dueDate: new Date(dueDate)
                });
                logger.info({ businessId, externalInvoiceId, result }, '[RecoveryWorker] Action executed');
                return result;
            }

            case 'recovery:daily-dispatch': {
                // Legacy: still works for backward compat, but orchestrator is preferred
                logger.info('[RecoveryWorker] Starting daily dispatch cycle (legacy)');
                await service.processPendingActions();
                return { success: true };
            }

            case 'recovery:process-business': {
                const { businessId } = job.data;
                logger.info({ businessId }, '[RecoveryWorker] Processing business overdues');
                const result = await service.processBusinessOverdues(businessId);
                logger.info({ businessId, result }, '[RecoveryWorker] Business processed');
                return result;
            }

            case 'recovery:batch-execute': {
                /**
                 * BATCH EXECUTE: Process all overdue invoices for ONE customer in a SINGLE n8n call.
                 * Uses processBatchRecovery for true aggregation.
                 */
                const batchData = job.data;
                console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
                console.log(`[Recovery Worker] ▶ Batch Execute: ${batchData.customerName} (${batchData.customerId})`);
                console.log(`[Recovery Worker]   ${batchData.invoices?.length || 0} invoices | Total: $${batchData.totalAmount} | Email: ${batchData.customerEmail}`);
                console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

                if (!batchData.customerEmail || batchData.customerEmail === 'N/A') {
                    console.log(`[Recovery Worker] ⚠️ No email for customer ${batchData.customerId}. Skipping.`);
                    return { success: false, reason: 'no_email' };
                }

                const batchResult = await service.processBatchRecovery(batchData);
                console.log(`[Recovery Worker] ✅ Batch complete: ${JSON.stringify(batchResult)}`);
                return batchResult;
            }

            case 'recovery:erp-sync': {
                // Legacy: replaced by orchestrator, kept for safety
                logger.warn('[RecoveryWorker] ⚠️ Legacy erp-sync fired — use recovery:orchestrate instead');
                const prisma = (await import('../../lib/prisma')).default;
                const activeSequences = await (prisma as any).debtCollectionSequence.findMany({
                    where: { isActive: true },
                    select: { businessId: true }
                });
                const uniqueBusinessIds = [...new Set(activeSequences.map((s: any) => s.businessId))] as string[];
                for (const bizId of uniqueBusinessIds) {
                    try {
                        await service.syncOverdueInvoices(bizId);
                    } catch (syncErr: any) {
                        logger.error({ businessId: bizId, err: syncErr.message }, '[RecoveryWorker] ERP sync failed for tenant');
                    }
                }
                return { synced: uniqueBusinessIds.length };
            }

            default:
                logger.warn(`[RecoveryWorker] Unknown job name: ${job.name}`);
        }
    } catch (error) {
        logger.error({ err: error, jobId: job.id }, '[RecoveryWorker] Job Failed');
        throw error; // BullMQ will retry based on queue config
    }
}, {
    // ── Phase 6: Enterprise Scaling ──
    // Increase concurrency for base recovery engine
    concurrency: 20, 
    // Lock duration ensures jobs aren't double-processed if they take long (e.g. ERP sync)
    lockDuration: 5 * 60 * 1000, 
    // Limit jobs per second to prevent ERP API hammering (Rate Limiting)
    limiter: {
        max: 50,
        duration: 1000
    }
});

export default recoveryWorker;
