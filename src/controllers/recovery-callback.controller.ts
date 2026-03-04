import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { logger } from '../lib/logger';
import { resolveSystemApp } from '../services/app-resolution.service';
import { createAuditLog } from '../middleware/audit.middleware';
import { ServiceSlugs } from '../types/service.types';

const p = prisma as any;

/**
 * RecoveryCallbackController
 *
 * Handles inbound callbacks from n8n after a Smart Recovery action (email/SMS/etc.)
 * has been executed. Responsible for the full state transition cycle:
 *
 * Single Mode:  actionId + sessionId  → advance session step, create state history
 * Batch  Mode:  actionIds[] + sessionIds[] → advance all sessions, handle exhausted
 *
 * Architecture invariants:
 * - All DB mutations are logged to UsageLog + AuditLog (enterprise billing/compliance)
 * - Idempotency: if action is already 'sent'|'failed', silently ACK and return
 * - EXHAUSTED: if all steps completed and status===success, mark session EXHAUSTED or RECOVERED
 * - Cluster: batch mode processes N sessions in one callback (one customer, many invoices)
 */
export class RecoveryCallbackController {

    /**
     * POST /api/callbacks/recovery/action
     *
     * Expected payload (single):
     * {
     *   actionId:  string,
     *   sessionId: string,
     *   businessId: string,
     *   status: 'success' | 'failed',
     *   aiCopy?: string,
     *   metadata?: any
     * }
     *
     * Expected payload (batch — one customer, multiple invoices):
     * {
     *   actionIds:  string[],
     *   sessionIds: string[],
     *   businessId: string,
     *   status: 'success' | 'failed',
     *   aiCopy?: string,
     *   metadata?: any
     * }
     */
    static async receiveRecoveryAction(req: Request, res: Response) {
        const startTime = Date.now();
        const {
            actionId,
            actionIds,
            sessionId,
            sessionIds,
            businessId,
            status,
            aiCopy,
            metadata,
        } = req.body;

        // ── Normalise single vs. batch input ──
        const isBatch = Array.isArray(actionIds) && actionIds.length > 0;
        const resolvedActionIds: string[]  = isBatch ? actionIds  : (actionId  ? [actionId]  : []);
        const resolvedSessionIds: string[] = isBatch ? sessionIds : (sessionId ? [sessionId] : []);

        logger.info(
            { resolvedActionIds, resolvedSessionIds, businessId, status, isBatch },
            '📥 [RecoveryCallback] Received action result from n8n'
        );

        // ── Validation ──
        if (resolvedActionIds.length === 0 || !businessId || !status) {
            return res.status(400).json({
                error: 'Missing required fields: actionId (or actionIds[]), businessId, status'
            });
        }
        if (!['success', 'failed'].includes(status)) {
            return res.status(400).json({ error: 'status must be "success" or "failed"' });
        }

        try {
            // ── Resolve billing/tracing context (Architecture Rule) ──
            const appId = await resolveSystemApp(businessId);
            const user = await prisma.user.findFirst({
                where: { businessId },
                orderBy: { createdAt: 'asc' }
            });
            const userId = user?.id || 'system';

            // ── Resolve service record once ──
            const service = await prisma.service.findUnique({
                where: { slug: ServiceSlugs.DEBT_COLLECTION }
            });

            // ── Process each action ──
            const results: { actionId: string; sessionId: string | null; outcome: string }[] = [];

            for (let i = 0; i < resolvedActionIds.length; i++) {
                const currentActionId  = resolvedActionIds[i];
                const currentSessionId = resolvedSessionIds[i] || null;

                const outcome = await RecoveryCallbackController._processOneAction({
                    actionId: currentActionId,
                    sessionId: currentSessionId,
                    businessId,
                    status,
                    aiCopy,
                    metadata,
                    userId,
                    appId,
                    service,
                    startTime,
                    req,
                });

                results.push({ actionId: currentActionId, sessionId: currentSessionId, outcome });
            }

            // ── Final Audit Log (one per callback call, summarises the batch) ──
            await createAuditLog({
                userId,
                appId,
                businessId,
                actionType: 'n8n_callback',
                serviceId: ServiceSlugs.DEBT_COLLECTION,
                eventType: isBatch ? 'recovery_batch_completed' : 'recovery_action_completed',
                requestPayload: req.body,
                success: status === 'success',
                durationMs: Date.now() - startTime,
                requestId: `cb_${resolvedActionIds[0].substring(0, 8)}_${Date.now()}`
            }).catch(e => logger.error({ err: e }, '[RecoveryCallback] AuditLog create failed'));

            logger.info({ results, status }, '✅ [RecoveryCallback] All actions processed');
            return res.json({ success: true, results });

        } catch (error: any) {
            logger.error({ error: error.message, resolvedActionIds }, '❌ [RecoveryCallback] Failed');
            return res.status(500).json({ error: 'Internal Server Error', message: error.message });
        }
    }

