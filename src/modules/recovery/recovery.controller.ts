import { Request, Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { RecoveryService } from './recovery.service';
import { logger } from '../../lib/logger';
import { createQueue, QUEUES } from '../../lib/queue';
import prisma from '../../lib/prisma';
import { notificationService } from '../../services/notification.service';

const recoveryQueue = createQueue(QUEUES.RECOVERY_ENGINE);
const recoveryService = new RecoveryService();
const p = prisma as any;

/**
 * RecoveryController
 * 
 * Handles Smart Recovery (Dunning) operations:
 * - Dashboard metrics
 * - Manual sync trigger
 * - Sequence configuration
 */
export class RecoveryController {

    /**
     * Resolves businessId from the request context.
     * Checks res.locals.user first (set by injectUser/requireAuth),
     * then falls back to a DB lookup by userId for sessions established
     * before the business association (e.g. stale session after onboarding).
     * 
     * Once resolved, writes the businessId back to res.locals.user so
     * subsequent calls in the same request pay no additional DB cost.
     */
    private static async resolveBusinessId(req: Request, res: Response): Promise<string | undefined> {
        const user = res.locals.user || (req as AuthRequest).user;
        const busId = user?.businessId || user?.business?.id;
        if (busId) return busId;

        // DB fallback for stale sessions — User carries businessId scalar
        if (user?.id) {
            const fresh = await prisma.user.findUnique({
                where: { id: user.id },
                select: { businessId: true }
            });
            if (fresh?.businessId) {
                if (res.locals.user) res.locals.user.businessId = fresh.businessId;
                if ((req as AuthRequest).user) (req as AuthRequest).user.businessId = fresh.businessId;
                return fresh.businessId;
            }
        }

        logger.debug({
            userId: user?.id,
            email: user?.email,
            url: req.originalUrl
        }, '🔍 [Recovery] resolveBusinessId: No businessId found in context');
        return undefined;
    }

    /**
     * Determines if the request expects a JSON response.
     * Uses explicit header checks to avoid Express content-negotiation quirks
     * that can misclassify browser page loads through reverse proxies (ngrok).
     */
    private static isJsonRequest(req: Request): boolean {
        // Explicit XHR header (set by jQuery/Axios/etc.)
        if (req.xhr) return true;

        // Explicit API path prefix
        if (req.path.includes('/api/') || req.baseUrl?.includes('/api/')) return true;

        // Accept header analysis
        const accept = req.headers.accept || '';
        const wantsJson = accept.includes('application/json');
        const wantsHtml = accept.includes('text/html') || accept.includes('application/xhtml+xml');
        
        // If the client explicitly asks for JSON and NOT HTML, it's an API call.
        // If it accepts both (e.g. */* or standard browser headers), treat it as HTML (browser navigation).
        return wantsJson && !wantsHtml;
    }

    static async dashboard(req: Request, res: Response) {
        try {
            const businessId = await RecoveryController.resolveBusinessId(req, res);
            
            if (!businessId) {
                logger.warn({ 
                    userId: (req as AuthRequest).user?.id,
                    path: req.path,
                    accept: req.headers.accept
                }, '⚠️ [Recovery] Business context missing for user');

                if (RecoveryController.isJsonRequest(req)) {
                    return res.status(400).json({ error: 'Business context required' });
                }
                return res.redirect('/dashboard');
            }

            const status = await recoveryService.getStatus(businessId);

            if (RecoveryController.isJsonRequest(req)) {
                return res.json({ success: true, data: status });
            }

            // Calculate Onboarding State dynamically
            const integration = await p.integration.findFirst({
                where: { businessId, provider: 'quickbooks', status: 'connected' }
            });
            const sequence = await p.debtCollectionSequence.findFirst({
                where: { businessId, isDefault: true }
            });

            let currentOnboardingStep = 1;
            let isOnboardingComplete = false;

            if (integration) {
                currentOnboardingStep = 2;
                if (sequence) {
                    currentOnboardingStep = 3;
                    if (sequence.isActive) {
                        isOnboardingComplete = true;
                    }
                }
            }

            return res.render('dashboard/recovery/index', {
                title: 'Smart Recovery | Floovioo',
                recovery: status,
                activeService: 'transactional',
                currentPath: '/dashboard/recovery',
                nonce: res.locals.nonce,
                customerSessions: status.customerSessions || [],
                isOnboardingComplete,
                currentOnboardingStep,
                breadcrumbs: [
                    { label: 'Dashboard', url: '/dashboard' },
                    { label: 'Smart Recovery', url: '/dashboard/recovery' }
                ]
            });
        } catch (error: any) {
            logger.error({ err: error }, '❌ [Recovery] Dashboard load failed');
            if (RecoveryController.isJsonRequest(req)) {
                return res.status(500).json({ success: false, error: error.message });
            }
            return res.status(500).render('error', { message: 'Failed to load recovery dashboard' });
        }
    }

    /**
     * GET /api/v1/recovery/status
     * Returns recovery metrics as JSON.
     */
    static async getStatus(req: Request, res: Response) {
        try {
            const businessId = await RecoveryController.resolveBusinessId(req, res);
            if (!businessId) {
                return res.status(400).json({ error: 'Business context required' });
            }

            const status = await recoveryService.getStatus(businessId);
            return res.json({ success: true, data: status });
        } catch (error: any) {
            logger.error({ err: error }, '❌ [Recovery] Status fetch failed');
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * POST /api/v1/recovery/trigger
     * Enqueues a manual overdue invoice sync for the business.
     */
    static async triggerSync(req: Request, res: Response) {
        try {
            const businessId = await RecoveryController.resolveBusinessId(req, res);
            if (!businessId) {
                return res.status(400).json({ error: 'Business context required' });
            }

            const job = await recoveryQueue.add('recovery:sync', {
                businessId,
                triggeredBy: (req as AuthRequest).user?.id || 'system',
                triggeredAt: new Date().toISOString()
            }, {
                jobId: `recovery-sync-${businessId}-${Date.now()}`,
                removeOnComplete: { age: 3600 },
                removeOnFail: false
            });

            logger.info({ businessId, jobId: job.id }, '🚀 [Recovery] Manual sync triggered');

            return res.json({
                success: true,
                message: 'Recovery sync queued successfully',
                jobId: job.id
            });
        } catch (error: any) {
            logger.error({ err: error }, '❌ [Recovery] Trigger failed');
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * POST /api/v1/recovery/settings
     * Updates the DebtCollectionSequence configuration for a business.
     */
    static async updateSettings(req: Request, res: Response) {
        try {
            const businessId = await RecoveryController.resolveBusinessId(req, res);
            if (!businessId) {
                return res.status(400).json({ error: 'Business context required' });
            }

            const { id, steps, isActive, name, settings, isDefault, rules } = req.body;

            const updated = await recoveryService.updateSequence(businessId, {
                id,
                steps,
                isActive,
                name,
                settings,
                isDefault,
                rules
            });

            // Sync with Workflow record if it's the default sequence
            if (updated.isDefault) {
                await p.workflow.updateMany({
                    where: { businessId, triggerType: 'invoice_overdue' },
                    data: {
                        isActive: updated.isActive,
                        triggerConfig: {
                            gracePeriod: (updated.settings as any)?.gracePeriod || 3
                        },
                        actionConfig: {
                            steps: updated.steps
                        }
                    } as any
                });
            }

            return res.json({ success: true, data: updated });
        } catch (error: any) {
            logger.error({ err: error }, '❌ [Recovery] Settings update failed');
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * GET /dashboard/recovery/settings
     * Renders the Advanced Recovery Settings page.
     */
    static async showSettings(req: Request, res: Response) {
        try {
            const businessId = await RecoveryController.resolveBusinessId(req, res);
            if (!businessId) return res.redirect('/dashboard');

            const { id } = req.query;
            const isNew = req.query.new === 'true';
            let sequence;

            if (isNew) {
                // Creating a new campaign — don't load existing
                sequence = null;
            } else if (id) {
                sequence = await p.debtCollectionSequence.findUnique({
                    where: { id: id as string }
                });
            } else {
                sequence = await p.debtCollectionSequence.findFirst({
                    where: { businessId, isDefault: true }
                });
            }

            return res.render('dashboard/recovery/settings', {
                title: sequence ? `Edit ${sequence.name}` : 'Recovery Settings',
                activeService: 'transactional',
                currentPath: req.url,
                nonce: res.locals.nonce,
                user: (req as AuthRequest).user,
                sequence: (sequence as any) || { 
                    name: 'Smart Recovery Campaign',
                    steps: (RecoveryService as any).DEFAULT_STEPS, 
                    settings: { gracePeriod: 3, brandVoice: 'standard' },
                    rules: {},
                    isDefault: true
                }
            });
        } catch (error) {
            logger.error({ err: error }, '❌ [Recovery] Settings load failed');
            res.redirect('/dashboard/recovery');
        }
    }

    /**
     * GET /dashboard/recovery/sequences
     * Lists all recovery campaigns/sequences.
     */
    static async sequences(req: Request, res: Response) {
        try {
            const businessId = await RecoveryController.resolveBusinessId(req, res);
            if (!businessId) return res.redirect('/dashboard');

            let filteredSequences = await p.debtCollectionSequence.findMany({
                where: { businessId },
                orderBy: { isDefault: 'desc' }
            });

            // --- SELF-HEALING ROUTINE (Phase 5 Fix) ---
            // If data was corrupted by the { create: [...] } bug, fix it on the fly.
            let needsReload = false;
            for (const seq of filteredSequences) {
                const stepsObj = seq.steps as any;
                
                // Detection 1: Prisma "create" wrapper corruption
                if (stepsObj && typeof stepsObj === 'object' && stepsObj.create && Array.isArray(stepsObj.create)) {
                    console.log(`[Recovery Fix] 🔧 Repairing corrupted steps for sequence: ${seq.id}`);
                    const repairedSteps = stepsObj.create.map((s: any) => ({
                        day: s.dayOffset || s.day,
                        action: (s.actionType || s.action || 'email').toLowerCase()
                    }));
                    
                    await p.debtCollectionSequence.update({
                        where: { id: seq.id },
                        data: { steps: repairedSteps }
                    });
                    needsReload = true;
                }
            }

            if (needsReload) {
                filteredSequences = await p.debtCollectionSequence.findMany({
                    where: { businessId },
                    orderBy: { isDefault: 'desc' }
                });
            }

            return res.render('dashboard/recovery/sequences', {
                title: 'Recovery Campaigns',
                activeService: 'transactional',
                currentPath: req.path,
                nonce: res.locals.nonce,
                user: (req as AuthRequest).user,
                sequences: filteredSequences
            });
        } catch (error) {
            logger.error({ err: error }, '❌ [Recovery] Sequences load failed');
            res.redirect('/dashboard/recovery');
        }
    }

    /**
     * GET /dashboard/recovery/sessions
     * Monitor active recovery journeys.
     */
    static async sessions(req: Request, res: Response) {
        try {
            const businessId = await RecoveryController.resolveBusinessId(req, res);
            if (!businessId) return res.redirect('/dashboard');

            const filterQuery = (req.query.filter as string)?.toUpperCase();
            const allowedFilters = ['ACTIVE', 'RECOVERED', 'TERMINATED', 'PAUSED', 'EXHAUSTED'];
            const statusFilter = allowedFilters.includes(filterQuery) 
                ? filterQuery 
                : { in: ['ACTIVE', 'PAUSED'] };

            const sessions = await p.debtCollectionSession.findMany({
                where: { businessId, status: statusFilter },
                include: { sequence: true, actions: true },
                orderBy: { createdAt: 'desc' }
            });

            // Grouping by customerId
            const customerGroupsMap = new Map<string, any>();
            for (const session of sessions) {
                if (!customerGroupsMap.has(session.customerId)) {
                    customerGroupsMap.set(session.customerId, {
                        customerId: session.customerId,
                        customerName: session.customerName,
                        sessions: [],
                        totalAmount: 0,
                        avgProgress: 0
                    });
                }
                const group = customerGroupsMap.get(session.customerId);
                group.sessions.push(session);
                group.totalAmount += Number(session.metadata?.amount || 0);
            }

            const customerGroups = Array.from(customerGroupsMap.values()).map(group => {
                let totalSteps = 0;
                let completedSteps = 0;
                
                group.sessions.forEach((s: any) => {
                    const steps = s.sequence?.steps || [];
                    totalSteps += steps.length;
                    completedSteps += s.currentStepIndex || 0;
                });

                group.avgProgress = totalSteps > 0 ? Math.min(100, (completedSteps / totalSteps) * 100) : 0;
                return group;
            });

            const displayTitle = filterQuery && allowedFilters.includes(filterQuery)
                ? `${filterQuery.charAt(0) + filterQuery.slice(1).toLowerCase()} Recovery Sessions`
                : 'Active Recovery Sessions';

            return res.render('dashboard/recovery/sessions', {
                title: displayTitle,
                activeService: 'transactional',
                currentPath: req.path,
                currentFilter: allowedFilters.includes(filterQuery) ? filterQuery : 'ACTIVE',
                nonce: res.locals.nonce,
                user: (req as AuthRequest).user,
                customerGroups
            });
        } catch (error) {
            logger.error({ err: error }, '❌ [Recovery] Sessions load failed');
            res.redirect('/dashboard/recovery');
        }
    }


    /**
     * GET /dashboard/recovery/onboarding
     * Renders the Onboarding Wizard.
     */
    static async showOnboarding(req: Request, res: Response) {
        try {
            const businessId = await RecoveryController.resolveBusinessId(req, res);
            if (!businessId) {
                return res.redirect('/dashboard');
            }

            // 1. Integration Check
            const integration = await p.integration.findFirst({
                where: { businessId, provider: 'quickbooks', status: 'connected' }
            });

            // 2. Fetch or Init Sequence (Draft)
            let sequence = await p.debtCollectionSequence.findFirst({
                where: { businessId, isDefault: true }
            });

            // Determine step (smart resumption or override)
            let step = 1;
            if (req.query.step) {
                step = parseInt(req.query.step as string);
            } else {
                if (integration) {
                    step = 2;
                    if (sequence) {
                        step = sequence.isActive ? 4 : 3; // 4 means completed
                    }
                }
            }

            if (step === 4) {
                 return res.redirect('/dashboard/recovery');
            }
            
            // Render View
            res.render('dashboard/recovery/onboarding', {
                title: 'Set up Smart Recovery',
                activeService: 'transactional',
                currentPath: req.path,
                nonce: res.locals.nonce,
                user: (req as AuthRequest).user,
                step,
                integration,
                sequence: sequence || { settings: { gracePeriod: 3, brandVoice: 'standard' } }
            });

        } catch (error) {
            console.error('Error loading onboarding:', error);
            res.redirect('/dashboard/recovery');
        }
    }

    /**
     * POST /api/v1/recovery/onboarding/step
     * Handles step completion and transitions.
     */
    static async saveOnboardingStep(req: Request, res: Response) {
        try {
            const businessId = await RecoveryController.resolveBusinessId(req, res);
            const { step, data } = req.body;

            if (!businessId) return res.status(400).json({ error: 'Business context required' });

            // Prepare Sequence Data
            const currentSequence = await p.debtCollectionSequence.findFirst({ 
                where: { businessId, isDefault: true } 
            });
            const seq: any = currentSequence;
            const settings = seq?.settings || {};

            if (step === 2) {
                // Save Configuration
                if (currentSequence) {
                    await p.debtCollectionSequence.update({
                        where: { id: (currentSequence as any).id },
                        data: {
                            settings: { ...settings, ...data }
                        }
                    });
                } else {
                    const defaultSteps = (RecoveryService as any).DEFAULT_STEPS.map((s: any) => ({
                        day: s.day,
                        action: s.action
                    }));

                    await p.debtCollectionSequence.create({
                        data: {
                            businessId,
                            name: 'Smart Recovery Campaign',
                            isActive: false,
                            isDefault: true,
                            settings: { ...settings, ...data },
                            steps: defaultSteps // Directly assign the array to the JSON field
                        }
                    });
                }
                
                return res.json({ success: true, nextStep: 3 });
            }

            if (step === 3) {
                // Activate & Create Workflow
                if (currentSequence) {
                    await p.debtCollectionSequence.update({
                        where: { id: (currentSequence as any).id },
                        data: { isActive: true }
                    });
                }

                // Use centralized workflow creation to ensure correct actionConfig.type
                const userId = (res.locals.user as any)?.id || (req as any).user?.id || 'system';
                const { workflowService } = await import('../../services/workflow.service');
                await workflowService.ensureRecoveryWorkflow(userId, businessId);

                return res.json({ success: true, redirect: '/dashboard/recovery' });
            }

            return res.json({ success: true });

        } catch (error: any) {
            logger.error({ err: error }, '❌ [Recovery] Onboarding save failed');
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * GET /dashboard/recovery/activity
     * Renders the Detailed Activity View.
     */
    static async activity(req: Request, res: Response) {
        try {
            const businessId = await RecoveryController.resolveBusinessId(req, res);
            if (!businessId) {
                return res.redirect('/dashboard');
            }

            const activeTab = req.query.tab === 'logs' ? 'logs' : 'invoices';
            
            let data: any = {
                title: 'Recovery Activity',
                activeService: 'transactional',
                currentPath: req.path,
                nonce: res.locals.nonce,
                user: (req as AuthRequest).user,
                activeTab
            };

            if (activeTab === 'invoices') {
                data.invoices = await recoveryService.getDetailedInvoices(businessId);
            } else {
                data.logs = await p.debtCollectionAction.findMany({
                    where: { businessId },
                    include: { session: true },
                    orderBy: { createdAt: 'desc' },
                    take: 50
                });
            }
            
            res.render('dashboard/recovery/activity', data);

        } catch (error) {
            logger.error({ err: error }, '❌ [Recovery] Activity load failed');
            res.redirect('/dashboard/recovery');
        }
    }

    /**
     * GET /api/v1/recovery/jobs/:id
     * Checks the status of a specific recovery job.
     */
    static async getSyncJobStatus(req: Request, res: Response) {
        try {
            const businessId = await RecoveryController.resolveBusinessId(req, res);
            if (!businessId) return res.status(400).json({ error: 'Business context required' });

            const jobId = req.params.id;
            const job = await recoveryQueue.getJob(jobId);

            if (!job) {
                return res.status(404).json({ success: false, error: 'Job not found' });
            }

            const state = await job.getState();
            const result = job.returnvalue;

            return res.json({ 
                success: true, 
                state,
                result
            });

        } catch (error: any) {
            logger.error({ err: error, jobId: req.params.id }, '❌ [Recovery] Job status check failed');
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * GET /dashboard/recovery/unpaid
     * Renders the Unpaid Invoices view from normalized DebtCollectionInvoice table.
     * Supports all connected integrations (QuickBooks, Zoho, Sage, Xero).
     */
    static async unpaid(req: Request, res: Response) {
        try {
            const businessId = await RecoveryController.resolveBusinessId(req, res);
            if (!businessId) return res.redirect('/dashboard');

            // Get default sequence for grace period context
            const sequence = await p.debtCollectionSequence.findFirst({
                where: { businessId, isDefault: true }
            });
            const gracePeriod = (sequence?.settings as any)?.gracePeriod || 3;

            // Query normalized invoice table (populated by ERP sync)
            const cachedInvoices = await p.debtCollectionInvoice.findMany({
                where: { businessId, balance: { gt: 0 } },
                include: { customer: true },
                orderBy: { dueDate: 'asc' }
            });

            const now = new Date();
            const invoices = cachedInvoices.map((inv: any) => {
                const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
                const daysOverdue = dueDate ? Math.floor((now.getTime() - dueDate.getTime()) / 86400000) : 0;

                return {
                    id: inv.externalId,
                    externalId: inv.externalId,
                    customerId: inv.customer?.externalId || 'unknown',
                    date: inv.issuedDate || inv.createdAt,
                    dueDate,
                    contactName: inv.customer?.name || 'Unknown',
                    total: inv.amount,
                    balance: inv.balance,
                    status: 'open',
                    daysOverdue
                };
            });

            return res.render('dashboard/recovery/unpaid', {
                title: 'Unpaid Invoices',
                activeService: 'transactional',
                currentPath: '/dashboard/recovery/unpaid',
                nonce: res.locals.nonce,
                user: (req as AuthRequest).user,
                invoices,
                gracePeriod
            });

        } catch (error) {
            logger.error({ err: error }, '❌ [Recovery] Unpaid load failed');
            res.redirect('/dashboard/recovery');
        }
    }

    /**
     * GET /dashboard/recovery/customers/:id
     * Renders the Customer Detail page with invoice breakdown and recovery history.
     * Reads from normalized DebtCollectionCustomer + DebtCollectionInvoice tables.
     * Supports all connected integrations (QuickBooks, Zoho, Sage, Xero).
     */
    static async customerDetail(req: Request, res: Response) {
        try {
            const businessId = await RecoveryController.resolveBusinessId(req, res);
            if (!businessId) return res.redirect('/dashboard');

            const customerId = req.params.id;

            // Fetch customer from normalized cache
            const dbCustomer = await p.debtCollectionCustomer.findFirst({
                where: { businessId, externalId: customerId }
            });

            if (!dbCustomer) {
                logger.warn({ businessId, customerId }, '⚠️ [Recovery] Customer not found in normalized cache');
                return res.redirect('/dashboard/recovery/unpaid');
            }

            // Fetch all invoices for this customer from normalized cache (paid + unpaid)
            const cachedInvoices = await p.debtCollectionInvoice.findMany({
                where: { businessId, customerId: dbCustomer.id },
                orderBy: { dueDate: 'desc' }
            });

            const now = new Date();

            // Get all recovery sessions for this customer
            // NOTE: Sessions store customerId as QBO external ID (e.g. "1"), not internal UUID
            const debtCollectionSessions = await p.debtCollectionSession.findMany({
                where: { businessId, customerId: customerId },
                include: { sequence: true, actions: true },
                orderBy: { createdAt: 'desc' }
            });

            // Build a set of invoice IDs with active recovery
            const activeInvoiceIds = new Set(
                debtCollectionSessions.filter((s: any) => s.status === 'ACTIVE').map((s: any) => s.externalInvoiceId)
            );

            // Get the default sequence for grace period
            const sequence = await p.debtCollectionSequence.findFirst({
                where: { businessId, isDefault: true }
            });
            const gracePeriod = (sequence?.settings as any)?.gracePeriod || 3;

            // Get all sequences for dropdown
            const sequences = await p.debtCollectionSequence.findMany({
                where: { businessId },
                orderBy: { isDefault: 'desc' }
            });

            // Map and categorize invoices from normalized data
            const invoices = cachedInvoices.map((inv: any) => {
                let dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
                if (dueDate && isNaN(dueDate.getTime())) dueDate = null;
                
                let date = inv.issuedDate ? new Date(inv.issuedDate) : new Date(inv.createdAt || 0);
                if (isNaN(date.getTime())) date = new Date(0);
                
                const daysOverdue = dueDate ? Math.floor((now.getTime() - dueDate.getTime()) / 86400000) : 0;
                const balance = Number(inv.balance || 0);
                const isPaid = balance === 0;
                const isOverdue = !isPaid && daysOverdue > 0;
                const hasActiveRecovery = activeInvoiceIds.has(inv.externalId);

                let category: string;
                if (hasActiveRecovery) category = 'recovery';
                else if (isPaid) category = 'paid';
                else if (isOverdue && daysOverdue >= gracePeriod) category = 'overdue';
                else if (isOverdue) category = 'grace';
                else category = 'open';

                return {
                    id: inv.externalId,
                    externalId: inv.externalId,
                    date,
                    dueDate,
                    total: inv.amount,
                    balance,
                    status: balance > 0 ? 'unpaid' : 'paid',
                    category,
                    daysOverdue
                };
            });

            // Get all dunning actions for this customer's invoices
            const invoiceIds = invoices.map((inv: any) => inv.externalId);
            const allActions = await p.debtCollectionAction.findMany({
                where: { businessId, externalInvoiceId: { in: invoiceIds } },
                include: { session: { include: { sequence: true } } },
                orderBy: { sentAt: 'desc' }
            });

            // Compute summary stats
            const totalBalance = invoices.reduce((sum: number, inv: any) => sum + inv.balance, 0);
            const unpaidCount = invoices.filter((inv: any) => inv.balance > 0).length;
            const overdueCount = invoices.filter((inv: any) => inv.category === 'overdue' || inv.category === 'recovery').length;
            const activeRecoveryCount = debtCollectionSessions.filter((s: any) => s.status === 'ACTIVE').length;

            return res.render('dashboard/recovery/customer', {
                title: `${dbCustomer.name || 'Customer'} | Recovery`,
                activeService: 'transactional',
                currentPath: `/dashboard/recovery/customers/${customerId}`,
                nonce: res.locals.nonce,
                user: (req as AuthRequest).user,
                customer: {
                    id: customerId,
                    name: dbCustomer.name || 'Unknown',
                    email: dbCustomer.email || null,
                    phone: dbCustomer.phone || null,
                    company: dbCustomer.company || null,
                    balance: totalBalance
                },
                invoices,
                debtCollectionSessions,
                recoverySessions: debtCollectionSessions,
                actions: allActions,
                sequences,
                gracePeriod,
                stats: { totalBalance, unpaidCount, overdueCount, activeRecoveryCount }
            });

        } catch (error) {
            logger.error({ err: error, customerId: req.params.id }, '❌ [Recovery] Customer detail load failed');
            res.redirect('/dashboard/recovery/unpaid');
        }
    }

    /**
     * POST /dashboard/recovery/customers/enroll
     * Creates one DebtCollectionSession per customer covering all their unpaid invoices.
     * Body: { customers: [{ customerId, customerName, invoices: [{ invoiceId, balance, dueDate }] }] }
     * Also supports legacy: { customers: [{ customerId, customerName, invoiceIds: string[] }] }
     */
    static async enrollCustomers(req: Request, res: Response) {
        try {
            const businessId = await RecoveryController.resolveBusinessId(req, res);
            if (!businessId) {
                return res.status(400).json({ error: 'Business context required' });
            }

            const { customers, sequenceId } = req.body;
            if (!Array.isArray(customers) || customers.length === 0) {
                return res.status(400).json({ error: 'No customers provided' });
            }

            // Fetch all active sequences
            const sequences = await p.debtCollectionSequence.findMany({
                where: { businessId, isActive: true }
            });

            if (sequences.length === 0) {
                 return res.status(400).json({
                    error: 'No recovery sequence configured. Complete onboarding first.',
                    redirect: '/dashboard/recovery/onboarding'
                });
            }

            const defaultSequence = sequences.find((s: any) => s.isDefault) || sequences[0];

            // Resolve target sequence from override if provided
            const overrideSequence = sequenceId ? sequences.find((s: any) => s.id === sequenceId) : null;

            // Batch-fetch customer emails from QBO
            const customerEmailMap = new Map<string, string>();
            const customerIds = customers.map((c: any) => c.customerId).filter(Boolean);

            try {
                const integration = await p.integration.findFirst({
                    where: { businessId, provider: 'quickbooks', status: 'connected' }
                });

                if (integration) {
                    const { QBOProvider } = await import('../../services/integrations/providers/quickbooks.provider');
                    const provider = new QBOProvider();
                    await provider.initialize(integration);

                    for (const custId of customerIds) {
                        try {
                            const custData = await provider.fetchRaw(`/customer/${custId}`);
                            const email = custData?.Customer?.PrimaryEmailAddr?.Address;
                            if (email) customerEmailMap.set(custId, email);
                        } catch (e) {
                            // Non-fatal — we'll still enroll without email
                        }
                    }
                }
            } catch (e) {
                logger.warn({ businessId }, '⚠️ [Recovery] Could not fetch customer emails during enrollment');
            }

            let enrolledCount = 0;
            const errors: string[] = [];

            for (const cust of customers) {
                try {
                    // Support both formats: invoices[] (enriched) and invoiceIds[] (legacy)
                    const invoiceEntries: Array<{ invoiceId: string; balance: number; dueDate: string | null }> =
                        cust.invoices 
                            ? cust.invoices 
                            : (cust.invoiceIds || []).map((id: string) => ({ invoiceId: id, balance: 0, dueDate: null }));

                    const customerEmail = customerEmailMap.get(cust.customerId) || null;

                    for (const inv of invoiceEntries) {
                        const existing = await p.debtCollectionSession.findFirst({
                            where: {
                                businessId,
                                externalInvoiceId: inv.invoiceId,
                                status: { in: ['ACTIVE', 'PAUSED'] }
                            }
                        });

                        if (existing) {
                            logger.debug({ invoiceId: inv.invoiceId, status: existing.status }, `⏭️ [Enrollment] Session already ${existing.status} — ${existing.status === 'PAUSED' ? 'resume instead of re-enroll' : 'skipping'}`);
                        } else {
                            const dueDate = inv.dueDate ? new Date(inv.dueDate) : new Date();

                            // Determine Sequence: Override > Smart Match > Default
                            let targetSeq = overrideSequence;
                            if (!targetSeq) {
                                // Smart Match based on invoice amount rules
                                targetSeq = await recoveryService.findApplicableSequence(businessId, { total: inv.balance }, sequences);
                            }
                            if (!targetSeq) targetSeq = defaultSequence;

                            await p.debtCollectionSession.create({
                                data: {
                                    businessId,
                                    sequenceId: targetSeq.id,
                                    externalInvoiceId: inv.invoiceId,
                                    customerId: cust.customerId,
                                    customerName: cust.customerName,
                                    status: 'ACTIVE',
                                    currentStepIndex: 0,
                                    // Manual enrollment: fire IMMEDIATELY, not at dueDate + offset
                                    nextActionAt: new Date(),
                                    metadata: {
                                        amount: inv.balance || 0,
                                        contactName: cust.customerName,
                                        customerEmail,
                                        customerId: cust.customerId,
                                        currency: 'USD',
                                        dueDate: dueDate.toISOString(),
                                        enrolledAt: new Date().toISOString(),
                                        enrolledBy: (req as AuthRequest).user?.id || 'system'
                                    }
                                }
                            });
                        }
                    }
                    enrolledCount++;
                } catch (err: any) {
                    logger.warn({ customerId: cust.customerId, err }, '⚠️ [Recovery] Failed to enroll customer');
                    errors.push(`${cust.customerName}: ${err.message}`);
                }
            }

            logger.info({ businessId, enrolledCount, total: customers.length }, '🚀 [Recovery] Customers enrolled');

            // Auto-trigger batch processing so enrolled sessions fire IMMEDIATELY
            if (enrolledCount > 0) {
                try {
                    const { QUEUES, createQueue } = await import('../../lib/queue');
                    const recoveryQueue = createQueue(QUEUES.RECOVERY_ENGINE);
                    await recoveryQueue.add('recovery:process-business', { businessId }, {
                        delay: 5000 // 5s delay to let DB writes settle
                    });
                    console.log(`[Recovery Enroll] ✅ Auto-queued process-business for ${enrolledCount} new session(s)`);
                    
                    await notificationService.notifyBusiness(
                        businessId,
                        'success',
                        'Customers Enrolled',
                        `${enrolledCount} customer(s) successfully enrolled in Debt Collection. First actions queued.`,
                        'syncEvent',
                        '/dashboard/recovery/sessions'
                    );
                } catch (qErr: any) {
                    logger.error({ err: qErr }, '⚠️ [Recovery] Failed to auto-queue process-business after enrollment');
                }
            }

            return res.json({
                success: true,
                enrolled: enrolledCount,
                errors: errors.length > 0 ? errors : undefined
            });

        } catch (error: any) {
            logger.error({ err: error }, '❌ [Recovery] Customer enrollment failed');
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * DELETE /dashboard/recovery/sequences/:id
     */
    static async deleteSequence(req: Request, res: Response) {
        try {
            const businessId = await RecoveryController.resolveBusinessId(req, res);
            if (!businessId) return res.status(400).json({ error: 'Business context required' });

            const { id } = req.params;
            await recoveryService.deleteSequence(businessId, id);

            return res.json({ success: true });
        } catch (error: any) {
            logger.error({ err: error }, '❌ [Recovery] Sequence deletion failed');
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * GET /dashboard/recovery/actions/:id
     *
     * Renders the dunning event detail page showing:
     * - Action type, status, timestamps
     * - Outbound webhook URL and payload summary
     * - n8n callback response (if received)
     * - Delivery metadata (messageId, provider, etc.)
     * - Full timeline link back to the session
     */
    static async actionDetail(req: Request, res: Response) {
        try {
            const businessId = await RecoveryController.resolveBusinessId(req, res);
            if (!businessId) return res.redirect('/dashboard/recovery/sessions');

            const { id } = req.params;
            
            const action = await p.debtCollectionAction.findFirst({
                where: { id, businessId },
                include: {
                    session: {
                        include: {
                            sequence: true,
                            actions: {
                                orderBy: { createdAt: 'asc' },
                                take: 20
                            }
                        }
                    },
                    debtCollectionCommunicationLog: true
                }
            });

            if (!action) {
                return res.redirect('/dashboard/recovery/sessions');
            }

            // Resolve the current live webhook URL for display
            let webhookUrl: string | null = null;
            try {
                const { webhookService } = await import('../../services/webhook.service');
                webhookUrl = await webhookService.getEndpoint('floovioo_transactional_debt-collection', 'recovery_action');
            } catch {}

            const appUrl = process.env.APP_URL || '';
            const meta = (action.metadata as any) || {};

            return res.render('dashboard/recovery/action-detail', {
                title: `Dunning Event — ${action.actionType}`,
                activeService: 'transactional',
                currentPath: `/dashboard/recovery/actions/${id}`,
                nonce: res.locals.nonce,
                user: (req as AuthRequest).user,
                action: {
                    ...action,
                    metadata: meta
                },
                session: action.session,
                sequence: action.session?.sequence,
                stepTotal: (action.session?.sequence?.steps as any[] || []).length,
                communicationLog: action.debtCollectionCommunicationLog,
                webhookUrl,
                callbackUrl: `${appUrl}/api/callbacks/recovery/action`,
                // Convenience properties for the view
                wasDispatched: !!meta.dispatchedAt || !!meta.n8nJobId || !!meta.dunningAction || (action.status === 'SENT' || action.status === 'FAILED'),
                callbackReceived: !!meta.callbackReceivedAt || !!meta.n8nJobId || !!meta.dunningAction || (action.status === 'SENT' || action.status === 'FAILED'),
                callbackStatus: meta.callbackStatus || action.status,
                deliveryMetadata: meta.deliveryMetadata || null
            });

        } catch (error) {
            logger.error({ err: error, actionId: req.params.id }, '❌ [Recovery] Action detail load failed');
            return res.redirect('/dashboard/recovery/sessions');
        }
    }

    /**
     * POST /api/v1/recovery/invoices/:id/analyze
     *
     * Conducts an AI Risk Analysis on a specific invoice to determine
     * the likelihood of default, suggested tone for communication, and
     * context about the customer's payment history.
     */
    static async analyzeInvoiceRisk(req: Request, res: Response) {
        try {
            const businessId = await RecoveryController.resolveBusinessId(req, res);
            if (!businessId) return res.status(401).json({ error: 'Unauthorized' });

            const { id } = req.params; // Document externalId

            const invoice = await p.debtCollectionInvoice.findFirst({
                where: { businessId, externalId: id },
                include: { customer: true }
            });

            if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

            // Generate mock AI response for now (can hook into real AI later)
            const unpaidCount = invoice.customer?.unpaidInvoices || 1;
            const daysPastDue = Math.max(0, Math.floor((Date.now() - (invoice.dueDate?.getTime() || Date.now())) / (1000 * 60 * 60 * 24)));
            
            let riskLevel = 'Low';
            let rationale = 'Customer usually pays on time.';
            let suggestedTone = 'Friendly Reminder';

            if (unpaidCount > 3 || daysPastDue > 30) {
                riskLevel = 'High';
                rationale = `Customer has ${unpaidCount} unpaid invoices and this one is ${daysPastDue} days past due.`;
                suggestedTone = 'Firm / Urgent';
            } else if (unpaidCount > 1 || daysPastDue > 10) {
                riskLevel = 'Medium';
                rationale = `Customer has multiple unpaid invoices or is moderately past due.`;
                suggestedTone = 'Professional Follow-up';
            }

            const analysis = {
                riskLevel,
                rationale,
                suggestedTone,
                metrics: {
                    daysPastDue,
                    totalUnpaidInvoices: unpaidCount,
                    customerLifetimeValue: invoice.customer?.lifetimeValue || 0,
                    score: riskLevel === 'High' ? 85 : (riskLevel === 'Medium' ? 55 : 20)
                }
            };

            return res.json({ success: true, analysis });

        } catch (error) {
            logger.error({ err: error, invoiceId: req.params.id }, '❌ [Recovery] AI Risk Analysis failed');
            return res.status(500).json({ error: 'Internal server error during analysis' });
        }
    }

    /**
     * GET /dashboard/recovery/sessions/:id
     *
     * Session detail: loads the session with all its actions and
     * redirects to the most recent action's detail page.
     * If no actions exist, renders the action-detail view with session-only context.
     */
    static async sessionDetail(req: Request, res: Response) {
        try {
            const businessId = await RecoveryController.resolveBusinessId(req, res);
            if (!businessId) return res.redirect('/dashboard/recovery/sessions');

            const { id } = req.params;

            const session = await p.debtCollectionSession.findFirst({
                where: { id, businessId },
                include: {
                    sequence: true,
                    actions: {
                        orderBy: { createdAt: 'desc' },
                        take: 1
                    }
                }
            });

            if (!session) {
                return res.redirect('/dashboard/recovery/sessions');
            }

            // Redirect to the latest action if one exists
            const latestAction = session.actions?.[0];
            if (latestAction) {
                return res.redirect(`/dashboard/recovery/actions/${latestAction.id}`);
            }

            // No actions yet — redirect back to sessions list
            return res.redirect('/dashboard/recovery/sessions');

        } catch (error) {
            logger.error({ err: error, sessionId: req.params.id }, '❌ [Recovery] Session detail load failed');
            return res.redirect('/dashboard/recovery/sessions');
        }
    }

    /**
     * GET /dashboard/recovery/clusters
     * Renders the Customer Clustering management page.
     */
    static async clusters(req: Request, res: Response) {
        try {
            const businessId = await RecoveryController.resolveBusinessId(req, res);
            if (!businessId) return res.redirect('/dashboard');

            // Load clusters with customer counts and linked sequences
            const rawClusters = await p.debtCollectionCluster.findMany({
                where: { businessId },
                include: { sequence: true }
            });

            const clusters = await Promise.all(rawClusters.map(async (cl: any) => {
                const customerCount = await p.debtCollectionCustomerProfile.count({
                    where: { clusterId: cl.id }
                });
                return { ...cl, customerCount };
            }));

            // Load all customers with their cluster assignments
            const rawCustomers = await p.debtCollectionCustomer.findMany({
                where: { businessId, isActive: true },
                include: { profile: true }
            });

            const customers = rawCustomers.map((c: any) => {
                const profile = c.profile || {};
                const cluster = clusters.find((cl: any) => cl.id === profile.clusterId);
                return {
                    id: c.id,
                    name: c.name || c.displayName || 'Unknown',
                    email: c.email || '',
                    clusterId: profile.clusterId || null,
                    clusterName: cluster?.name || 'Unassigned',
                    unpaidInvoices: c.unpaidInvoices || profile.unpaidInvoices || 0,
                    lifetimeValue: profile.lifetimeValue || 0,
                    avgDaysToPay: profile.avgDaysToPay || null
                };
            });

            return res.render('dashboard/recovery/clusters', {
                title: 'Customer Clusters | Floovioo',
                clusters,
                customers,
                activeService: 'transactional',
                currentPath: '/dashboard/recovery/clusters',
                nonce: res.locals.nonce,
                breadcrumbs: [
                    { label: 'Dashboard', url: '/dashboard' },
                    { label: 'Smart Recovery', url: '/dashboard/recovery' },
                    { label: 'Clusters', url: '/dashboard/recovery/clusters' }
                ]
            });
        } catch (error) {
            logger.error({ err: error }, '❌ [Recovery] Clusters page load failed');
            return res.status(500).render('error', { message: 'Failed to load clusters' });
        }
    }

    /**
     * POST /dashboard/recovery/clusters/move
     * Manually reassigns a customer to a different cluster.
     */
    static async moveCustomerCluster(req: Request, res: Response) {
        try {
            const businessId = await RecoveryController.resolveBusinessId(req, res);
            if (!businessId) return res.status(401).json({ error: 'Unauthorized' });

            const { customerId, clusterId } = req.body;
            if (!customerId || !clusterId) return res.status(400).json({ error: 'customerId and clusterId are required' });

            // Verify the cluster belongs to this business
            const cluster = await p.debtCollectionCluster.findFirst({
                where: { id: clusterId, businessId }
            });
            if (!cluster) return res.status(404).json({ error: 'Cluster not found' });

            // Update the customer's profile
            const profile = await p.debtCollectionCustomerProfile.findFirst({
                where: { customerId }
            });

            if (profile) {
                await p.debtCollectionCustomerProfile.update({
                    where: { id: profile.id },
                    data: { clusterId }
                });
            } else {
                await p.debtCollectionCustomerProfile.create({
                    data: { customerId, clusterId }
                });
            }

            logger.info({ businessId, customerId, clusterId, clusterName: cluster.name }, '📦 [Recovery] Customer manually moved to cluster');

            return res.json({ success: true, clusterName: cluster.name });
        } catch (error) {
            logger.error({ err: error }, '❌ [Recovery] Move customer to cluster failed');
            return res.status(500).json({ error: 'Failed to move customer' });
        }
    }

    /**
     * GET /dashboard/recovery/webhooks
     * Renders the Webhook Event Log page with state history and audit logs.
     */
    static async webhookLog(req: Request, res: Response) {
        try {
            const businessId = await RecoveryController.resolveBusinessId(req, res);
            if (!businessId) return res.redirect('/dashboard');

            const typeFilter = req.query.type as string || '';

            // Load audit logs (these capture webhook intercepts and status changes)
            const auditLogs = await p.debtCollectionAuditLog.findMany({
                where: {
                    session: { businessId },
                    ...(typeFilter ? { reason: { contains: typeFilter } } : {})
                },
                include: { session: { select: { id: true, externalInvoiceId: true, customerName: true } } },
                orderBy: { timestamp: 'desc' },
                take: 100
            });

            // Load dispatched webhook actions (outbound to n8n)
            const dispatchedActions = await p.debtCollectionAction.findMany({
                where: {
                    businessId,
                    status: { in: ['dispatched', 'sent'] },
                    ...(typeFilter === 'dispatch' ? {} : {})
                },
                orderBy: { createdAt: 'desc' },
                take: 50
            });

            // Combine into a unified event feed
            const events: any[] = [];

            for (const log of auditLogs) {
                events.push({
                    id: log.id,
                    createdAt: log.timestamp,
                    provider: 'system',
                    eventType: log.event,
                    entityId: log.session?.externalInvoiceId || '—',
                    status: 'processed',
                    reason: log.reason || '',
                    triggerSource: log.actorType || 'SYSTEM',
                    sessionId: log.sessionId,
                    metadata: { actorType: log.actorType, event: log.event, reason: log.reason }
                });
            }

            for (const action of dispatchedActions) {
                events.push({
                    id: action.id,
                    createdAt: action.createdAt,
                    provider: 'n8n',
                    eventType: `dispatch:${action.actionType}`,
                    entityId: action.invoiceId || '—',
                    status: action.status,
                    reason: `Step ${(action as any).sessionStep || '—'}`,
                    triggerSource: 'RECOVERY_ENGINE',
                    sessionId: action.sessionId,
                    metadata: action.metadata || {}
                });
            }

            // Sort combined events by time descending
            events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

            // Compute stats
            const stats = {
                intercepted: auditLogs.filter(log => log.actorType === 'ERP_WEBHOOK' || log.event === 'PAYMENT_RECEIVED').length,
                dispatched: dispatchedActions.length
            };

            return res.render('dashboard/recovery/webhooks', {
                title: 'Event Log | Floovioo',
                events,
                stats,
                activeService: 'transactional',
                currentPath: '/dashboard/recovery/webhooks',
                nonce: res.locals.nonce,
                breadcrumbs: [
                    { label: 'Dashboard', url: '/dashboard' },
                    { label: 'Smart Recovery', url: '/dashboard/recovery' },
                    { label: 'Event Log', url: '/dashboard/recovery/webhooks' }
                ]
            });
        } catch (error) {
            logger.error({ err: error }, '❌ [Recovery] Webhook log page load failed');
            return res.status(500).render('error', { message: 'Failed to load event log' });
        }
    }
}

