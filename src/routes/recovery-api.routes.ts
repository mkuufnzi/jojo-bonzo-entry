/**
 * Recovery REST API Routes
 * 
 * RESTful JSON API for the debt-collection / Smart Recovery service.
 * All endpoints return JSON and enforce businessId tenant isolation.
 * 
 * Base path: /api/v1/recovery
 * Auth: Session-based (requireAuth)
 * 
 * ROUTE INVENTORY (19 endpoints):
 * ┌─ Phase 1: Session Lifecycle ──────────────────────────────┐
 * │  POST   /sessions/:id/pause       → pauseSession         │
 * │  POST   /sessions/:id/resume      → resumeSession        │
 * │  POST   /sessions/:id/terminate   → terminateSession      │
 * │  GET    /sessions/:id             → getSession            │
 * │  POST   /sessions/:id/reassign    → reassignSession       │
 * │  POST   /sessions/:id/escalate    → escalateSession       │
 * ├─ Phase 2: Sequence CRUD ──────────────────────────────────┤
 * │  POST   /sequences                → createSequence        │
 * │  PUT    /sequences/:id            → updateSequence        │
 * │  GET    /sequences/:id            → getSequenceDetail     │
 * ├─ Phase 3: Action Management ──────────────────────────────┤
 * │  GET    /actions                  → getActions            │
 * │  POST   /actions/:id/retry        → retryAction           │
 * │  GET    /invoices/:id/timeline    → getInvoiceTimeline    │
 * ├─ Phase 4: Analytics ──────────────────────────────────────┤
 * │  GET    /analytics/overview       → getAnalyticsOverview  │
 * │  GET    /analytics/recovery-rate  → getRecoveryRateTrend  │
 * ├─ Phase 5: External Events ────────────────────────────────┤
 * │  POST   /callbacks/payment-received → handlePaymentCallback│
 * │  POST   /analyze/:invoiceId       → analyzeInvoiceRisk    │
 * ├─ Phase 6: Bulk Operations ────────────────────────────────┤
 * │  POST   /sessions/bulk-action     → bulkAction            │
 * │  GET    /export                   → exportCsv             │
 * ├─ Phase 7: Queue Health ───────────────────────────────────┤
 * │  GET    /queue-health             → getQueueHealth (ADMIN)│
 * └───────────────────────────────────────────────────────────┘
 */
import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/session.middleware';
import { requireServiceAccess } from '../middleware/service.middleware';
import { logUsage } from '../middleware/logging.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { RecoveryService } from '../modules/recovery/recovery.service';
import { logger } from '../lib/logger';

const router = Router();
const recoveryService = new RecoveryService();

// ════════════════════════════════════════════════════════════
// ██  Middleware Chain: Auth → Service Access → Usage Logging
// ════════════════════════════════════════════════════════════
router.use(requireAuth);
router.use(requireServiceAccess('floovioo_transactional_debt-collection'));
router.use(logUsage);

/**
 * Helper: Extract businessId from the authenticated session.
 * All tenant-scoped endpoints use this for data isolation.
 * 
 * Falls back to a DB lookup when the session user object does not carry
 * businessId (e.g. sessions established before business onboarding).
 */
async function getBusinessId(req: Request, res: Response): Promise<string | null> {
    const user = (res.locals as any).user || (req as any).user;
    const businessId = user?.businessId || user?.business?.id;
    if (businessId) return businessId;

    // Fallback: look up the businessId on the User record (User carries businessId scalar)
    if (user?.id) {
        const { default: prisma } = await import('../lib/prisma');
        const fresh = await prisma.user.findUnique({
            where: { id: user.id },
            select: { businessId: true }
        });
        if (fresh?.businessId) {
            if (res.locals.user) res.locals.user.businessId = fresh.businessId;
            if ((req as any).user) (req as any).user.businessId = fresh.businessId;
            return fresh.businessId;
        }
    }

    console.log('[Recovery API] ❌ No businessId resolvable — user not onboarded or business not linked');
    res.status(400).json({ success: false, error: 'No business context. Please complete onboarding.' });
    return null;
}