    /**
     * Process a single DebtCollectionAction callback result:
     *   1. Idempotency guard
     *   2. Update DebtCollectionAction status + aiCopy
     *   3. Advance session step (optimistic lock)
     *   4. Transition session to EXHAUSTED or RECOVERED if all steps are done
     *   5. Log state history entry
     *   6. Create UsageLog entry (billing + reporting)
     */
    private static async _processOneAction(params: {
        actionId: string;
        sessionId: string | null;
        businessId: string;
        status: string;
        aiCopy?: string;
        metadata?: any;
        userId: string;
        appId: string;
        service: any;
        startTime: number;
        req: Request;
    }) {
        const { actionId, sessionId, businessId, status, aiCopy, metadata, userId, appId, service } = params;

        // ── 1. Idempotency Guard ──
        const existingAction = await prisma.debtCollectionAction.findUnique({ where: { id: actionId } });
        if (!existingAction) {
            logger.warn({ actionId }, '[RecoveryCallback] Action not found');
            return 'not_found';
        }
        if (existingAction.status === 'sent' || existingAction.status === 'failed') {
            logger.info(
                { actionId, currentStatus: existingAction.status },
                '⚠️ [RecoveryCallback] Idempotent skip — already processed'
            );
            return 'idempotent';
        }

        // ── 2. Update DebtCollectionAction ──
        const existingMeta = (existingAction.metadata as any) || {};
        const incomingMeta = metadata ? (typeof metadata === 'string' ? JSON.parse(metadata) : metadata) : {};

        const mergedMeta = {
            ...existingMeta,
            ...incomingMeta,
            callbackReceivedAt: new Date().toISOString(),
            callbackStatus: status
        };

        await prisma.debtCollectionAction.update({
            where: { id: actionId },
            data: {
                status: status === 'success' ? 'sent' : 'failed',
                aiGeneratedCopy: aiCopy || undefined,
                metadata: mergedMeta,
                sentAt: status === 'success' ? new Date() : undefined,
            },
        });

        // ── 3. Session Step Advancement ──
        if (!sessionId) {
            // No session context to advance — still a valid outcome (action logged)
            return 'action_updated_no_session';
        }

        const session = await p.debtCollectionSession.findFirst({
            where: { id: sessionId, status: 'ACTIVE' },
            include: { sequence: true },
        });

        if (!session) {
            logger.warn({ sessionId }, '[RecoveryCallback] Session not found or not ACTIVE — skip advancement');
            return 'session_not_active';
        }

        const steps = (session.sequence?.steps as any[]) || [];
        const currentStepIdx: number = session.currentStepIndex;
        const nextStepIdx = currentStepIdx + 1;
        const hasMoreSteps = nextStepIdx < steps.length;

        // Only advance on success — on failure we keep the step for retry
        let newSessionStatus: string | null = null;
        if (status === 'success') {
            if (!hasMoreSteps) {
                // All steps exhausted → check if invoice is paid → RECOVERED, otherwise EXHAUSTED
                const invoice = await p.debtCollectionInvoice.findFirst({
                    where: { businessId, externalId: session.externalInvoiceId },
                    select: { balance: true }
                });
                newSessionStatus = (invoice && invoice.balance <= 0) ? 'RECOVERED' : 'EXHAUSTED';
            }

            // Atomic optimistic-lock advancement
            const advanceResult = await p.debtCollectionSession.updateMany({
                where: {
                    id: sessionId,
                    currentStepIndex: currentStepIdx, // Optimistic lock
                    status: 'ACTIVE',
                },
                data: {
                    currentStepIndex: nextStepIdx,
                    status: newSessionStatus || 'ACTIVE',
                    updatedAt: new Date(),
                    nextActionAt: hasMoreSteps
                        ? RecoveryCallbackController._calculateNextActionDate(steps, nextStepIdx)
                        : null,
                },
            });

            if (advanceResult.count === 0) {
                logger.warn({ sessionId, currentStepIdx }, '[RecoveryCallback] Optimistic lock missed — another process already advanced');
                return 'lock_missed';
            }

            // ── 4. Write State History ──
            await p.debtCollectionStateHistory.create({
                data: {
                    sessionId,
                    previousStatus: 'ACTIVE',
                    newStatus: newSessionStatus || 'ACTIVE',
                    reason: newSessionStatus
                        ? `All ${steps.length} steps completed via n8n callback`
                        : `Step ${currentStepIdx + 1} → ${nextStepIdx + 1} advanced by n8n callback`,
                    triggerSource: 'N8N_CALLBACK',
                },
            }).catch((e: any) => logger.error({ err: e }, '[RecoveryCallback] StateHistory create failed'));

            logger.info(
                { sessionId, currentStepIdx, nextStepIdx, newStatus: newSessionStatus || 'ACTIVE', hasMoreSteps },
                `✅ [RecoveryCallback] Session step advanced${newSessionStatus ? ` → ${newSessionStatus}` : ''}`
            );
        }

        // ── 5. UsageLog ──
        if (service) {
            await prisma.usageLog.create({
                data: {
                    userId,
                    appId,
                    serviceId: service.id,
                    action: 'recovery_callback',
                    resourceType: 'recovery_action',
                    status: status === 'success' ? 'success' : 'failed',
                    statusCode: status === 'success' ? 200 : 500,
                    duration: Date.now() - params.startTime,
                    cost: 0,
                    metadata: JSON.stringify({ actionId, sessionId, status, ...metadata }),
                },
            }).catch((e: any) => logger.error({ err: e }, '[RecoveryCallback] UsageLog create failed'));
        }

        return status === 'success' ? 'advanced' : 'failed';
    }

    /**
     * Calculate the date for the next dunning step.
     * Uses the step's `day` offset relative to today.
     */
    private static _calculateNextActionDate(steps: any[], nextStepIdx: number): Date {
        const nextStep = steps[nextStepIdx];
        const dayOffset = nextStep?.day ?? 1;
        const next = new Date();
        next.setDate(next.getDate() + dayOffset);
        return next;
    }
}