// ════════════════════════════════════════════════════════════
// ██  Phase 1: Session Lifecycle
// ════════════════════════════════════════════════════════════

/** POST /sessions/:id/pause — Pause an active recovery session */
router.post('/sessions/:id/pause', async (req: Request, res: Response) => {
    const businessId = await getBusinessId(req, res);
    if (!businessId) return;
    console.log(`[Recovery API] POST /sessions/${req.params.id}/pause — businessId: ${businessId}`);
    try {
        const result = await recoveryService.pauseSession(businessId, req.params.id);
        console.log(`[Recovery API] ⏸️ Pause result: ${JSON.stringify({ success: result.success, sessionId: req.params.id })}`);
        return res.status(result.success ? 200 : 400).json(result);
    } catch (err: any) {
        console.log(`[Recovery API] ❌ Pause session error: ${err.message}`);
        logger.error({ err }, '[Recovery API] Pause session failed');
        return res.status(500).json({ success: false, error: err.message });
    }
});

/** POST /sessions/:id/resume — Resume a paused session */
router.post('/sessions/:id/resume', async (req: Request, res: Response) => {
    const businessId = await getBusinessId(req, res);
    if (!businessId) return;
    console.log(`[Recovery API] POST /sessions/${req.params.id}/resume — businessId: ${businessId}`);
    try {
        const result = await recoveryService.resumeSession(businessId, req.params.id);
        console.log(`[Recovery API] ▶️ Resume result: ${JSON.stringify({ success: result.success, sessionId: req.params.id })}`);
        return res.status(result.success ? 200 : 400).json(result);
    } catch (err: any) {
        console.log(`[Recovery API] ❌ Resume session error: ${err.message}`);
        logger.error({ err }, '[Recovery API] Resume session failed');
        return res.status(500).json({ success: false, error: err.message });
    }
});

/** POST /sessions/:id/terminate — Manually terminate a session */
router.post('/sessions/:id/terminate', async (req: Request, res: Response) => {
    const businessId = await getBusinessId(req, res);
    if (!businessId) return;
    console.log(`[Recovery API] POST /sessions/${req.params.id}/terminate — businessId: ${businessId}, reason: ${req.body?.reason || 'manual'}`);
    try {
        const result = await recoveryService.terminateSession(businessId, req.params.id, req.body?.reason);
        console.log(`[Recovery API] 🛑 Terminate result: ${JSON.stringify({ success: result.success, sessionId: req.params.id })}`);
        return res.status(result.success ? 200 : 400).json(result);
    } catch (err: any) {
        console.log(`[Recovery API] ❌ Terminate session error: ${err.message}`);
        logger.error({ err }, '[Recovery API] Terminate session failed');
        return res.status(500).json({ success: false, error: err.message });
    }
});

/** GET /sessions/:id — Full session detail with timeline */
router.get('/sessions/:id', async (req: Request, res: Response) => {
    const businessId = await getBusinessId(req, res);
    if (!businessId) return;
    console.log(`[Recovery API] GET /sessions/${req.params.id} — businessId: ${businessId}`);
    try {
        const result = await recoveryService.getSession(businessId, req.params.id);
        if (!result) {
            console.log(`[Recovery API] ⚠️ Session ${req.params.id} not found`);
            return res.status(404).json({ success: false, error: 'Session not found' });
        }
        return res.json({ success: true, ...result });
    } catch (err: any) {
        console.log(`[Recovery API] ❌ Get session error: ${err.message}`);
        logger.error({ err }, '[Recovery API] Get session failed');
        return res.status(500).json({ success: false, error: err.message });
    }
});

/** POST /sessions/:id/reassign — Reassign to a different sequence */
router.post('/sessions/:id/reassign', async (req: Request, res: Response) => {
    const businessId = await getBusinessId(req, res);
    if (!businessId) return;
    const { sequenceId } = req.body;
    if (!sequenceId) {
        console.log(`[Recovery API] ⚠️ Reassign missing sequenceId`);
        return res.status(400).json({ success: false, error: 'sequenceId is required' });
    }
    console.log(`[Recovery API] POST /sessions/${req.params.id}/reassign — businessId: ${businessId}, newSequenceId: ${sequenceId}`);
    try {
        const result = await recoveryService.reassignSession(businessId, req.params.id, sequenceId);
        console.log(`[Recovery API] 🔄 Reassign result: ${JSON.stringify({ success: result.success, sessionId: req.params.id })}`);
        return res.status(result.success ? 200 : 400).json(result);
    } catch (err: any) {
        console.log(`[Recovery API] ❌ Reassign session error: ${err.message}`);
        logger.error({ err }, '[Recovery API] Reassign session failed');
        return res.status(500).json({ success: false, error: err.message });
    }
});

/** POST /sessions/:id/escalate — Skip to the next step immediately */
router.post('/sessions/:id/escalate', async (req: Request, res: Response) => {
    const businessId = await getBusinessId(req, res);
    if (!businessId) return;
    console.log(`[Recovery API] POST /sessions/${req.params.id}/escalate — businessId: ${businessId}`);
    try {
        const result = await recoveryService.escalateSession(businessId, req.params.id);
        console.log(`[Recovery API] ⏩ Escalate result: ${JSON.stringify({ success: result.success, sessionId: req.params.id })}`);
        return res.status(result.success ? 200 : 400).json(result);
    } catch (err: any) {
        console.log(`[Recovery API] ❌ Escalate session error: ${err.message}`);
        logger.error({ err }, '[Recovery API] Escalate session failed');
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ════════════════════════════════════════════════════════════
// ██  Phase 2: Sequence CRUD
// ════════════════════════════════════════════════════════════

/** POST /sequences — Create a new dunning sequence */
router.post('/sequences', async (req: Request, res: Response) => {
    const businessId = await getBusinessId(req, res);
    if (!businessId) return;
    console.log(`[Recovery API] POST /sequences — businessId: ${businessId}, name: ${req.body?.name || 'unnamed'}`);
    try {
        const result = await recoveryService.createSequence(businessId, req.body);
        console.log(`[Recovery API] ✅ Sequence created: ${JSON.stringify({ success: result.success })}`);
        return res.status(result.success ? 201 : 400).json(result);
    } catch (err: any) {
        console.log(`[Recovery API] ❌ Create sequence error: ${err.message}`);
        logger.error({ err }, '[Recovery API] Create sequence failed');
        return res.status(500).json({ success: false, error: err.message });
    }
});

/** PUT /sequences/:id — Update a sequence */
router.put('/sequences/:id', async (req: Request, res: Response) => {
    const businessId = await getBusinessId(req, res);
    if (!businessId) return;
    console.log(`[Recovery API] PUT /sequences/${req.params.id} — businessId: ${businessId}`);
    try {
        const result = await recoveryService.updateSequence(businessId, { id: req.params.id, ...req.body });
        console.log(`[Recovery API] ✅ Sequence updated: ${req.params.id}`);
        return res.json({ success: true, sequence: result });
    } catch (err: any) {
        console.log(`[Recovery API] ❌ Update sequence error: ${err.message}`);
        logger.error({ err }, '[Recovery API] Update sequence failed');
        return res.status(500).json({ success: false, error: err.message });
    }
});

/** GET /sequences/:id — Get single sequence detail with stats */
router.get('/sequences/:id', async (req: Request, res: Response) => {
    const businessId = await getBusinessId(req, res);
    if (!businessId) return;
    console.log(`[Recovery API] GET /sequences/${req.params.id} — businessId: ${businessId}`);
    try {
        const result = await recoveryService.getSequenceDetail(businessId, req.params.id);
        if (!result) {
            console.log(`[Recovery API] ⚠️ Sequence ${req.params.id} not found`);
            return res.status(404).json({ success: false, error: 'Sequence not found' });
        }
        return res.json({ success: true, ...result });
    } catch (err: any) {
        console.log(`[Recovery API] ❌ Get sequence detail error: ${err.message}`);
        logger.error({ err }, '[Recovery API] Get sequence detail failed');
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ════════════════════════════════════════════════════════════
// ██  Phase 3: Action Management
// ════════════════════════════════════════════════════════════

/** GET /actions — List all dunning actions (paginated + filtered) */
router.get('/actions', async (req: Request, res: Response) => {
    const businessId = await getBusinessId(req, res);
    if (!businessId) return;
    console.log(`[Recovery API] GET /actions — businessId: ${businessId}, page: ${req.query.page || 1}, status: ${req.query.status || 'all'}`);
    try {
        const result = await recoveryService.getActions(businessId, {
            page: parseInt(req.query.page as string) || 1,
            limit: parseInt(req.query.limit as string) || 25,
            status: req.query.status as string,
            dateFrom: req.query.dateFrom as string,
            dateTo: req.query.dateTo as string,
            customerId: req.query.customerId as string
        });
        return res.json({ success: true, ...result });
    } catch (err: any) {
        console.log(`[Recovery API] ❌ Get actions error: ${err.message}`);
        logger.error({ err }, '[Recovery API] Get actions failed');
        return res.status(500).json({ success: false, error: err.message });
    }
});

/** POST /actions/:id/retry — Retry a failed action */
router.post('/actions/:id/retry', async (req: Request, res: Response) => {
    const businessId = await getBusinessId(req, res);
    if (!businessId) return;
    console.log(`[Recovery API] POST /actions/${req.params.id}/retry — businessId: ${businessId}`);
    try {
        const result = await recoveryService.retryAction(businessId, req.params.id);
        console.log(`[Recovery API] 🔁 Retry result: ${JSON.stringify({ success: result.success, actionId: req.params.id })}`);
        return res.status(result.success ? 200 : 400).json(result);
    } catch (err: any) {
        console.log(`[Recovery API] ❌ Retry action error: ${err.message}`);
        logger.error({ err }, '[Recovery API] Retry action failed');
        return res.status(500).json({ success: false, error: err.message });
    }
});

/** GET /invoices/:invoiceId/timeline — Full recovery timeline for an invoice */
router.get('/invoices/:invoiceId/timeline', async (req: Request, res: Response) => {
    const businessId = await getBusinessId(req, res);
    if (!businessId) return;
    console.log(`[Recovery API] GET /invoices/${req.params.invoiceId}/timeline — businessId: ${businessId}`);
    try {
        const result = await recoveryService.getInvoiceTimeline(businessId, req.params.invoiceId);
        if (!result) {
            console.log(`[Recovery API] ⚠️ No timeline found for invoice ${req.params.invoiceId}`);
            return res.status(404).json({ success: false, error: 'No recovery history found for this invoice' });
        }
        return res.json({ success: true, ...result });
    } catch (err: any) {
        console.log(`[Recovery API] ❌ Get invoice timeline error: ${err.message}`);
        logger.error({ err }, '[Recovery API] Get invoice timeline failed');
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ════════════════════════════════════════════════════════════
// ██  Phase 4: Analytics
// ════════════════════════════════════════════════════════════

/** GET /analytics/overview — Full recovery analytics */
router.get('/analytics/overview', async (req: Request, res: Response) => {
    const businessId = await getBusinessId(req, res);
    if (!businessId) return;
    console.log(`[Recovery API] GET /analytics/overview — businessId: ${businessId}`);
    try {
        const result = await recoveryService.getAnalyticsOverview(businessId);
        return res.json({ success: true, ...result });
    } catch (err: any) {
        console.log(`[Recovery API] ❌ Get analytics overview error: ${err.message}`);
        logger.error({ err }, '[Recovery API] Get analytics overview failed');
        return res.status(500).json({ success: false, error: err.message });
    }
});

/** GET /analytics/recovery-rate — Recovery rate trend */
router.get('/analytics/recovery-rate', async (req: Request, res: Response) => {
    const businessId = await getBusinessId(req, res);
    if (!businessId) return;
    const days = parseInt(req.query.days as string) || 30;
    console.log(`[Recovery API] GET /analytics/recovery-rate — businessId: ${businessId}, days: ${days}`);
    try {
        const result = await recoveryService.getRecoveryRateTrend(businessId, days);
        return res.json({ success: true, ...result });
    } catch (err: any) {
        console.log(`[Recovery API] ❌ Get recovery rate trend error: ${err.message}`);
        logger.error({ err }, '[Recovery API] Get recovery rate trend failed');
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ════════════════════════════════════════════════════════════
// ██  Phase 5: External Events
// ════════════════════════════════════════════════════════════

/** POST /callbacks/payment-received — Webhook for payment events */
router.post('/callbacks/payment-received', async (req: Request, res: Response) => {
    const businessId = await getBusinessId(req, res);
    if (!businessId) return;
    const { invoiceId, paymentAmount, paymentDate, source } = req.body;
    if (!invoiceId || paymentAmount === undefined) {
        console.log(`[Recovery API] ⚠️ Payment callback missing required fields: invoiceId=${invoiceId}, paymentAmount=${paymentAmount}`);
        return res.status(400).json({ success: false, error: 'invoiceId and paymentAmount are required' });
    }
    console.log(`[Recovery API] POST /callbacks/payment-received — businessId: ${businessId}, invoiceId: ${invoiceId}, amount: ${paymentAmount}, source: ${source || 'unknown'}`);
    try {
        const result = await recoveryService.handlePaymentCallback(businessId, { invoiceId, paymentAmount, paymentDate, source });
        console.log(`[Recovery API] 💰 Payment callback result: ${JSON.stringify({ success: result.success, invoiceId, alreadyRecovered: (result as any).alreadyRecovered || false })}`);
        return res.status(result.success ? 200 : 404).json(result);
    } catch (err: any) {
        console.log(`[Recovery API] ❌ Payment callback error: ${err.message}`);
        logger.error({ err }, '[Recovery API] Payment callback failed');
        return res.status(500).json({ success: false, error: err.message });
    }
});

/** POST /analyze/:invoiceId — AI risk scoring */
router.post('/analyze/:invoiceId', async (req: Request, res: Response) => {
    const businessId = await getBusinessId(req, res);
    if (!businessId) return;
    console.log(`[Recovery API] POST /analyze/${req.params.invoiceId} — businessId: ${businessId}`);
    try {
        const result = await recoveryService.analyzeInvoiceRisk(businessId, req.params.invoiceId);
        console.log(`[Recovery API] 🧠 Risk analysis: invoiceId=${req.params.invoiceId}, riskLevel=${result.riskLevel}, score=${result.riskScore}`);
        return res.json({ success: true, ...result });
    } catch (err: any) {
        console.log(`[Recovery API] ❌ Analyze invoice risk error: ${err.message}`);
        logger.error({ err }, '[Recovery API] Analyze invoice risk failed');
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ════════════════════════════════════════════════════════════
// ██  Phase 6: Bulk Operations
// ════════════════════════════════════════════════════════════

/** POST /sessions/bulk-action — Bulk pause/resume/terminate */
router.post('/sessions/bulk-action', async (req: Request, res: Response) => {
    const businessId = await getBusinessId(req, res);
    if (!businessId) return;
    const { action, sessionIds } = req.body;
    if (!action || !Array.isArray(sessionIds) || sessionIds.length === 0) {
        console.log(`[Recovery API] ⚠️ Bulk action missing required fields: action=${action}, sessionIds=${sessionIds?.length || 0}`);
        return res.status(400).json({ success: false, error: 'action and sessionIds[] are required' });
    }
    if (!['pause', 'resume', 'terminate'].includes(action)) {
        console.log(`[Recovery API] ⚠️ Invalid bulk action: ${action}`);
        return res.status(400).json({ success: false, error: 'action must be pause, resume, or terminate' });
    }
    console.log(`[Recovery API] POST /sessions/bulk-action — businessId: ${businessId}, action: ${action}, count: ${sessionIds.length}`);
    try {
        const result = await recoveryService.bulkAction(businessId, action, sessionIds);
        console.log(`[Recovery API] 📦 Bulk action complete: action=${action}, affected=${result.affected}, errors=${result.errors.length}`);
        return res.json(result);
    } catch (err: any) {
        console.log(`[Recovery API] ❌ Bulk action error: ${err.message}`);
        logger.error({ err }, '[Recovery API] Bulk action failed');
        return res.status(500).json({ success: false, error: err.message });
    }
});

/** GET /export — Export recovery data as CSV */
router.get('/export', async (req: Request, res: Response) => {
    const businessId = await getBusinessId(req, res);
    if (!businessId) return;
    const type = (req.query.type as string) || 'sessions';
    if (!['sessions', 'actions'].includes(type)) {
        console.log(`[Recovery API] ⚠️ Invalid export type: ${type}`);
        return res.status(400).json({ success: false, error: 'type must be sessions or actions' });
    }
    console.log(`[Recovery API] GET /export — businessId: ${businessId}, type: ${type}`);
    try {
        const csv = await recoveryService.exportCsv(businessId, type as any);
        console.log(`[Recovery API] 📥 CSV export generated: type=${type}, length=${csv.length}`);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=recovery_${type}_${new Date().toISOString().split('T')[0]}.csv`);
        return res.send(csv);
    } catch (err: any) {
        console.log(`[Recovery API] ❌ Export CSV error: ${err.message}`);
        logger.error({ err }, '[Recovery API] Export CSV failed');
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ════════════════════════════════════════════════════════════
// ██  Phase 7: Queue Health Monitoring (Admin Only)
// ════════════════════════════════════════════════════════════

/** GET /queue-health — BullMQ queue metrics and scheduled jobs (admin only) */
router.get('/queue-health', requireRole(['ROOT', 'ADMIN']), async (req: Request, res: Response) => {
    console.log(`[Recovery API] GET /queue-health — admin request from ${(res.locals as any).user?.email || 'unknown'}`);
    try {
        const result = await recoveryService.getQueueHealth();
        return res.json({ success: true, ...result });
    } catch (err: any) {
        logger.error({ err }, '[Recovery API] Queue health check failed');
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ════════════════════════════════════════════════════════════
// ██  Phase 8: Debug / Test Utilities
//     Instant-Fire: create a test sequence + fire n8n NOW
// ════════════════════════════════════════════════════════════

/**
 * POST /debug/instant-fire
 *
 * Creates (or reuses) a "5-Minute Test" dunning sequence and IMMEDIATELY
 * queues a batch-execute job for the first overdue customer session found.
 * Use this to verify n8n is receiving webhooks without waiting for the cron.
 */
router.post('/debug/instant-fire', async (req: Request, res: Response) => {
    const businessId = await getBusinessId(req, res);
    if (!businessId) return;

    const user = (res.locals as any).user || (req as any).user;
    logger.info({ businessId }, '🧪 [Recovery Debug] Instant-fire triggered');

    try {
        const { default: prisma } = await import('../lib/prisma');
        const p = prisma as any;

        // 1. Find ALL active recovery sessions for this business
        const activeSessions = await p.debtCollectionSession.findMany({
            where: { businessId, status: 'ACTIVE' },
            include: { sequence: true },
            orderBy: { createdAt: 'desc' }
        });

        if (activeSessions.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No active recovery sessions found. Enroll a customer first.',
                hint: 'Go to /dashboard/recovery/customers/:id and click "Start Recovery"'
            });
        }

        // Resolve customer email from first session
        const firstMeta = (activeSessions[0].metadata as any) || {};
        const customerEmail = firstMeta.customerEmail || null;

        if (!customerEmail) {
            return res.status(400).json({
                success: false,
                error: 'Customer session has no email address — cannot dispatch to n8n.',
                sessionId: activeSessions[0].id
            });
        }

        // 2. ⚡ RESET IDEMPOTENCY: Delete today's SENT actions so they can be re-dispatched
        const today = new Date().toISOString().split('T')[0];
        const sessionIds = activeSessions.map((s: any) => s.id);

        const deleted = await p.debtCollectionAction.deleteMany({
            where: {
                sessionId: { in: sessionIds },
                status: { in: ['sent', 'dispatched', 'queued', 'failed'] },
                createdAt: { gte: new Date(`${today}T00:00:00Z`) }
            }
        });

        logger.info({ businessId, deleted: deleted.count }, '🧪 [Instant Fire] Cleared today\'s actions for fresh dispatch');

        // 3. Force-refresh the webhook cache BEFORE dispatching (prevents stale URL)
        const { webhookService } = await import('../services/webhook.service');
        webhookService.invalidateCache();
        await webhookService.refreshConfig();

        // 4. Queue an IMMEDIATE batch-execute job with ALL sessions
        const { QUEUES, createQueue } = await import('../lib/queue');
        const recoveryQueue = createQueue(QUEUES.RECOVERY_ENGINE);

        const invoices = activeSessions.map((s: any) => {
            const m = (s.metadata as any) || {};
            return {
                sessionId: s.id,
                externalInvoiceId: s.externalInvoiceId,
                invoiceId: s.externalInvoiceId,
                customerId: s.customerId,
                amount: m.amount || 0,
                balance: m.amount || 0,
                dueDate: m.dueDate || new Date().toISOString(),
                currency: m.currency || 'USD'
            };
        });

        const jobData = {
            businessId,
            customerId: activeSessions[0].customerId,
            customerName: activeSessions[0].customerName || 'Test Customer',
            customerEmail,
            invoices,
            totalAmount: invoices.reduce((sum: number, i: any) => sum + (i.amount || 0), 0),
            triggeredBy: user?.id || 'debug_endpoint',
            isDebugFire: true
        };

        const job = await recoveryQueue.add('recovery:batch-execute', jobData, {
            delay: 0,
            jobId: `debug-fire-${businessId}-${Date.now()}`
        });

        logger.info({ businessId, jobId: job.id, invoiceCount: invoices.length, clearedActions: deleted.count }, '🧪 Instant-fire job queued');

        const appUrl = process.env.APP_URL || 'https://lakia-dreich-foamingly.ngrok-free.dev';
        return res.json({
            success: true,
            message: `✅ Instant-fire dispatched! Cleared ${deleted.count} stale actions, queued ${invoices.length} invoices. Check n8n.`,
            jobId: job.id,
            invoiceCount: invoices.length,
            clearedActions: deleted.count,
            customerEmail,
            callbackUrl: `${appUrl}/api/callbacks/recovery/action`
        });

    } catch (err: any) {
        logger.error({ err }, '❌ [Recovery Debug] Instant-fire failed');
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /actions/:id — Fetch full action detail including n8n response metadata.
 * Powers the dunning event detail page at /dashboard/recovery/actions/:id
 */
router.get('/actions/:id', async (req: Request, res: Response) => {
    const businessId = await getBusinessId(req, res);
    if (!businessId) return;

    try {
        const { default: prisma } = await import('../lib/prisma');
        const p = prisma as any;

        const action = await p.debtCollectionAction.findFirst({
            where: { id: req.params.id, businessId },
            include: {
                session: { include: { sequence: true } },
                debtCollectionCommunicationLog: true
            }
        });

        if (!action) {
            return res.status(404).json({ success: false, error: 'Action not found' });
        }

        let webhookUrl: string | null = null;
        try {
            const { webhookService } = await import('../services/webhook.service');
            webhookUrl = await webhookService.getEndpoint('floovioo_transactional_debt-collection', 'recovery_action');
        } catch {}

        const appUrl = process.env.APP_URL || '';
        return res.json({
            success: true,
            data: {
                ...action,
                webhookUrl,
                callbackUrl: `${appUrl}/api/callbacks/recovery/action`,
                sequenceName: action.session?.sequence?.name,
                stepTotal: (action.session?.sequence?.steps as any[])?.length ?? 0
            }
        });

    } catch (err: any) {
        logger.error({ err, actionId: req.params.id }, '[Recovery API] Action detail fetch failed');
        return res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
