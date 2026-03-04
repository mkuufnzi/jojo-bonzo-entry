import prisma from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { RecoveryEventTypes } from '../../domain-events';
import { RecoveryActionRequest, RecoveryStatus } from './recovery.types';
import { notificationService } from '../../services/notification.service';
import { SecurityUtils } from './security.utils';

const p = prisma as any;

export class RecoveryService {
    static readonly DEFAULT_STEPS = [
        { day: 1, action: 'email', templateId: 'reminder_gentle' },
        { day: 7, action: 'email', templateId: 'reminder_firm' },
        { day: 14, action: 'email', templateId: 'reminder_final' }
    ];

    /**
     * Boot-time Health Check
     * Validates that the Debt-Collection service is fully operational:
     * 1. DB service record exists with correct slug
     * 2. Webhook URL is configured in the service config
     * 3. Reports active DebtCollectionSequence count for observability
     */
    static async healthCheck(): Promise<{ ready: boolean; webhookUrl: string | null; activeSequences: number; issues: string[] }> {
        const issues: string[] = [];
        let webhookUrl: string | null = null;
        let activeSequences = 0;

        // 1. Check DB service record
        const service = await p.service.findUnique({
            where: { slug: 'floovioo_transactional_debt-collection' }
        });

        if (!service) {
            issues.push('DB service record missing for floovioo_transactional_debt-collection');
        } else if (!service.isActive) {
            issues.push('Debt-Collection service exists but is marked inactive in DB');
        }

        // 2. Check webhook URL configuration
        const config = (service?.config as any) || {};
        webhookUrl = config?.webhooks?.recovery_action?.url || null;
        if (!webhookUrl) {
            issues.push('No webhook URL configured for recovery_action');
        }

        // 3. Count active dunning sequences
        try {
            activeSequences = await p.debtCollectionSequence.count({ where: { isActive: true } });
        } catch {
            // Table may not exist yet during first migration
            issues.push('DebtCollectionSequence table not accessible');
        }

        return {
            ready: issues.length === 0,
            webhookUrl,
            activeSequences,
            issues
        };
    }

    /**
     * Sync Overdue Invoices from provider.
     * Called by the recovery worker or manually via the controller.
     * @param manualInvoices Optional array of invoices to process (skips QBO fetch) - for testing/manual triggers
     */
    async syncOverdueInvoices(businessId: string, manualInvoices?: any[]) {
        logger.info({ businessId, manualMode: !!manualInvoices }, '🔍 [Recovery] Starting Overdue Invoice Sync (V2)');

        try {
            let overdueInvoices = manualInvoices || [];
            let reconciledCount = 0;
            if (!manualInvoices) {
                // 1. Verify Integration Exists
                const integration = await p.integration.findFirst({
                    where: { businessId, provider: 'quickbooks', status: 'connected' }
                });

                if (!integration) {
                    logger.warn({ businessId }, '⚠️ [Recovery] No active QuickBooks integration found');
                    await notificationService.notifyBusiness(
                        businessId,
                        'warning',
                        'Sync Skipped',
                        'No active ERP integration found. Please connect your accounting software to enable Debt Collection.',
                        'syncEvent',
                        '/dashboard/integrations'
                    );
                    return { success: false, reason: 'no_integration' };
                }

                // 2. Initialize Provider
                const { QBOProvider } = await import('../../services/integrations/providers/quickbooks.provider');
                const provider = new QBOProvider();
                await provider.initialize(integration);

                // --- CACHE SYNC: Map ERP to Local DB before evaluation ---
                const syncCount = await provider.syncInvoices(businessId);
                console.log(`[Recovery Sync] Business ${businessId}: Cached ${syncCount} invoices to local DB.`);
                // ==========================================
                // MICROSERVICE: ISOLATED DEBT COLLECTION INGESTION
                // ==========================================
                console.log(`[Debt Collection Sync] Ingesting & Profiling Data...`);
                const allUnpaidInvoicesData = await provider.getAllUnpaidInvoices();
                const allUnpaidIds = new Set(allUnpaidInvoicesData.map((inv: any) => inv.externalId));

                const customerMap = new Map<string, any>();
                for (const inv of allUnpaidInvoicesData) {
                    const cid = inv.rawData?.CustomerRef?.value;
                    const cName = inv.rawData?.CustomerRef?.name || 'Unknown';
                    if (cid && !customerMap.has(cid)) {
                        customerMap.set(cid, { 
                            id: cid, name: cName, email: null, phone: null,
                            lifetimeValue: 0, totalInvoices: 0, unpaidInvoices: 0, invoices: []
                        });
                    }
                    if (cid) {
                        const c = customerMap.get(cid)!;
                        c.unpaidInvoices++;
                        c.invoices.push(inv);
                    }
                }

                const customerIdsArray = Array.from(customerMap.keys());
                if (customerIdsArray.length > 0) {
                    try {
                        console.log(`[Debt Collection Sync] Pre-fetching entire Customer ledger to avoid N+1...`);
                        const allCustomers = await provider.getAllCustomers();
                        const customerDataMap = new Map(allCustomers.map((c: any) => [c.Id, c]));

                        for (const [cid, profile] of customerMap.entries()) {
                            const c = customerDataMap.get(cid);
                            if (c) {
                                profile.email = c.PrimaryEmailAddr?.Address;
                                profile.phone = c.PrimaryPhone?.FreeFormNumber;
                                profile.lifetimeValue = parseFloat(c.Balance || '0'); 
                                profile.metadata = c;
                                profile.isActive = c.Active !== false;
                                profile.riskScore = profile.unpaidInvoices > 3 ? 'High' : (profile.unpaidInvoices > 1 ? 'Medium' : 'Low');
                            }
                        }
                    } catch (err) {
                        console.error(`[Debt Collection Sync] Customer bulk ledger fetch failed:`, err);
                    }

                    for (const [cid, profile] of customerMap.entries()) {
                        const dbCustomer = await p.debtCollectionCustomer.upsert({
                            where: { businessId_externalId: { businessId, externalId: cid } },
                            update: {
                                name: profile.name, email: profile.email, phone: profile.phone,
                                unpaidInvoices: profile.unpaidInvoices, riskScore: profile.riskScore,
                                isActive: profile.isActive ?? true,
                                metadata: profile.metadata, updatedAt: new Date()
                            },
                            create: {
                                businessId, externalId: cid, name: profile.name, email: profile.email,
                                phone: profile.phone, unpaidInvoices: profile.unpaidInvoices,
                                riskScore: profile.riskScore || 'Low', 
                                isActive: profile.isActive ?? true, 
                                metadata: profile.metadata,
                            }
                        });

                        // --- PHASE 5: ENTERPRISE ENRICHMENT ---
                        const existingProfile: any = await p.debtCollectionCustomerProfile.findUnique({
                            where: { debtCustomerId: dbCustomer.id }
                        });

                        const isStale = !existingProfile || 
                            (existingProfile.lastEnrichedAt && 
                             (Date.now() - new Date(existingProfile.lastEnrichedAt).getTime() > 24 * 60 * 60 * 1000));

                        if (isStale) {
                            await RecoveryService.enrichCustomerProfile(businessId, cid, dbCustomer.id, provider);
                        }

                        for (const inv of profile.invoices) {
                            await p.debtCollectionInvoice.upsert({
                                where: { businessId_externalId: { businessId, externalId: inv.externalId } },
                                update: {
                                    amount: parseFloat(inv.rawData.TotalAmt || '0'),
                                    balance: parseFloat(inv.rawData.Balance || '0'),
                                    status: 'Open', dueDate: inv.dueDate, issuedDate: inv.date,
                                    metadata: inv.rawData, updatedAt: new Date()
                                },
                                create: {
                                    businessId, customerId: dbCustomer.id, externalId: inv.externalId,
                                    invoiceNumber: inv.externalId, amount: parseFloat(inv.rawData.TotalAmt || '0'),
                                    balance: parseFloat(inv.rawData.Balance || '0'),
                                    status: 'Open', dueDate: inv.dueDate, issuedDate: inv.date, metadata: inv.rawData
                                }
                            });
                        }
                    }
                }
                // ==========================================

                // Derive default settings
                const activeSequences = await p.debtCollectionSequence.findMany({
                    where: { businessId, isActive: true }
                });
                const defaultSeq = activeSequences.find((s:any) => s.isDefault) || activeSequences[0];
                const gracePeriod = (defaultSeq?.settings as any)?.gracePeriod || 0;

                overdueInvoices = await provider.getOverdueInvoices(gracePeriod);
                console.log(`[Recovery Sync] Business ${businessId}: ${overdueInvoices.length} overdue invoices from ERP`);
                
                // ── RECONCILIATION: Auto-close sessions and update locally stored invoices for PAID records ──
                // Previously, this only checked invoices with active sessions. We MUST check ALL locally tracked 
                // unpaid invoices because if they get paid before becoming overdue, they disappear from QBO's unpaid list
                // and become orphaned in our normalized tables, artificially inflating Total Outstanding.
                const localUnpaidInvoices = await p.debtCollectionInvoice.findMany({
                    where: { businessId, balance: { gt: 0 } },
                    select: { externalId: true }
                });
                
                const localUnpaidIds = localUnpaidInvoices.map((inv: any) => inv.externalId);
                
                // Fetch active sessions so we can mark them as RECOVERED if their invoice was paid
                const allActiveSessions = await p.debtCollectionSession.findMany({
                    where: { businessId, status: { in: ['ACTIVE', 'PAUSED', 'EXHAUSTED'] } }
                });
                const activeInvoiceIds = allActiveSessions.map((s: any) => s.externalInvoiceId);

                // Ghost Defeater & Void Handler: Explicitly trace missing unpaid invoices
                const missingIds = localUnpaidIds.filter(id => !allUnpaidIds.has(id));
                for (const missingId of missingIds) {
                    try {
                        const invData = await provider.fetchRaw(`/query?query=select * from Invoice where DocNumber = '${missingId}'`);
                        const qboInv = invData.QueryResponse?.Invoice?.[0];
                        if (qboInv) {
                            const balance = parseFloat(qboInv.Balance || '0');
                            const totalAmt = parseFloat(qboInv.TotalAmt || '0');
                            if (balance <= 0) {
                                // ── PAID INVOICE: balance=0 but totalAmt > 0 means customer paid ──
                                const isPaid = totalAmt > 0;
                                await p.debtCollectionInvoice.updateMany({
                                    where: { businessId, externalId: missingId },
                                    data: { 
                                        balance: 0, 
                                        ...(totalAmt > 0 ? { amount: totalAmt } : {}),
                                        status: isPaid ? 'Paid' : 'Voided', 
                                        updatedAt: new Date() 
                                    }
                                });

                                // Mark session as RECOVERED (paid) instead of TERMINATED
                                if (isPaid) {
                                    const sessionsToRecover = await p.debtCollectionSession.findMany({
                                        where: { businessId, externalInvoiceId: missingId, status: { in: ['ACTIVE', 'PAUSED', 'EXHAUSTED'] } },
                                        select: { id: true, status: true }
                                    });

                                    if (sessionsToRecover.length > 0) {
                                        const recoverIds = sessionsToRecover.map(s => s.id);
                                        await p.debtCollectionSession.updateMany({
                                            where: { id: { in: recoverIds } },
                                            data: { status: 'RECOVERED', updatedAt: new Date() }
                                        });

                                        await p.debtCollectionStateHistory.createMany({
                                            data: sessionsToRecover.map(s => ({
                                                sessionId: s.id,
                                                previousStatus: s.status,
                                                newStatus: 'RECOVERED',
                                                reason: `Invoice paid in ERP (Balance: $0, Total: $${totalAmt})`,
                                                triggerSource: 'ERP_SYNC'
                                            }))
                                        });

                                        reconciledCount += recoverIds.length;
                                        console.log(`[Recovery Sync] ✅ Recovered ${recoverIds.length} session(s) for paid invoice ${missingId} ($${totalAmt})`);
                                    }
                                }
                            }
                        } else {
                        // Invoice vanished from ERP completely (Voided / Deleted)
                        await p.debtCollectionInvoice.updateMany({
                            where: { businessId, externalId: missingId },
                            data: { amount: 0, balance: 0, status: 'Voided', updatedAt: new Date() }
                        });

                        const sessionsToTerminate = await p.debtCollectionSession.findMany({
                            where: { businessId, externalInvoiceId: missingId, status: { in: ['ACTIVE', 'PAUSED', 'EXHAUSTED'] } },
                            select: { id: true, status: true }
                        });

                        if (sessionsToTerminate.length > 0) {
                            await p.debtCollectionSession.updateMany({
                                where: { businessId, externalInvoiceId: missingId, status: { in: ['ACTIVE', 'PAUSED', 'EXHAUSTED'] } },
                                data: { status: 'TERMINATED', metadata: { reason: 'Voided in ERP' }, updatedAt: new Date() }
                            });

                            await p.debtCollectionStateHistory.createMany({
                                data: sessionsToTerminate.map(s => ({
                                    sessionId: s.id,
                                    previousStatus: s.status,
                                    newStatus: 'TERMINATED',
                                    reason: 'Voided in ERP',
                                    triggerSource: 'ERP_SYNC'
                                }))
                            });
                        }
                    }
                } catch (e) {
                         console.error(`[Recovery Sync] Failed to verify missing invoice ${missingId}`, e);
                    }
                }

                // Reconcile natively using ONLY the standalone microservice DebtCollection pipeline
                // Case-insensitive: QB returns 'Paid', handleErpEvent writes 'PAID'
                const cachedDocs = await p.debtCollectionInvoice.findMany({
                    where: { businessId, externalId: { in: activeInvoiceIds }, status: { in: ['Paid', 'PAID', 'paid'] } }
                });
                
                const resolvedIds: string[] = [];
                for (const session of allActiveSessions) {
                    const isPaid = cachedDocs.find((d: any) => d.externalId === session.externalInvoiceId && d.balance <= 0);
                    if (isPaid) {
                        resolvedIds.push(session.id);
                    }
                }

                if (resolvedIds.length > 0) {
                    await p.debtCollectionSession.updateMany({
                        where: { id: { in: resolvedIds } },
                        data: { status: 'RECOVERED', updatedAt: new Date() }
                    });

                    await p.debtCollectionStateHistory.createMany({
                        data: resolvedIds.map(id => ({
                            sessionId: id,
                            previousStatus: 'ACTIVE',
                            newStatus: 'RECOVERED',
                            reason: 'Balance <= 0',
                            triggerSource: 'ERP_SYNC'
                        }))
                    });

                    reconciledCount = resolvedIds.length;
                    console.log(`[Recovery Sync] ✅ Auto-closed ${reconciledCount} session(s) — truly verified as PAID via local cache.`);
                }

                // ── DATA HEALER: Restore amounts for RECOVERED sessions corrupted by old void handler ──
                let healedCount = 0;
                const corruptedSessions = await p.debtCollectionSession.findMany({
                    where: { businessId, status: 'RECOVERED' },
                    select: { id: true, externalInvoiceId: true }
                });
                
                if (corruptedSessions.length > 0) {
                    const corruptedInvoiceIds = corruptedSessions.map((s: any) => s.externalInvoiceId);
                    const zeroAmountInvoices = await p.debtCollectionInvoice.findMany({
                        where: { businessId, externalId: { in: corruptedInvoiceIds }, amount: 0 },
                        select: { externalId: true }
                    });

                    if (zeroAmountInvoices.length > 0) {
                        const healIds = zeroAmountInvoices.map(d => d.externalId);
                        for (const healId of healIds) {
                            try {
                                const invData = await provider.fetchRaw(`/query?query=select * from Invoice where DocNumber = '${healId}'`);
                                const qboInv = invData.QueryResponse?.Invoice?.[0];
                                if (qboInv) {
                                    const totalAmt = parseFloat(qboInv.TotalAmt || '0');
                                    if (totalAmt > 0) {
                                        await p.debtCollectionInvoice.updateMany({
                                            where: { businessId, externalId: healId },
                                            data: { amount: totalAmt, updatedAt: new Date() }
                                        });

                                        const sessToUpdate = corruptedSessions.find((s:any) => s.externalInvoiceId === healId);
                                        if (sessToUpdate) {
                                            const existingSess = await p.debtCollectionSession.findUnique({ where: { id: sessToUpdate.id } });
                                            if (existingSess) {
                                                await p.debtCollectionSession.update({
                                                    where: { id: sessToUpdate.id },
                                                    data: { metadata: { ...(existingSess.metadata as object || {}), amount: totalAmt } }
                                                });
                                            }
                                        }
                                        healedCount++;
                                    }
                                }
                            } catch (e) {
                                console.error(`[Recovery Sync] Failed to heal invoice ${healId}`, e);
                            }
                        }
                        if (healedCount > 0) {
                            console.log(`[Recovery Sync] 🩹 Healed ${healedCount} invoice(s) amount from QBO for corrupted recovered sessions.`);
                        }
                    }
                }

                // ── REVERSAL DETECTION (NSF): Auto-reopen sessions for bounced invoices ──
                // Find sessions marked RECOVERED but whose underlying invoice balance has bounded back > 0
                const recoveredSessions = await p.debtCollectionSession.findMany({
                    where: { businessId, status: 'RECOVERED' },
                    select: { id: true, externalInvoiceId: true }
                });

                if (recoveredSessions.length > 0) {
                    const recoveredInvoiceIds = recoveredSessions.map((s: any) => s.externalInvoiceId);
                    const bouncedDocs = await p.debtCollectionInvoice.findMany({
                        where: { businessId, externalId: { in: recoveredInvoiceIds }, balance: { gt: 0 } },
                        select: { externalId: true }
                    });

                    const bouncedIds = bouncedDocs.map(d => d.externalId);
                    
                    if (bouncedIds.length > 0) {
                        const sessionsToReopen = recoveredSessions.filter(s => bouncedIds.includes(s.externalInvoiceId));
                        const reopenIds = sessionsToReopen.map(s => s.id);
                        
                        await p.debtCollectionSession.updateMany({
                            where: { id: { in: reopenIds } },
                            data: { 
                                status: 'ACTIVE', 
                                metadata: { reason: 'Payment Reversed (NSF)' },
                                updatedAt: new Date()
                            }
                        });

                        await p.debtCollectionStateHistory.createMany({
                            data: reopenIds.map(id => ({
                                sessionId: id,
                                previousStatus: 'RECOVERED',
                                newStatus: 'ACTIVE',
                                reason: 'Payment Reversed (NSF)',
                                triggerSource: 'NSF_REVERSAL'
                            }))
                        });

                        console.log(`[Recovery Sync] ⚠️ Re-opened ${reopenIds.length} session(s) due to Payment Reversal (NSF).`);
                        
                        try {
                            await notificationService.notifyBusiness(
                                businessId,
                                'error',
                                'Payment Reversed (NSF)',
                                `${reopenIds.length} previously recovered invoice(s) have bounced. Debt collection has automatically resumed.`,
                                'recoveryAlert',
                                '/dashboard/recovery'
                            );
                        } catch(e) { 
                            console.error('[Recovery Sync] Could not dispatch NSF notification', e);
                        }
                    }
                }

                // ── CUSTOMER SUSPENSION DETECTION: Pause sessions for deactivated ERP customers ──
                const inactiveCustomers = await p.debtCollectionCustomer.findMany({
                    where: { businessId, isActive: false },
                    select: { externalId: true, name: true }
                });

                if (inactiveCustomers.length > 0) {
                    const inactiveIds = inactiveCustomers.map(c => c.externalId);
                    const sessionsToPause = await p.debtCollectionSession.findMany({
                        where: { businessId, status: 'ACTIVE', customerId: { in: inactiveIds } },
                        select: { id: true }
                    });

                    if (sessionsToPause.length > 0) {
                        const pauseIds = sessionsToPause.map(s => s.id);
                        await p.debtCollectionSession.updateMany({
                            where: { id: { in: pauseIds } },
                            data: {
                                status: 'PAUSED',
                                metadata: { reason: 'Customer deactivated in ERP' },
                                updatedAt: new Date()
                            }
                        });

                        await p.debtCollectionStateHistory.createMany({
                            data: pauseIds.map(id => ({
                                sessionId: id,
                                previousStatus: 'ACTIVE',
                                newStatus: 'PAUSED',
                                reason: 'Customer deactivated in ERP',
                                triggerSource: 'ERP_SYNC'
                            }))
                        });

                        console.log(`[Recovery Sync] ⏸️ Paused ${pauseIds.length} session(s) because their associated customer was marked Inactive in the ERP.`);
                    }
                }
            }

            if (overdueInvoices.length === 0) {
                console.log(`[Recovery Sync] No new overdue invoices. Reconciliation only.`);
                return { success: true, synced: 0, reconciled: reconciledCount, message: 'Reconciliation complete' };
            }

            // Fetch all active sequences (reuse if already fetched in QBO branch)
            const activeSequencesForRules = await p.debtCollectionSequence.findMany({
                where: { businessId, isActive: true }
            });

            // 3. Resolve customer emails securely from DB cache (populated by the bulk ledger pre-fetch earlier)
            const customerEmailMap = new Map<string, string>();
            const uniqueCustomerIds = [...new Set(
                overdueInvoices.map((inv: any) => inv.rawData?.CustomerRef?.value).filter(Boolean)
            )];
            
            if (!manualInvoices) {
                if (uniqueCustomerIds.length > 0) {
                     // The ingestion block at the top of syncOverdueInvoices already bulk-upserted these customers!
                     // Pull the accurate emails directly from local DB to fully eradicate N+1 provider lookups.
                     const dbCustomers = await p.debtCollectionCustomer.findMany({
                         where: { businessId, externalId: { in: uniqueCustomerIds as string[] } }
                     });
                     
                     for (const c of dbCustomers) {
                         if (c.email) customerEmailMap.set(c.externalId, c.email);
                     }
                }
            } else {
                 overdueInvoices.forEach((inv: any) => {
                     const custId = inv.rawData?.CustomerRef?.value;
                     if (custId && !customerEmailMap.has(custId)) {
                         customerEmailMap.set(custId, 'N/A');
                     }
                 });
            }

            // 3.1 Resolving from Contact Table (DB Fallback)
            const remainingCustIds = [...new Set(
                overdueInvoices.map((inv: any) => inv.rawData?.CustomerRef?.value)
                    .filter((id: string) => !customerEmailMap.get(id) || customerEmailMap.get(id) === 'N/A')
            )];

            if (remainingCustIds.length > 0) {
                const contacts = await p.contact.findMany({
                    where: { 
                        businessId,
                        source: 'quickbooks',
                        externalId: { in: remainingCustIds }
                    },
                    select: { externalId: true, email: true }
                });

                for (const contact of contacts) {
                    if (contact.email) {
                        customerEmailMap.set(contact.externalId, contact.email);
                    }
                }
            }

            logger.info({ businessId, customersResolved: customerEmailMap.size, total: uniqueCustomerIds.length },
                '📧 [Recovery] Customer emails resolved');

            // 4. For each overdue invoice, find/create an ACTIVE session
            let newSessionsCreated = 0;

            for (const invoice of overdueInvoices) {
                // Dedup guard: Check for existing session in ANY status
                const existingSession = await p.debtCollectionSession.findFirst({
                    where: {
                        businessId,
                        externalInvoiceId: invoice.externalId
                    }
                });

                if (existingSession) {
                    logger.debug({ invoiceId: invoice.externalId, status: existingSession.status }, '⏭️ [Recovery] Session already exists, skipping');
                    continue;
                }

                // New Session Logic: Assign Sequence via Rules
                const sequence = await this.findApplicableSequence(businessId, invoice, activeSequencesForRules);
                if (!sequence) {
                    logger.warn({ invoiceId: invoice.externalId }, '⚠️ [Recovery] No applicable sequence found for invoice');
                    continue;
                }

                // Extract customer context from raw QBO data
                const custRef = (invoice as any).rawData?.CustomerRef;
                const customerId = custRef?.value || null;
                const customerEmail = customerId ? customerEmailMap.get(customerId) || null : null;

                await p.debtCollectionSession.create({
                    data: {
                        businessId,
                        sequenceId: sequence.id,
                        externalInvoiceId: invoice.externalId,
                        customerId,
                        customerName: invoice.contactName || custRef?.name || null,
                        status: 'ACTIVE',
                        currentStepIndex: 0,
                        metadata: {
                            amount: invoice.total,
                            contactName: invoice.contactName,
                            customerEmail,
                            customerId,
                            currency: 'USD',
                            dueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString() : new Date().toISOString()
                        },
                        updatedAt: new Date(),
                        nextActionAt: this.calculateNextActionDate(sequence.steps, 0, invoice.dueDate ? new Date(invoice.dueDate) : new Date())
                    }
                });

                newSessionsCreated++;
            }

            console.log(`[Recovery Sync] ✅ Sync complete: ${newSessionsCreated} new session(s), ${reconciledCount} reconciled`);

            if (newSessionsCreated > 0 || reconciledCount > 0) {
                await notificationService.notifyBusiness(
                    businessId,
                    'info',
                    'Daily Sync Complete',
                    `Sync found ${newSessionsCreated} new overdue invoices and automatically closed ${reconciledCount} paid invoices.`,
                    'syncEvent',
                    '/dashboard/recovery'
                );
            }

            // --- PHASE 5: Broadcast Data Sync Event to CRM Webhook ---
            try {
                const { workflowService } = await import('../../services/workflow.service');
                const syncPayload = {
                    businessId,
                    normalizedEventType: 'DATA_SYNC_COMPLETE',
                    syncedCustomers: uniqueCustomerIds?.length || 0,
                    reconciledInvoices: reconciledCount,
                    newSessions: newSessionsCreated,
                    timestamp: new Date().toISOString()
                };
                
                await workflowService.executeAction(
                    `data-sync-${businessId}-${Date.now()}`,
                    { type: 'data_sync' },
                    syncPayload,
                    'system',
                    businessId
                );
                console.log(`[Recovery Sync] 📡 Broadcast DATA_SYNC_COMPLETE webhook to CRM.`);
            } catch (whErr: any) {
                console.error(`[Recovery Sync] ⚠️ Failed to dispatch CRM webhook:`, whErr.message);
            }

            return { success: true, synced: newSessionsCreated, reconciled: reconciledCount, total: overdueInvoices.length };

        } catch (error: any) {
            logger.error({ err: error, businessId }, '❌ [Recovery] Sync failed');
            await notificationService.notifyBusiness(
                businessId,
                'error',
                'Data Sync Failed',
                `We encountered an error syncing your overdue invoices: ${error.message || 'Unknown error'}. Please try again later.`,
                'syncEvent',
                '/dashboard/recovery'
            );
            throw error;
        }
    }

    public async findApplicableSequence(businessId: string, invoice: any, cachedSequences?: any[]): Promise<any> {
        const sequences = cachedSequences || await p.debtCollectionSequence.findMany({
            where: { businessId, isActive: true },
            include: { cluster: true }
        });

        if (sequences.length === 0) return null;

        // 1. Cluster-based Mapping (High Priority)
        const customer = await p.debtCollectionCustomer.findFirst({
            where: { businessId, externalId: invoice.customerExternalId || invoice.customerId },
            include: { profile: { include: { cluster: true } } }
        });

        if (customer?.profile?.cluster?.sequenceId) {
            const clusterSeq = sequences.find(s => s.id === customer.profile!.cluster!.sequenceId);
            if (clusterSeq) return clusterSeq;
        }

        // 2. Rule-based Mapping
        for (const seq of sequences) {
            const rules = seq.rules as any;
            if (!rules) continue;

            // Amount Rules
            if (rules.minAmount && invoice.total < rules.minAmount) continue;
            if (rules.maxAmount && invoice.total > rules.maxAmount) continue;

            // Tag Rules (If we have customer data context)
            if (rules.riskScore && customer?.profile?.riskScore !== rules.riskScore) continue;

            return seq; // First match wins
        }

        // 3. Fallback: Default sequence
        return sequences.find(s => s.isDefault) || sequences[0];
    }

    /**
     * ENTIRE DEEP ENRICHMENT LOGIC (Phase 5)
     * Fetches LTV, credit limits, and purchase history from ERP.
     */
    static async enrichCustomerProfile(businessId: string, customerExternalId: string, debtCustomerId: string, provider: any) {
        try {
            console.log(`[Recovery Enrichment] Deep-profiling customer: ${customerExternalId} (${debtCustomerId})`);
            
            // 1. Fetch Full Customer Metadata (includes Credit Limit)
            const qboCustomer = await provider.getEntity('customer', customerExternalId);
            if (!qboCustomer) return;

            // 2. Fetch Historical Stats (LTV/Total Purchases)
            const query = `SELECT * FROM Invoice WHERE CustomerRef = '${customerExternalId}' MAXRESULTS 1000`;
            const invoicesData = await provider.fetchRaw(`/query?query=${encodeURIComponent(query)}`);
            const allInvoices = invoicesData.QueryResponse?.Invoice || [];

            const totalPurchases = allInvoices.length;
            const lifetimeValue = allInvoices.reduce((sum: number, inv: any) => sum + parseFloat(inv.TotalAmt || 0), 0);
            
            // 3. Upsert Profile
            const profile = await p.debtCollectionCustomerProfile.upsert({
                where: { debtCustomerId },
                create: {
                    businessId,
                    debtCustomerId,
                    lifetimeValue,
                    totalPurchases,
                    creditLimit: qboCustomer.CreditLimit || 0,
                    riskScore: 'LOW',
                    lastEnrichedAt: new Date()
                },
                update: {
                    lifetimeValue,
                    totalPurchases,
                    creditLimit: qboCustomer.CreditLimit || 0,
                    lastEnrichedAt: new Date()
                }
            });

            // 4. Run Classification
            await RecoveryService.classifyCustomerCluster(businessId, profile.id);

        } catch (err) {
            console.error(`[Recovery Enrichment] Failed for ${customerExternalId}:`, err);
        }
    }

    /**
     * DYNAMIC CLASSIFICATION LOGIC (Phase 5)
     * Maps a profile to a cluster based on business rules.
     */
    static async classifyCustomerCluster(businessId: string, profileId: string) {
        const profile = await p.debtCollectionCustomerProfile.findUnique({
            where: { id: profileId },
            include: { customer: true }
        });
        if (!profile) return;

        const clusters = await p.debtCollectionCluster.findMany({ where: { businessId } });
        if (clusters.length === 0) return;

        let matchedClusterId: string | null = null;

        for (const cluster of clusters) {
            const rules = cluster.ruleLogic as any;
            let match = true;

            if (rules.ltvMin && profile.lifetimeValue < rules.ltvMin) match = false;
            if (rules.purchasesMin && profile.totalPurchases < rules.purchasesMin) match = false;
            
            if (match) {
                matchedClusterId = cluster.id;
                break; // Use the first matching cluster (priority by creation order or manual weight)
            }
        }

        if (matchedClusterId !== profile.clusterId) {
            await p.debtCollectionCustomerProfile.update({
                where: { id: profileId },
                data: { clusterId: matchedClusterId }
            });
            console.log(`[Recovery Cluster] Customer ${profile.customer.name} moved to cluster: ${matchedClusterId || 'NONE'}`);
        }
    }

    /**
     * Process Dunning Logic for a specific invoice.
     * 
     * STATE MACHINE: ACTIVE session → identify step → create action → dispatch → advance step
     * 
     * CONCURRENCY GUARDS:
     * 1. Idempotency key on DebtCollectionAction prevents duplicate actions from BullMQ retries
     * 2. Optimistic lock on session.currentStepIndex prevents concurrent step advancement
     * 
     * @param request - Contains businessId, externalInvoiceId, customerEmail, amount, currency, dueDate
     * @returns {success, actionId, session} on success, {success: false, reason} on skip/failure
     */
    async processRecovery(request: RecoveryActionRequest) {
        const { businessId, externalInvoiceId, customerEmail, amount, currency, dueDate } = request;

        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`[Recovery E2E] ▶ Processing invoice: ${externalInvoiceId} for business: ${businessId}`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        try {
            // ── Step 1: Fetch the ACTIVE session for this invoice ──
            const session = await p.debtCollectionSession.findFirst({
                where: { businessId, externalInvoiceId, status: 'ACTIVE' },
                include: { sequence: true }
            });

            if (!session) {
                console.log(`[Recovery E2E] ⏭️ No active session found. Skipping.`);
                return { success: false, reason: 'no_session' };
            }

            const sequence = session.sequence;
            const currentStepIdx = session.currentStepIndex;
            const steps = sequence.steps as any[];

            console.log(`[Recovery E2E] Step 1/5: Session ${session.id} | Step ${currentStepIdx + 1}/${steps?.length || 0} | Sequence: ${sequence.name || sequence.id}`);

            if (!Array.isArray(steps) || currentStepIdx >= steps.length) {
                console.log(`[Recovery E2E] ⏭️ All steps exhausted. Transitioning session to EXHAUSTED.`);
                await p.debtCollectionSession.update({
                    where: { id: (session as any).id },
                    data: { status: 'EXHAUSTED' }
                });
                
                await p.debtCollectionStateHistory.create({
                    data: {
                        sessionId: (session as any).id,
                        previousStatus: (session as any).status || 'ACTIVE',
                        newStatus: 'EXHAUSTED',
                        reason: 'All dunning steps completed',
                        triggerSource: 'SYSTEM'
                    }
                });
                
                return { success: false, reason: 'steps_exhausted' };
            }

            const currentStep = steps[currentStepIdx];

            // ── Step 2: Idempotency Guard ──
            // Prevents duplicate DebtCollectionActions if BullMQ retries this job.
            // Key: sessionId + stepIndex + date → one action per step per day
            const today = new Date().toISOString().split('T')[0];
            const idempotencyKey = `${session.id}_step${currentStepIdx}_${today}`;

            const existingAction = await p.debtCollectionAction.findFirst({
                where: {
                    sessionId: session.id,
                    externalInvoiceId,
                    actionType: currentStep.action || 'email',
                    createdAt: { gte: new Date(`${today}T00:00:00Z`) } // Same-day guard
                }
            });

            if (existingAction) {
                console.log(`[Recovery E2E] ⚠️ Idempotent skip: Action ${existingAction.id} already exists for step ${currentStepIdx} today.`);
                return { success: true, actionId: existingAction.id, session: session.id, idempotent: true };
            }

            // ── Step 3: Create the dunning action record ──
            console.log(`[Recovery E2E] Step 2/5: Creating DebtCollectionAction (type: ${currentStep.action || 'email'})`);

            const action = await p.debtCollectionAction.create({
                data: {
                    businessId,
                    sessionId: session.id,
                    externalInvoiceId,
                    actionType: currentStep.action || 'email',
                    status: 'queued',
                    aiGeneratedCopy: null
                }
            });

            console.log(`[Recovery E2E] Step 3/5: DebtCollectionAction created: ${action.id}`);

            logger.info({
                businessId,
                session: session.id,
                actionId: action.id,
                step: currentStepIdx + 1,
                actionType: currentStep.action
            }, '🔄 [Recovery E2E] Step 2: Dunning action created in database');

            // 3. Dispatch to Branding Pipeline / Email Service
            // We now support "Native" execution for simple emails to avoid n8n dependency for basic recovery
            
            // Step 2.5: Inject Enriched Profile & Cluster (Phase 5)
            const enrichedProfile = await p.debtCollectionCustomerProfile.findUnique({
                where: { debtCustomerId: session.customerId },
                include: { cluster: true }
            });

            // Prepare Variable Context & Inject
            const contextData = {
                customerName: (session.metadata as any)?.customerName || 'Valued Customer',
                contactName: (session.metadata as any)?.contactName || 'Valued Customer',
                invoiceNumber: externalInvoiceId,
                amount: `${currency} ${amount}`,
                dueDate: dueDate && !isNaN(new Date(dueDate).getTime()) ? new Date(dueDate).toLocaleDateString() : 'N/A',
                invoiceLink: `${process.env.APP_URL || ''}/public/invoice/${externalInvoiceId}`,
                companyName: (session.metadata as any)?.companyName || 'Us',
                // Enriched Analytics (Phase 5)
                ltv: enrichedProfile?.lifetimeValue || 0,
                totalPurchases: enrichedProfile?.totalPurchases || 0,
                riskScore: enrichedProfile?.riskScore || 'Low',
                cluster: enrichedProfile?.cluster?.name || 'Standard'
            };

            let emailBody = currentStep.customBody || '';
            let emailSubject = currentStep.customSubject || `Follow up on Invoice ${externalInvoiceId}`;
            
            // Inject Variables
            emailBody = this.injectVariables(emailBody, contextData);
            emailSubject = this.injectVariables(emailSubject, contextData);

            if (currentStep.action === 'email') {
                 try {
                     if (customerEmail) {
                        // ── Step 4: Dispatch to n8n via WorkflowService ──
                        // Routes through 'Debt Collection AI' service webhook in the Service Registry
                        const { workflowService } = await import('../../services/workflow.service');
                         
                        const n8nPayload: any = {
                            ...request,
                            ...contextData,
                            actionId: action.id,
                            sessionId: session.id,
                            stepIndex: currentStepIdx,
                            action: 'email',
                            timestamp: new Date().toISOString()
                        };

                        // ── Phase 6: Sign Payload ──
                        n8nPayload.signature = SecurityUtils.signPayload(n8nPayload);

                        console.log(`[Recovery E2E] Step 4/5: Dispatching to n8n → ${customerEmail} | Action: ${action.id} | Signature: ${n8nPayload.signature.substring(0, 8)}...`);

                        const workflow = await p.workflow.findFirst({
                            where: { businessId, triggerType: 'invoice_overdue', isActive: true }
                        });
                        const executeWorkflowId = workflow?.id || `recovery-${session.id}`;

                        await workflowService.executeAction(
                            executeWorkflowId, // Use real workflow ID if available for tracking
                            { 
                                type: 'recovery_email',
                                templateId: currentStep.templateId || 'default-recovery',
                                customSubject: emailSubject,
                                customBody: emailBody
                            },
                            n8nPayload,
                            request.userId || 'system',
                            request.businessId
                        );

                        if (workflow) {
                            await p.workflowExecutionLog.create({
                                data: {
                                    workflowId: workflow.id,
                                    status: 'success',
                                    inputData: n8nPayload,
                                    outputData: { actionId: action.id, message: 'Recovery email dispatched natively' },
                                    duration: 0
                                }
                            });
                        }

                        // Mark action as dispatched
                        await p.debtCollectionAction.update({
                            where: { id: action.id },
                            data: { 
                                status: 'sent', 
                                sentAt: new Date(),
                                aiGeneratedCopy: emailBody
                            }
                        });
                        console.log(`[Recovery E2E] ✅ Email dispatched successfully. Action ${action.id} → sent`);
                        
                        await notificationService.notifyBusiness(
                            businessId,
                            'info',
                            'Recovery Email Dispatched',
                            `Message sent to ${contextData.customerName} regarding Invoice #${externalInvoiceId}.`,
                            'recoveryAction',
                            `/dashboard/recovery/sessions/${session.id}`
                        );
                     } else {
                         // Missing email - fail the action
                         logger.warn({ businessId, externalInvoiceId }, '⚠️ [Recovery] Missing customer email, cannot send.');
                         await p.debtCollectionAction.update({
                             where: { id: action.id },
                             data: { status: 'failed', metadata: { reason: 'missing_email' } }
                         });
                         
                         await notificationService.notifyBusiness(
                            businessId,
                            'warning',
                            'Recovery Action Skipped',
                            `Could not send recovery email for Invoice #${externalInvoiceId} — no email address found for customer.`,
                            'recoveryAlert',
                            `/dashboard/recovery/sessions/${session.id}`
                         );
                     }
                 } catch (emailError: any) {
                     logger.error({ err: emailError }, '❌ [Recovery] Email Sending Failed');
                     await p.debtCollectionAction.update({
                         where: { id: action.id },
                         data: { status: 'failed', metadata: { error: emailError.message } }
                     });
                     
                     await notificationService.notifyBusiness(
                        businessId,
                        'error',
                        'Recovery Execution Failed',
                        `Failed to execute recovery workflow for Invoice #${externalInvoiceId}. Engine Error: ${emailError.message}`,
                        'recoveryAlert',
                        `/dashboard/recovery/sessions/${session.id}`
                     );
                     throw emailError;
                 }
            } else if (currentStep.action === 'workflow') {
                 // 3b. Legacy/Complex Workflow Dispatch (n8n)
                 try {
                     const workflow = await p.workflow.findFirst({
                        where: { 
                            businessId, 
                            triggerType: 'invoice_overdue',
                            isActive: true 
                        }
                    });

                    if (workflow) {
                        const { workflowService } = await import('../../services/workflow.service');
                        const payload = { ...request, ...contextData, step: currentStepIdx + 1, action: currentStep.action };
                        await workflowService.executeAction(workflow.id, workflow.actionConfig, payload, request.userId || 'system');

                        await p.workflowExecutionLog.create({
                            data: {
                                workflowId: workflow.id,
                                status: 'success',
                                inputData: payload,
                                outputData: { actionId: action.id, message: 'Workflow action dispatched via n8n' },
                                duration: 0
                            }
                        });

                        await p.debtCollectionAction.update({
                            where: { id: action.id },
                            data: { status: 'sent', sentAt: new Date(), aiGeneratedCopy: emailBody }
                        });
                    } else {
                        logger.warn({ businessId }, '⚠️ [Recovery] No active workflow found for invoice_overdue');
                        await p.debtCollectionAction.update({
                            where: { id: action.id },
                            data: { status: 'skipped', metadata: { reason: 'no_workflow_configured' } }
                        });
                    }
                 } catch (wfError: any) {
                     logger.error({ err: wfError }, '❌ [Recovery] Workflow execution failed');
                     await p.debtCollectionAction.update({
                         where: { id: action.id },
                         data: { status: 'failed', metadata: { error: wfError.message } }
                     });
                 }
            } else if (currentStep.action === 'sms') {
                // 3c. SMS — Not yet implemented
                logger.warn({ businessId, externalInvoiceId }, '⚠️ [Recovery] SMS action not configured, skipping step');
                await p.debtCollectionAction.update({
                    where: { id: action.id },
                    data: { status: 'skipped', metadata: { reason: 'sms_not_implemented' } }
                });
            } else if (currentStep.action === 'crm') {
                // 3d. CRM — Not yet implemented  
                logger.warn({ businessId, externalInvoiceId }, '⚠️ [Recovery] CRM action not configured, skipping step');
                await p.debtCollectionAction.update({
                    where: { id: action.id },
                    data: { status: 'skipped', metadata: { reason: 'crm_not_implemented' } }
                });
            } else {
                logger.warn({ businessId, action: currentStep.action }, '⚠️ [Recovery] Unknown action type, skipping');
                await p.debtCollectionAction.update({
                    where: { id: action.id },
                    data: { status: 'skipped', metadata: { reason: `unknown_action_type: ${currentStep.action}` } }
                });
            }

            // ── Step 5: Advance Session Step ──
            // ATOMIC with optimistic lock guard.
            // Only advance if the step index is STILL what we read.
            // This is the critical concurrency guard: if another worker already advanced,
            // this updateMany returns count=0 and we know we lost the race.
            const nextStepIdx = currentStepIdx + 1;
            const hasMoreSteps = nextStepIdx < steps.length;

            console.log(`[Recovery E2E] Step 5/5: Advancing session ${session.id} from step ${currentStepIdx} → ${nextStepIdx} (${hasMoreSteps ? 'more steps remain' : 'FINAL STEP'})`);

            const advanceResult = await p.debtCollectionSession.updateMany({
                where: { 
                    id: session.id,
                    currentStepIndex: currentStepIdx // OPTIMISTIC LOCK
                },
                data: {
                    currentStepIndex: nextStepIdx,
                    updatedAt: new Date(),
                    nextActionAt: hasMoreSteps
                        ? this.calculateNextActionDate(steps, nextStepIdx, dueDate)
                        : null
                }
            });

            if (advanceResult.count === 0) {
                console.log(`[Recovery E2E] ⚠️ Optimistic lock: another worker already advanced this session.`);
            } else {
                console.log(`[Recovery E2E] ✅ Session advanced. Next action at: ${hasMoreSteps ? this.calculateNextActionDate(steps, nextStepIdx, dueDate).toISOString() : 'N/A (completed)'}`);
            }

            console.log(`[Recovery E2E] ◼ Processing complete for invoice: ${externalInvoiceId}\n`);

            return { success: true, actionId: action.id, session: session.id };

        } catch (error) {
            logger.error({ err: error, businessId }, '❌ [Recovery] Session processing failed');
            throw error;
        }
    }

    /**
     * BATCH RECOVERY: Process ALL invoices for one customer in a SINGLE n8n call.
     * 
     * ARCHITECTURE:
     * 1. Fetch all ACTIVE sessions for this customer
     * 2. Create DebtCollectionAction per invoice (audit trail, idempotency guard)
     * 3. Build ONE aggregated payload with invoice table
     * 4. Make ONE n8n webhook call with all invoices
     * 5. Advance ALL sessions' step indices
     * 
     * This reduces N n8n calls (per invoice) to 1 call (per customer).
     */
    async processBatchRecovery(batch: {
        businessId: string;
        customerId: string;
        externalCustomerId?: string;
        integrationId?: string;
        providerName?: string;
        customerName: string;
        customerEmail: string;
        customerPhone?: string;
        customer?: any;
        invoices: any[];
        totalAmount: number;
    }) {
        const { businessId, customerId, externalCustomerId, integrationId, providerName, customerName, customerEmail, customerPhone, customer, invoices, totalAmount } = batch;

        console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
        console.log(`║  [Recovery Batch] Processing ${invoices.length} invoices for ${customerName}`);
        console.log(`║  Total: $${totalAmount} | Email: ${customerEmail}`);
        console.log(`╚══════════════════════════════════════════════════════════════╝`);

        // Step 1: Create DebtCollectionActions per invoice (audit trail + idempotency)
        const today = new Date().toISOString().split('T')[0];
        const actionRecords: any[] = [];
        const sessionsToAdvance: any[] = [];

        for (const inv of invoices) {
            const session = await p.debtCollectionSession.findFirst({
                where: { id: inv.sessionId, status: 'ACTIVE' },
                include: { sequence: true }
            });
            if (!session) continue;

            const steps = session.sequence?.steps as any[] || [];
            const currentStep = steps[session.currentStepIndex] || {};

            // Idempotency guard: skip ONLY if a DISPATCHED or SENT (confirmed) action already exists today.
            // Failed actions are NOT idempotent — they must be retried on the next cycle.
            const alreadySent = await p.debtCollectionAction.findFirst({
                where: {
                    sessionId: session.id,
                    externalInvoiceId: inv.externalInvoiceId,
                    status: { in: ['dispatched', 'sent'] },             // ← Both block retry
                    createdAt: { gte: new Date(`${today}T00:00:00Z`) }
                }
            });

            if (alreadySent) {
                console.log(`[Recovery Batch] ⏭️ Skip invoice ${inv.externalInvoiceId} — already dispatched/sent today`);
                continue;
            }

            // Clean up any stale failed/queued actions from today before creating a fresh one
            await p.debtCollectionAction.deleteMany({
                where: {
                    sessionId: session.id,
                    externalInvoiceId: inv.externalInvoiceId,
                    status: { in: ['failed', 'queued'] },
                    createdAt: { gte: new Date(`${today}T00:00:00Z`) }
                }
            });

            const action = await p.debtCollectionAction.create({
                data: {
                    businessId,
                    sessionId: session.id,
                    externalInvoiceId: inv.externalInvoiceId,
                    actionType: currentStep.action || 'email',
                    status: 'queued',
                    aiGeneratedCopy: null
                }
            });

            actionRecords.push({ action, session, inv, currentStep });
            sessionsToAdvance.push({ session, steps });
        }

        if (actionRecords.length === 0) {
            console.log(`[Recovery Batch] ⏭️ No actionable invoices (all already processed today)`);
            return { success: true, processed: 0, reason: 'all_idempotent' };
        }

        console.log(`[Recovery Batch] ✅ Created ${actionRecords.length} DebtCollectionActions`);

        // Step 2: Build ONE aggregated n8n payload
        const invoiceTable = actionRecords.map(r => ({
            invoiceNumber: r.inv.externalInvoiceId,
            amount: `${r.inv.currency || 'USD'} ${r.inv.amount}`,
            dueDate: r.inv.dueDate ? new Date(r.inv.dueDate).toLocaleDateString() : 'N/A',
            stepName: r.currentStep.name || `Step ${r.session.currentStepIndex + 1}`
        }));

        // Find the matching internal floovioo UUID for the customer (so we don't send external ID like '1')
        const internalCustomer = await p.contact.findFirst({
            where: {
                businessId,
                externalId: customerId,
                type: 'customer'
            }
        });

        // The external Customer ID (e.g., Quickbooks '1') is passed alongside the correct internal database ID
        // Note: processBusinessOverdues now passes the internal UUID directly as customerId,
        // and Quickbooks ID as externalCustomerId
        const resolvedExternalId = externalCustomerId || invoices[0]?.customerId || null;

        // Step 2.5: Inject Enriched Profile & Cluster (Phase 5)
        const enrichedProfile = await p.debtCollectionCustomerProfile.findUnique({
            where: { debtCustomerId: customerId },
            include: { cluster: true }
        });

        const aggregatedPayload = {
            businessId,
            integrationId: integrationId || 'unknown',
            provider: providerName || 'unknown',
            customerId, // Already resolved to internal UUID by processBusinessOverdues
            externalCustomerId: resolvedExternalId, 
            customerName,
            customerEmail,
            customerPhone: customerPhone || null,
            customer: customer || { id: customerId, name: customerName, email: customerEmail, phone: customerPhone },
            totalAmount: `USD ${totalAmount.toFixed(2)}`,
            invoiceCount: actionRecords.length,
            invoices: invoiceTable, // Rich invoice array sent to n8n
            batchMode: true,
            action: 'email',
            actionIds: actionRecords.map(r => r.action.id),
            sessionIds: actionRecords.map(r => (r.session as any).id),  // Parallel to actionIds — callback uses these to advance steps
            normalizedEventType: `RECOVERY_${(actionRecords[0]?.currentStep?.action || 'EMAIL').toUpperCase()}_DISPATCH`,
            // Enriched Analytics (Phase 5)
            profile: enrichedProfile ? {
                ltv: enrichedProfile.lifetimeValue,
                totalPurchases: enrichedProfile.totalPurchases,
                creditLimit: enrichedProfile.creditLimit,
                riskScore: enrichedProfile.riskScore,
                clusterId: enrichedProfile.clusterId,
                clusterName: enrichedProfile.cluster?.name || 'Standard'
            } : null,
            timestamp: new Date().toISOString()
        };

        // ── Phase 6: Sign Batch Payload ──
        (aggregatedPayload as any).signature = SecurityUtils.signPayload(aggregatedPayload);

        // Step 3: Dispatch ONE n8n webhook call
        try {
            const { workflowService } = await import('../../services/workflow.service');
            
            console.log(`[Recovery Batch] 🚀 Dispatching aggregated payload → n8n (${actionRecords.length} invoices)`);

            const workflow = await p.workflow.findFirst({
                where: { businessId, triggerType: 'invoice_overdue', isActive: true }
            });
            const executeWorkflowId = workflow?.id || `recovery-batch-${customerId}`;

            await workflowService.executeAction(
                executeWorkflowId,
                { 
                    type: 'recovery_email',
                    templateId: 'batch-recovery',
                    customSubject: `Payment Reminder: ${actionRecords.length} outstanding invoice(s) totaling $${totalAmount.toFixed(2)}`,
                    customBody: `Dear ${customerName}, you have ${actionRecords.length} outstanding invoices totaling $${totalAmount.toFixed(2)}.`
                },
                aggregatedPayload,
                'system',
                businessId
            );

            if (workflow) {
                await p.workflowExecutionLog.create({
                    data: {
                        workflowId: workflow.id,
                        status: 'success',
                        inputData: aggregatedPayload,
                        outputData: { message: `Batch recovery dispatched for ${actionRecords.length} invoices`, actionIds: actionRecords.map(r => r.action.id) },
                        duration: 0
                    }
                });
            }

            // Mark all actions as dispatched (awaiting n8n callback)
            for (const r of actionRecords) {
                const updatedMeta = {
                    ...((r.action.metadata as any) || {}),
                    dispatchedAt: new Date().toISOString()
                };

                await p.debtCollectionAction.update({
                    where: { id: r.action.id },
                    data: { 
                        status: 'dispatched', 
                        sentAt: new Date(),
                        metadata: updatedMeta
                    } // Record the dispatch time (sentAt) and meta
                });
            }

            console.log(`[Recovery Batch] ✅ n8n dispatch SUCCESS. ${actionRecords.length} actions marked dispatched.`);
        } catch (dispatchErr: any) {
            console.log(`[Recovery Batch] ❌ n8n dispatch FAILED: ${dispatchErr.message}`);
            
            // Mark all actions as failed
            for (const r of actionRecords) {
                await p.debtCollectionAction.update({
                    where: { id: r.action.id },
                    data: { status: 'failed', metadata: { error: dispatchErr.message } }
                });
            }

            return { success: false, reason: 'dispatch_failed', error: dispatchErr.message };
        }

        // Step 4: Advance ALL sessions' step indices
        for (const { session, steps } of sessionsToAdvance) {
            const nextIdx = session.currentStepIndex + 1;
            const hasMore = nextIdx < steps.length;

            await p.debtCollectionSession.updateMany({
                where: { id: session.id, currentStepIndex: session.currentStepIndex },
                data: {
                    currentStepIndex: nextIdx,
                    updatedAt: new Date(),
                    nextActionAt: hasMore
                        ? this.calculateNextActionDate(steps, nextIdx, new Date())
                        : null
                }
            });
        }

        console.log(`[Recovery Batch] ✅ All ${sessionsToAdvance.length} sessions advanced.`);
        return { success: true, processed: actionRecords.length };
    }

    /**
     * Get Recovery Metrics for Dashboard.
     */
    async getStatus(businessId: string): Promise<RecoveryStatus> {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 30);

            const [
                activeSessions, 
                recoveredSessions, // Only recoveries from the last 30 days
                exhaustedSessions, // Sequences that completed without recovery
                totalSessions,     // Only sessions opened in last 30 days
                sequences, 
                integration,
                recentSessions
            ] = await Promise.all([
                p.debtCollectionSession.count({
                    where: { businessId, status: 'ACTIVE' } // Active carries over indefinitely
                }),
                p.debtCollectionSession.count({
                    where: { businessId, status: 'RECOVERED', updatedAt: { gte: cutoffDate } }
                }),
                p.debtCollectionSession.count({
                    where: { businessId, status: 'EXHAUSTED' }
                }),
                p.debtCollectionSession.count({
                    where: { businessId, createdAt: { gte: cutoffDate } }
                }),
                p.debtCollectionSequence.findMany({
                    where: { businessId, isActive: true },
                    orderBy: { isDefault: 'desc' }
                }),
                p.integration.findFirst({
                    where: { businessId, provider: 'quickbooks', status: 'connected' }
                }),
                p.debtCollectionSession.findMany({
                    where: { businessId, status: 'ACTIVE' },
                    include: { sequence: true },
                    orderBy: { updatedAt: 'desc' }
                })
            ]);

            // ==========================================
            // MICROSERVICE: ABSOLUTE DASHBOARD TRUTH
            // ==========================================
            // Ghost Defeater: Compute explicitly via PostgreSQL relational float bounds, ignoring primitive JSON states.
            // Include ALL non-terminated session types for revenue attribution:
            // ACTIVE — still in dunning, but partial payments may have been made
            // RECOVERED — successfully paid during or after dunning
            // EXHAUSTED — sequence completed; invoice may still get paid later
            // Fetch sessions with metadata so we can fall back to session-stored amounts
            const allSessions = await p.debtCollectionSession.findMany({
                where: { 
                    businessId, 
                    OR: [
                        { status: 'ACTIVE' },
                        { status: 'EXHAUSTED' },
                        { status: 'RECOVERED', updatedAt: { gte: cutoffDate } }
                    ]
                },
                select: { externalInvoiceId: true, status: true, metadata: true }
            });
            const sessionInvoiceIds = allSessions.map((s: any) => s.externalInvoiceId);
            
            let recoveredAmount = 0;
            if (sessionInvoiceIds.length > 0) {
                // Build a map of invoice amounts from the normalized cache
                const sessionInvoices = await p.debtCollectionInvoice.findMany({
                    where: { businessId, externalId: { in: sessionInvoiceIds } },
                    select: { externalId: true, amount: true, balance: true }
                });
                const invoiceAmountMap = new Map<string, { amount: number; balance: number }>();
                for (const inv of sessionInvoices) {
                    invoiceAmountMap.set(inv.externalId, { amount: inv.amount || 0, balance: inv.balance || 0 });
                }

                // Calculate recovered amount per session
                // For RECOVERED sessions: the full invoice amount was recovered (amount - 0 = amount)
                // For ACTIVE/EXHAUSTED: partial payments = amount - balance
                // Fallback: if invoice amount is 0 (data corruption), use session metadata.amount
                for (const sess of allSessions) {
                    const inv = invoiceAmountMap.get(sess.externalInvoiceId);
                    let invoiceAmount = inv?.amount || 0;
                    const invoiceBalance = inv?.balance || 0;

                    // Fallback to session metadata if invoice amount was corrupted (zeroed by old voided handler)
                    if (invoiceAmount === 0 && sess.metadata?.amount) {
                        invoiceAmount = parseFloat(sess.metadata.amount) || 0;
                    }

                    const diff = invoiceAmount - invoiceBalance;
                    recoveredAmount += Math.max(0, diff);
                }
            }

            let invoiceStats = { total: 0, unpaid: 0, overdue: 0 };
            const defaultSeq = sequences.find(s => s.isDefault) || sequences[0];

            // ==========================================
            // MULTI-INTEGRATION: Invoice stats from NORMALIZED tables
            // Reads from DebtCollectionInvoice (populated by syncOverdueInvoices)
            // Works for QuickBooks, Zoho Books, Sage, Xero — any connected ERP
            // ==========================================
            const now = new Date();
            const gracePeriod = (defaultSeq?.settings as any)?.gracePeriod || 0;
            const overdueThreshold = new Date();
            overdueThreshold.setDate(overdueThreshold.getDate() - gracePeriod);

            const [totalInvoiceCount, unpaidInvoiceCount, overdueInvoiceCount, outstandingAgg] = await Promise.all([
                p.debtCollectionInvoice.count({ where: { businessId } }),
                p.debtCollectionInvoice.count({ where: { businessId, balance: { gt: 0 } } }),
                p.debtCollectionInvoice.count({ where: { businessId, balance: { gt: 0 }, dueDate: { lt: overdueThreshold } } }),
                p.debtCollectionInvoice.aggregate({ where: { businessId, balance: { gt: 0 } }, _sum: { balance: true } })
            ]);

            invoiceStats = {
                total: totalInvoiceCount,
                unpaid: unpaidInvoiceCount,
                overdue: overdueInvoiceCount
            };

            const totalOutstanding = outstandingAgg._sum?.balance || 0;

            // Untracked overdue are overdue from normalized tables minus ones already in active sessions
            const activeExternalIds = await p.debtCollectionSession.findMany({
                where: { businessId, status: 'ACTIVE' },
                select: { externalInvoiceId: true }
            });
            const untrackedOverdue = Math.max(0, invoiceStats.overdue - activeExternalIds.length);

            // ── SUCCESS RATE ──
            // Calculated as: invoices recovered / (recovered + active + exhausted)
            // Excludes terminated (voided/deleted) sessions since those aren't real recovery attempts
            const trackedSessions = recoveredSessions + activeSessions + exhaustedSessions;
            const successRate = trackedSessions > 0 ? Math.round((recoveredSessions / trackedSessions) * 100) : 0;

            // Group active sessions by customer
            const customerSessionsMap = new Map<string, any>();
            for (const s of recentSessions) {
                if (!customerSessionsMap.has(s.customerId)) {
                    customerSessionsMap.set(s.customerId, {
                        customerId: s.customerId,
                        customerName: s.customerName,
                        activeSessionCount: 0,
                        totalAmount: 0,
                        latestSequence: s.sequence?.name,
                        status: 'Active'
                    });
                }
                const group = customerSessionsMap.get(s.customerId);
                group.activeSessionCount++;
                group.totalAmount += Number((s.metadata as any)?.amount || 0);
            }
            const customerSessions = Array.from(customerSessionsMap.values());

            return {
                totalOverdue: activeSessions,
                pendingReminders: activeSessions,
                recoveredAmount,
                recoveredCount: recoveredSessions,
                activeSessions,
                totalSessions,
                trackedSessions,
                untrackedOverdue,
                successRate,
                totalOutstanding,
                recentSessions,
                customerSessions,
                sequences,
                totalInvoices: invoiceStats.total,
                unpaidInvoices: invoiceStats.unpaid,
                overdueInvoices: invoiceStats.overdue,
                sequence: defaultSeq
            };
        } catch (error) {
            logger.error({ err: error, businessId }, '❌ [Recovery] Status fetch failed');
            return {
                totalOverdue: 0,
                pendingReminders: 0,
                recoveredAmount: 0,
                recoveredCount: 0,
                activeSessions: 0,
                totalSessions: 0,
                untrackedOverdue: 0,
                successRate: 0,
                totalOutstanding: 0
            };
        }
    }

    /**
     * Update or create a DebtCollectionSequence for a business.
     */
    async updateSequence(businessId: string, config: {
        id?: string;
        steps?: any[];
        isActive?: boolean;
        name?: string;
        settings?: any;
        isDefault?: boolean;
        rules?: any;
    }) {
        const data: any = {};
        if (config.steps !== undefined) data.steps = config.steps;
        if (config.isActive !== undefined) data.isActive = config.isActive;
        if (config.name !== undefined) data.name = config.name;
        if (config.isDefault !== undefined) data.isDefault = config.isDefault;
        if (config.rules !== undefined) data.rules = config.rules;
        
        if (config.settings !== undefined) {
            const current = config.id && config.id !== 'new-uuid' ? 
                await p.debtCollectionSequence.findUnique({ where: { id: config.id } }) :
                await p.debtCollectionSequence.findFirst({ where: { businessId, isDefault: true } });
            const existingSettings = (current?.settings as any) || {};
            data.settings = { ...existingSettings, ...config.settings };
        }

        // If setting as default, unset others first
        if (config.isDefault) {
            await p.debtCollectionSequence.updateMany({
                where: { businessId, isDefault: true },
                data: { isDefault: false }
            });
        }

        const sequence = await p.debtCollectionSequence.upsert({
            where: { id: config.id || 'new-uuid' },
            update: data,
            create: {
                businessId,
                name: config.name || 'Recovery Campaign',
                steps: config.steps || RecoveryService.DEFAULT_STEPS,
                isActive: config.isActive ?? true,
                isDefault: config.isDefault || false,
                rules: config.rules || {},
                settings: config.settings || { gracePeriod: 3, brandVoice: 'standard' }
            }
        });

        logger.info({ businessId, sequenceId: sequence.id }, '✅ [Recovery] Sequence updated');
        return sequence;
    }

    /**
     * Delete a DebtCollectionSequence.
     */
    async deleteSequence(businessId: string, id: string) {
        // Prevent deleting the last default sequence
        const seq = await p.debtCollectionSequence.findUnique({ where: { id } });
        if (!seq) throw new Error('Sequence not found');
        if (seq.isDefault) throw new Error('Cannot delete default sequence');

        await p.debtCollectionSequence.delete({
            where: { id, businessId }
        });
        
        logger.info({ businessId, sequenceId: id }, '🗑️ [Recovery] Sequence deleted');
    }

    /**
     * Handle External ERP Payment Events.
     * Automatically validates and reconciles database state.
     */
    async handleErpEvent(businessId: string, event: { type: string, externalId: string, payload?: any }) {
        const validEvents = ['invoice.updated', 'invoice.paid', 'payment.created', 'payment.updated', 'invoice.deleted', 'invoice.voided'];
        if (!validEvents.includes(event.type)) return;
        
        console.log(`[RecoveryService] 🔔 Received ERP Webhook Event for Business ${businessId}: ${event.type} on Entity ${event.externalId}`);
        
        // Auto-Sync Interception: Instantly halt active sessions if we receive clear signal of payment
        try {
            if (event.type === 'invoice.paid' || event.type === 'payment.created' || event.type === 'invoice.updated') {
                const isFullyPaid = event.payload?.Balance === 0 || event.payload?.Balance === '0' || event.payload?.Balance === '0.00';
                const targetInvoiceId = event.type.startsWith('invoice') ? event.externalId : event.payload?.LinkedTxn?.[0]?.TxnId;

                if (isFullyPaid && targetInvoiceId) {
                    const activeSessions = await p.debtCollectionSession.findMany({
                        where: { businessId, externalInvoiceId: targetInvoiceId, status: { in: ['ACTIVE', 'PAUSED'] } }
                    });

                    if (activeSessions.length > 0) {
                        console.log(`[RecoveryService] 🛑 Intercepted payment for invoice ${targetInvoiceId}. Halting ${activeSessions.length} dunning sequence(s) and marking as RECOVERED.`);
                        
                        const sessionIds = activeSessions.map((s: any) => s.id);
                        const invoiceTotal = parseFloat(event.payload?.TotalAmt || event.payload?.total || '0');

                        await p.debtCollectionSession.updateMany({
                            where: { id: { in: sessionIds } },
                            data: { 
                                status: 'RECOVERED', 
                                updatedAt: new Date(),
                                metadata: {
                                    recoveredAmount: invoiceTotal,
                                    recoveredAt: new Date().toISOString(),
                                    recoveredVia: 'ERP_WEBHOOK'
                                }
                            }
                        });

                        await p.debtCollectionStateHistory.createMany({
                            data: sessionIds.map(id => ({
                                sessionId: id,
                                previousStatus: 'ACTIVE',
                                newStatus: 'RECOVERED',
                                reason: `Invoice marked Paid via incoming ERP webhook intercept ($${invoiceTotal})`,
                                triggerSource: 'ERP_WEBHOOK'
                            }))
                        });

                        // Update the local invoice cache with BOTH balance=0 AND the correct amount
                        // so that the dashboard formula (amount - balance) yields the correct recovered revenue
                        await p.debtCollectionInvoice.updateMany({
                            where: { businessId, externalId: targetInvoiceId },
                            data: { 
                                balance: 0, 
                                ...(invoiceTotal > 0 ? { amount: invoiceTotal } : {}),
                                status: 'PAID' 
                            }
                        });
                    }
                }
            }
        } catch (interceptionError) {
            console.error(`[RecoveryService] Failed to fast-intercept webhook payload:`, interceptionError);
        }

        console.log(`[RecoveryService] ⚡ Triggering out-of-band headless sync due to Webhook on Entity ${event.externalId}`);
        // We fire the sync headlessly to return 200 OK to the webhook dispatcher immediately.
        // It's the safest way to reconcile partial payments versus full closures without blind overwrite.
        this.syncOverdueInvoices(businessId).catch(err => {
            console.error(`[RecoveryService] Webhook-triggered sync failed:`, err);
        });
    }

    /**
     * Get Detailed Invoices for Activity View.
     * Reads from normalized DebtCollectionInvoice + DebtCollectionCustomer tables.
     * Supports ALL connected integrations (QuickBooks, Zoho, Sage, Xero).
     */
    async getDetailedInvoices(businessId: string): Promise<any[]> {
    // 1. Fetch Local Recovery Sessions (History)
    const sessions = await p.debtCollectionSession.findMany({
        where: { businessId },
        include: { actions: { orderBy: { createdAt: 'desc' }, take: 1 } },
        orderBy: { updatedAt: 'desc' }
    });

    // 2. Fetch ALL invoices from normalized cache (multi-integration compatible)
    const cachedInvoices = await p.debtCollectionInvoice.findMany({
        where: { businessId },
        include: { customer: true },
        orderBy: { dueDate: 'asc' }
    });

    // 3. Merge Strategy: Map of External ID to detailed record
    const resultsMap = new Map<string, any>();

    // Seed with normalized cached invoices
    const now = new Date();
    for (const inv of cachedInvoices) {
        let dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
        if (dueDate && isNaN(dueDate.getTime())) dueDate = null;
        const daysOverdue = dueDate ? Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
        
        resultsMap.set(inv.externalId, {
            id: inv.externalId,
            customerName: inv.customer?.name || 'Unknown',
            customerId: inv.customer?.externalId || inv.customerId || 'unknown',
            customerEmail: inv.customer?.email || 'N/A',
            amount: inv.amount || 0,
            currency: 'USD',
            dueDate: dueDate || inv.issuedDate,
            daysOverdue: daysOverdue > 0 ? daysOverdue : 0,
            status: inv.balance > 0 ? 'overdue' : 'paid',
            lastAction: undefined
        });
    }

    // Overlay/Add from local sessions (Historical Perspective)
    for (const s of sessions) {
        const lastAction = s.actions?.[0];
        const existing = resultsMap.get(s.externalInvoiceId);

        if (existing) {
            // Update status and last action from local source
            existing.status = s.status.toLowerCase();
            if (lastAction) {
                existing.lastAction = {
                    id: lastAction.id,
                    type: lastAction.actionType,
                    date: lastAction.sentAt || lastAction.updatedAt || lastAction.createdAt,
                    status: lastAction.status
                };
            }
        } else {
            // Invoice is recovered (paid), manual, or otherwise not in current QBO overdue list
            const meta = (s.metadata as any) || {};
            resultsMap.set(s.externalInvoiceId, {
                id: s.externalInvoiceId,
                customerName: s.customerName || meta.contactName || 'Unknown',
                customerId: s.customerId || 'unknown',
                customerEmail: meta.customerEmail || 'N/A',
                amount: Number(meta.amount || 0),
                currency: meta.currency || 'USD',
                dueDate: meta.dueDate ? new Date(meta.dueDate) : s.createdAt,
                daysOverdue: meta.dueDate ? 
                    Math.max(0, Math.floor((new Date().getTime() - new Date(meta.dueDate).getTime()) / (1000 * 60 * 60 * 24))) : 0,
                status: s.status.toLowerCase(),
                lastAction: lastAction ? {
                    id: lastAction.id,
                    type: lastAction.actionType,
                    date: lastAction.sentAt || lastAction.updatedAt || lastAction.createdAt,
                    status: lastAction.status
                } : undefined
            });
        }
    }

    // 4. Group by Customer
    const customerGroupsMap = new Map<string, any>();
    for (const inv of resultsMap.values()) {
        const groupKey = inv.customerId + '_' + inv.customerName;
        if (!customerGroupsMap.has(groupKey)) {
            customerGroupsMap.set(groupKey, {
                customerId: inv.customerId,
                customerName: inv.customerName,
                totalAmount: 0,
                invoices: []
            });
        }
        const group = customerGroupsMap.get(groupKey);
        group.totalAmount += inv.amount;
        group.invoices.push(inv);
    }

    return Array.from(customerGroupsMap.values());
}
    /**
     * Helper: Inject variables into template string.
     */
    private injectVariables(template: string, data: any): string {
        return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
            return data[key] || '';
        });
    }

    /**
     * Dispatch All Pending Actions
     * 
     * ORCHESTRATION FLOW:
     * Called by the daily cron (0 9 * * *) or boot-time trigger.
     * For each tenant with active DebtCollectionSequences:
     *   1. Queues `recovery:sync` → polls ERP for latest overdue invoices
     *   2. Queues `recovery:process-business` (60s delay) → finds due sessions → dispatches actions
     * 
     * PRE-FLIGHT: Validates webhook URL is configured before dispatching any jobs.
     */
    async processPendingActions() {
        console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
        console.log(`║  [Recovery Orchestrator] Daily Dispatch Starting             ║`);
        console.log(`╚══════════════════════════════════════════════════════════════╝`);

        // Pre-flight: Verify webhook URL is configured before dispatching
        const health = await RecoveryService.healthCheck();
        console.log(`[Recovery Orchestrator] Pre-flight: webhook=${health.webhookUrl ? '✅' : '❌'} | sequences=${health.activeSequences} | ready=${health.ready}`);
        
        if (!health.webhookUrl) {
            console.log(`[Recovery Orchestrator] ❌ ABORTED: No webhook URL configured. Fix the service DB config.`);
            return;
        }
        if (!health.ready) {
            console.log(`[Recovery Orchestrator] ⚠️ Issues: ${health.issues.join(', ')} — proceeding anyway.`);
        }
        
        // 1. Find all active sequences across all tenants
        const activeSequences = await p.debtCollectionSequence.findMany({
            where: { isActive: true }
        });

        console.log(`[Recovery Orchestrator] Found ${activeSequences.length} active dunning sequence(s)`);

        if (activeSequences.length === 0) {
            console.log(`[Recovery Orchestrator] No active sequences. Nothing to dispatch.\n`);
            return;
        }

        // 2. Deduplicate by businessId — only ONE sync+process per business
        // Multiple sequences for the same business should NOT trigger multiple syncs
        const uniqueBusinessIds = [...new Set(activeSequences.map(seq => seq.businessId))];
        console.log(`[Recovery Orchestrator] ${activeSequences.length} sequence(s) across ${uniqueBusinessIds.length} unique business(es)`);

        const { QUEUES, createQueue } = await import('../../lib/queue');
        const recoveryQueue = createQueue(QUEUES.RECOVERY_ENGINE);

        for (const businessId of uniqueBusinessIds) {
            console.log(`[Recovery Orchestrator] → Tenant ${businessId}: Queuing ERP sync + process-business`);
            
            // A. Trigger ERP Sync (one per business per day)
            await recoveryQueue.add('recovery:sync', { businessId }, {
                jobId: `sync_${businessId}_${new Date().toISOString().split('T')[0]}`
            });

            // B. Schedule business processing (delay allows sync to complete first)
            await recoveryQueue.add('recovery:process-business', { businessId }, {
                 delay: 60000
             });
        }

        console.log(`[Recovery Orchestrator] ✅ Dispatched ${uniqueBusinessIds.length} sync+process job pair(s)\n`);
    }

    /**
     * Process all overdue invoices for a business — BATCHED PER CUSTOMER
     * 
     * ARCHITECTURE:
     * Instead of queuing one recovery:execute per invoice (N triggers for N invoices),
     * this groups sessions by customerId and queues ONE batch job per customer.
     * This reduces n8n calls from N to M (where M = unique customers).
     * 
     * FLOW: Find due sessions → Group by customer → Resolve email per customer → Queue batch
     * 
     * @param businessId - Tenant ID
     * @returns {processed: number} - Number of customers batched
     */
    async processBusinessOverdues(businessId: string) {
         // 1. Get all ACTIVE sessions that are DUE (nextActionAt <= now)
         const activeSessions = await p.debtCollectionSession.findMany({
             where: { 
                 businessId,
                 status: 'ACTIVE',
                 nextActionAt: { lte: new Date() }
             },
             include: { sequence: true }
         });

         if (activeSessions.length === 0) {
             console.log(`[Recovery Batch] No due sessions for business ${businessId}`);
             return { processed: 0 };
         }

         // 2.a Fetch Integration to identify ERP source (e.g. 'quickbooks')
         const integration = await p.integration.findFirst({
             where: { businessId, status: 'connected' }
         });
         const integrationId = integration ? integration.id : 'unknown';
         const providerName = integration ? integration.provider : 'unknown';

         // 2.b Group sessions by customerId for batch dispatch
         const customerGroups = new Map<string, any[]>();
         for (const session of activeSessions) {
             const custId = session.customerId || 'unknown';
             if (!customerGroups.has(custId)) customerGroups.set(custId, []);
             customerGroups.get(custId)!.push(session);
         }

         console.log(`[Recovery Batch] Business ${businessId}: ${activeSessions.length} due sessions across ${customerGroups.size} customer(s) | Provider: ${providerName}`);

         const { QUEUES, createQueue } = await import('../../lib/queue');
         const recoveryQueue = createQueue(QUEUES.RECOVERY_ENGINE);
         let batchCount = 0;

         for (const [customerId, sessions] of customerGroups.entries()) {
             // 3. Resolve customer data ONCE per customer (not per invoice)
             const metadata = sessions[0].metadata as any;
             let customerEmail = metadata?.customerEmail;
             let customerPhone = metadata?.customerPhone || null;
             let customerName = sessions[0].customerName || metadata?.contactName || 'Valued Customer';

             // Always lookup the real internal contact to get rich data
             const contact = await p.contact.findFirst({
                 where: { 
                     businessId, 
                     type: 'customer', 
                     externalId: customerId 
                 }
             });
             
             if (contact) {
                 if (!customerEmail || customerEmail === 'N/A') customerEmail = contact.email || 'N/A';
                 if (!customerPhone) customerPhone = contact.phone || null;
                 if (contact.name && contact.name !== 'Unknown') customerName = contact.name;
             }

             // 4. Build the aggregated invoice manifest for this customer
             const invoiceManifest = sessions.map((s: any) => ({
                 sessionId: s.id,
                 externalInvoiceId: s.externalInvoiceId,
                 amount: Number((s.metadata as any)?.amount || 0),
                 currency: (s.metadata as any)?.currency || 'USD',
                 dueDate: (s.metadata as any)?.dueDate || new Date().toISOString(),
                 currentStepIndex: s.currentStepIndex,
                 sequenceName: s.sequence?.name || 'Default'
             }));

             const totalAmount = invoiceManifest.reduce((sum: number, inv: any) => sum + inv.amount, 0);

             console.log(`[Recovery Batch] → Customer ${customerId}: ${sessions.length} invoices, total $${totalAmount.toFixed(2)}, email: ${customerEmail}`);

             // 5. Queue ONE batch job per customer
             await recoveryQueue.add('recovery:batch-execute', {
                 businessId,
                 customerId: contact ? contact.id : customerId, // Internal Floovioo UUID
                 externalCustomerId: customerId, // ERP ID
                 integrationId,
                 providerName,
                 customerName,
                 customerEmail,
                 customerPhone,
                 customer: contact ? contact : { id: customerId, name: customerName, email: customerEmail, phone: customerPhone },
                 invoices: invoiceManifest,
                 totalAmount,
                 userId: 'system'
             }, {
                 jobId: `batch_${businessId}_${customerId}_${new Date().toISOString().split('T')[0]}`,
                 removeOnComplete: true
             });
             batchCount++;
         }
         
         console.log(`[Recovery Batch] ✅ Queued ${batchCount} customer batch(es) for ${activeSessions.length} total invoices`);
         return { processed: batchCount };
    }

    /**
     * Helper to calculate next action date based on sequence steps
     */
    calculateNextActionDate(steps: any[], currentStepIdx: number, dueDate: Date): Date {
        if (!Array.isArray(steps) || currentStepIdx >= steps.length) return new Date(); // Immediate fallback or null

        const step = steps[currentStepIdx];
        const due = new Date(dueDate);
        const dayOffset = step.day || 0;
        
        // Next action is Due Date + Offset Days
        const nextDate = new Date(due);
        nextDate.setDate(due.getDate() + dayOffset);
        
        // If calculated date is in the past (e.g. invoice is very old),
        // we might want to schedule it for TODAY so it sends immediately?
        // Or respect the historical timeline? 
        // Strategy: If (Due + Offset) < Now, schedule for Now (catch up)
        if (nextDate < new Date()) {
            return new Date();
        }
        
        return nextDate;
    }

    // ════════════════════════════════════════════════════════════
    // ██  REST API METHODS — Phase 1: Session Lifecycle
    // ════════════════════════════════════════════════════════════

    /**
     * Pause an active recovery session.
     * Sets status to PAUSED, clears nextActionAt to prevent processing.
     * Uses optimistic concurrency via updatedAt to prevent race conditions.
     */
    async pauseSession(businessId: string, sessionId: string) {
        const session = await p.debtCollectionSession.findFirst({
            where: { id: sessionId, businessId }
        });
        if (!session) return { success: false, error: 'Session not found' };
        if (session.status !== 'ACTIVE') return { success: false, error: `Cannot pause session in ${session.status} state` };

        // Optimistic concurrency: only update if updatedAt hasn't changed since our read
        const result = await p.debtCollectionSession.updateMany({
            where: { id: sessionId, updatedAt: session.updatedAt },
            data: { status: 'PAUSED', nextActionAt: null, updatedAt: new Date() }
        });

        if (result.count === 0) {
            logger.warn({ sessionId, businessId }, '⚠️ [Recovery API] Pause conflict — session was modified concurrently');
            return { success: false, error: 'Session was modified by another operation. Please refresh and try again.' };
        }

        logger.info({ sessionId, businessId }, '⏸️ [Recovery API] Session paused');
        return { success: true, sessionId, status: 'PAUSED' };
    }

    /**
     * Resume a paused recovery session.
     * Sets status back to ACTIVE, recalculates nextActionAt.
     * Uses optimistic concurrency via updatedAt to prevent race conditions.
     */
    async resumeSession(businessId: string, sessionId: string) {
        const session = await p.debtCollectionSession.findFirst({
            where: { id: sessionId, businessId },
            include: { sequence: true }
        });
        if (!session) return { success: false, error: 'Session not found' };
        if (session.status !== 'PAUSED') return { success: false, error: `Cannot resume session in ${session.status} state` };

        const steps = session.sequence?.steps as any[] || [];
        const nextActionAt = session.currentStepIndex < steps.length
            ? new Date() // Resume immediately
            : null;

        // Optimistic concurrency: only update if updatedAt hasn't changed since our read
        const result = await p.debtCollectionSession.updateMany({
            where: { id: sessionId, updatedAt: session.updatedAt },
            data: { status: 'ACTIVE', nextActionAt, updatedAt: new Date() }
        });

        if (result.count === 0) {
            logger.warn({ sessionId, businessId }, '⚠️ [Recovery API] Resume conflict — session was modified concurrently');
            return { success: false, error: 'Session was modified by another operation. Please refresh and try again.' };
        }

        logger.info({ sessionId, businessId }, '▶️ [Recovery API] Session resumed');
        return { success: true, sessionId, status: 'ACTIVE', nextActionAt };
    }

    /**
     * Manually terminate a recovery session.
     * Uses optimistic concurrency via updatedAt to prevent race conditions.
     */
    async terminateSession(businessId: string, sessionId: string, reason?: string) {
        const session = await p.debtCollectionSession.findFirst({
            where: { id: sessionId, businessId }
        });
        if (!session) return { success: false, error: 'Session not found' };
        if (session.status === 'TERMINATED' || session.status === 'RECOVERED') {
            return { success: false, error: `Session already in terminal state: ${session.status}` };
        }

        // Optimistic concurrency: only update if updatedAt hasn't changed
        const result = await p.debtCollectionSession.updateMany({
            where: { id: sessionId, updatedAt: session.updatedAt },
            data: {
                status: 'TERMINATED',
                nextActionAt: null,
                metadata: { ...(session.metadata as any || {}), terminationReason: reason || 'manual' },
                updatedAt: new Date()
            }
        });

        if (result.count === 0) {
            logger.warn({ sessionId, businessId }, '⚠️ [Recovery API] Terminate conflict — session was modified concurrently');
            return { success: false, error: 'Session was modified by another operation. Please refresh and try again.' };
        }

        logger.info({ sessionId, businessId, reason }, '🛑 [Recovery API] Session terminated');
        return { success: true, sessionId, status: 'TERMINATED' };
    }

    /**
     * Get full session detail with action history and timeline.
     */
    async getSession(businessId: string, sessionId: string) {
        const session = await p.debtCollectionSession.findFirst({
            where: { id: sessionId, businessId },
            include: {
                sequence: true,
                actions: { orderBy: { createdAt: 'asc' } }
            }
        });
        if (!session) return null;

        // Build timeline
        const timeline: any[] = [];
        timeline.push({
            timestamp: session.createdAt,
            type: 'session_created',
            description: `Recovery session created for invoice ${session.externalInvoiceId}`
        });

        for (const action of (session as any).actions) {
            timeline.push({
                timestamp: action.createdAt,
                type: 'action_queued',
                description: `${action.actionType} action queued (Step ${action.metadata?.stepIndex ?? '?'})`
            });
            if (action.sentAt) {
                timeline.push({
                    timestamp: action.sentAt,
                    type: action.status === 'sent' ? 'action_sent' : 'action_failed',
                    description: `${action.actionType} ${action.status === 'sent' ? 'delivered successfully' : 'failed: ' + (action.metadata?.error || 'unknown')}`
                });
            }
        }

        timeline.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        return {
            session: {
                id: session.id,
                externalInvoiceId: session.externalInvoiceId,
                customerId: session.customerId,
                customerName: session.customerName,
                status: session.status,
                currentStepIndex: session.currentStepIndex,
                nextActionAt: session.nextActionAt,
                metadata: session.metadata,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt
            },
            sequence: session.sequence,
            actions: (session as any).actions,
            timeline
        };
    }

    /**
     * Reassign a session to a different dunning sequence.
     * Resets step index to 0 and recalculates nextActionAt.
     * Uses optimistic concurrency via updatedAt to prevent race conditions.
     */
    async reassignSession(businessId: string, sessionId: string, newSequenceId: string) {
        const session = await p.debtCollectionSession.findFirst({
            where: { id: sessionId, businessId }
        });
        if (!session) return { success: false, error: 'Session not found' };
        if (session.status !== 'ACTIVE' && session.status !== 'PAUSED') {
            return { success: false, error: `Cannot reassign session in ${session.status} state` };
        }

        const newSequence = await p.debtCollectionSequence.findFirst({
            where: { id: newSequenceId, businessId }
        });
        if (!newSequence) return { success: false, error: 'Target sequence not found' };

        // Optimistic concurrency: only update if updatedAt hasn't changed since our read
        const result = await p.debtCollectionSession.updateMany({
            where: { id: sessionId, updatedAt: session.updatedAt },
            data: {
                sequenceId: newSequenceId,
                currentStepIndex: 0,
                nextActionAt: new Date(),
                updatedAt: new Date()
            }
        });

        if (result.count === 0) {
            logger.warn({ sessionId, businessId }, '⚠️ [Recovery API] Reassign conflict — session was modified concurrently');
            return { success: false, error: 'Session was modified by another operation. Please refresh and try again.' };
        }

        // Clear idempotency guard for today so the new sequence can dispatch immediately
        const today = new Date().toISOString().split('T')[0];
        await p.debtCollectionAction.deleteMany({
            where: {
                sessionId: sessionId,
                createdAt: { gte: new Date(`${today}T00:00:00Z`) }
            }
        });

        console.log(`[Recovery Service] 🔄 Session ${sessionId} reassigned to sequence ${newSequence.name}`);
        logger.info({ sessionId, businessId, newSequenceId }, '🔄 [Recovery API] Session reassigned');
        return { success: true, sessionId, newSequenceId, newSequenceName: newSequence.name };
    }

    /**
     * Escalate: skip to the next step immediately.
     * Uses optimistic concurrency via updatedAt to prevent race conditions.
     */
    async escalateSession(businessId: string, sessionId: string) {
        const session = await p.debtCollectionSession.findFirst({
            where: { id: sessionId, businessId },
            include: { sequence: true }
        });
        if (!session) return { success: false, error: 'Session not found' };
        if (session.status !== 'ACTIVE') return { success: false, error: `Cannot escalate session in ${session.status} state` };

        const steps = session.sequence?.steps as any[] || [];
        const nextIdx = session.currentStepIndex + 1;

        if (nextIdx >= steps.length) {
            // Auto-terminate: all steps exhausted
            const result = await p.debtCollectionSession.updateMany({
                where: { id: sessionId, updatedAt: session.updatedAt },
                data: { status: 'TERMINATED', nextActionAt: null, updatedAt: new Date() }
            });
            if (result.count === 0) {
                return { success: false, error: 'Session was modified by another operation. Please refresh and try again.' };
            }
            return { success: true, sessionId, status: 'TERMINATED', message: 'All steps exhausted' };
        }

        // Optimistic concurrency: only update if updatedAt hasn't changed
        const result = await p.debtCollectionSession.updateMany({
            where: { id: sessionId, updatedAt: session.updatedAt },
            data: {
                currentStepIndex: nextIdx,
                nextActionAt: new Date(), // Fire immediately
                updatedAt: new Date()
            }
        });

        if (result.count === 0) {
            logger.warn({ sessionId, businessId }, '⚠️ [Recovery API] Escalate conflict — session was modified concurrently');
            return { success: false, error: 'Session was modified by another operation. Please refresh and try again.' };
        }

        logger.info({ sessionId, businessId, from: session.currentStepIndex, to: nextIdx }, '⏩ [Recovery API] Session escalated');
        
        await notificationService.notifyBusiness(
            businessId,
            'info',
            'Session Escalated',
            `Debt recovery session escalated from Step ${session.currentStepIndex + 1} to Step ${nextIdx + 1}.`,
            'recoveryAction',
            `/dashboard/recovery/sessions/${sessionId}`
        );

        return { success: true, sessionId, previousStep: session.currentStepIndex, currentStep: nextIdx, nextActionAt: new Date() };
    }

    // ════════════════════════════════════════════════════════════
    // ██  REST API METHODS — Phase 2: Sequence CRUD
    // ════════════════════════════════════════════════════════════

    /**
     * Create a new dunning sequence.
     */
    async createSequence(businessId: string, data: {
        name: string;
        steps: any[];
        isActive?: boolean;
        isDefault?: boolean;
        rules?: any;
        settings?: any;
    }) {
        if (!data.name || !data.steps || data.steps.length === 0) {
            return { success: false, error: 'Name and at least one step are required' };
        }

        // If setting as default, unset other defaults
        if (data.isDefault) {
            await p.debtCollectionSequence.updateMany({
                where: { businessId, isDefault: true },
                data: { isDefault: false }
            });
        }

        const sequence = await p.debtCollectionSequence.create({
            data: {
                businessId,
                name: data.name,
                steps: data.steps,
                isActive: data.isActive ?? true,
                isDefault: data.isDefault ?? false,
                rules: data.rules || null,
                settings: data.settings || null
            }
        });

        logger.info({ sequenceId: sequence.id, businessId, name: data.name }, '✅ [Recovery API] Sequence created');
        return { success: true, sequence };
    }

    /**
     * Get single sequence detail with statistics.
     */
    async getSequenceDetail(businessId: string, sequenceId: string) {
        const sequence = await p.debtCollectionSequence.findFirst({
            where: { id: sequenceId, businessId },
            include: {
                sessions: {
                    select: { id: true, status: true, customerId: true, customerName: true, externalInvoiceId: true }
                }
            }
        });
        if (!sequence) return null;

        const sessionsByStatus = (sequence as any).sessions.reduce((acc: any, s: any) => {
            acc[s.status] = (acc[s.status] || 0) + 1;
            return acc;
        }, {});

        return {
            ...sequence,
            stats: {
                totalSessions: (sequence as any).sessions.length,
                byStatus: sessionsByStatus,
                uniqueCustomers: new Set((sequence as any).sessions.map((s: any) => s.customerId)).size
            }
        };
    }

    // ════════════════════════════════════════════════════════════
    // ██  REST API METHODS — Phase 3: Action Management
    // ════════════════════════════════════════════════════════════

    /**
     * List all dunning actions with pagination and filters.
     */
    async getActions(businessId: string, params: {
        page?: number;
        limit?: number;
        status?: string;
        dateFrom?: string;
        dateTo?: string;
        customerId?: string;
    }) {
        const page = params.page || 1;
        const limit = Math.min(params.limit || 25, 100);
        const offset = (page - 1) * limit;

        const where: any = { businessId };
        if (params.status) where.status = params.status;
        if (params.dateFrom || params.dateTo) {
            where.createdAt = {};
            if (params.dateFrom) where.createdAt.gte = new Date(params.dateFrom);
            if (params.dateTo) where.createdAt.lte = new Date(params.dateTo);
        }
        // If customerId, join through session
        if (params.customerId) {
            where.session = { customerId: params.customerId };
        }

        const [actions, total] = await Promise.all([
            p.debtCollectionAction.findMany({
                where,
                include: { session: { select: { customerId: true, customerName: true, externalInvoiceId: true } } },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset
            }),
            p.debtCollectionAction.count({ where })
        ]);

        return {
            data: actions,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
        };
    }

    /**
     * Retry a failed dunning action — re-dispatch to n8n.
     */
    async retryAction(businessId: string, actionId: string) {
        const action = await p.debtCollectionAction.findFirst({
            where: { id: actionId, businessId },
            include: { session: { include: { sequence: true } } }
        });
        if (!action) return { success: false, error: 'Action not found' };
        if (action.status !== 'failed') return { success: false, error: `Cannot retry action in ${action.status} state` };

        // Reset to queued
        await p.debtCollectionAction.update({
            where: { id: actionId },
            data: { status: 'queued', updatedAt: new Date() }
        });

        // Re-dispatch via processRecovery (which handles the n8n call)
        try {
            const session = (action as any).session;
            const result = await this.processRecovery({
                businessId,
                externalInvoiceId: action.externalInvoiceId,
                customerEmail: (session?.metadata as any)?.contactEmail || 'N/A',
                amount: (session?.metadata as any)?.amount || 0,
                currency: (session?.metadata as any)?.currency || 'USD',
                dueDate: new Date(),
                userId: 'system'
            });
            return { success: true, actionId, retryResult: result };
        } catch (err: any) {
            await p.debtCollectionAction.update({
                where: { id: actionId },
                data: { status: 'failed', metadata: { ...(action.metadata as any || {}), retryError: err.message } }
            });
            return { success: false, error: `Retry failed: ${err.message}` };
        }
    }

    /**
     * Get the complete recovery timeline for a specific invoice.
     */
    async getInvoiceTimeline(businessId: string, invoiceId: string) {
        const sessions = await p.debtCollectionSession.findMany({
            where: { businessId, externalInvoiceId: invoiceId },
            include: {
                sequence: { select: { name: true } },
                actions: { orderBy: { createdAt: 'asc' } }
            },
            orderBy: { createdAt: 'asc' }
        });

        if (sessions.length === 0) return null;

        const timeline: any[] = [];
        for (const session of sessions) {
            timeline.push({
                timestamp: session.createdAt,
                type: 'session_created',
                description: `Recovery started (Sequence: ${(session as any).sequence?.name || 'Unknown'})`,
                sessionId: session.id
            });

            for (const action of (session as any).actions) {
                timeline.push({
                    timestamp: action.createdAt,
                    type: `action_${action.status}`,
                    description: `${action.actionType} — ${action.status}`,
                    actionId: action.id,
                    sessionId: session.id,
                    metadata: action.metadata
                });
            }

            if (session.status !== 'ACTIVE') {
                timeline.push({
                    timestamp: session.updatedAt,
                    type: `session_${session.status.toLowerCase()}`,
                    description: `Session ${session.status.toLowerCase()}`,
                    sessionId: session.id
                });
            }
        }

        timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        return {
            invoiceId,
            customerName: sessions[0]?.customerName,
            customerId: sessions[0]?.customerId,
            totalSessions: sessions.length,
            currentStatus: sessions[sessions.length - 1]?.status,
            timeline
        };
    }

    // ════════════════════════════════════════════════════════════
    // ██  REST API METHODS — Phase 4: Analytics
    // ════════════════════════════════════════════════════════════

    /**
     * Full analytics overview for the business.
     */
    async getAnalyticsOverview(businessId: string) {
        const [
            activeSessions,
            recoveredSessions,
            terminatedSessions,
            totalSessions,
            actionStats,
            recentRecovered
        ] = await Promise.all([
            p.debtCollectionSession.count({ where: { businessId, status: 'ACTIVE' } }),
            p.debtCollectionSession.count({ where: { businessId, status: 'RECOVERED' } }),
            p.debtCollectionSession.count({ where: { businessId, status: 'TERMINATED' } }),
            p.debtCollectionSession.count({ where: { businessId } }),
            p.debtCollectionAction.groupBy({
                by: ['status'],
                where: { businessId },
                _count: true
            }),
            p.debtCollectionSession.findMany({
                where: { businessId, status: 'RECOVERED' },
                select: { metadata: true, updatedAt: true },
                orderBy: { updatedAt: 'desc' },
                take: 30
            })
        ]);

        // ==========================================
        // MICROSERVICE: ABSOLUTE DASHBOARD TRUTH
        // ==========================================
        // Ghost Defeater: Compute explicitly via PostgreSQL relational float bounds, ignoring primitive JSON states.
        const allSessions = await p.debtCollectionSession.findMany({
            where: { businessId, status: { in: ['ACTIVE', 'RECOVERED'] } },
            select: { externalInvoiceId: true }
        });
        const sessionInvoiceIds = allSessions.map(s => s.externalInvoiceId);

        let totalRecovered = 0;
        if (sessionInvoiceIds.length > 0) {
            const sessionInvoices = await p.debtCollectionInvoice.findMany({
                where: { businessId, externalId: { in: sessionInvoiceIds } },
                select: { amount: true, balance: true }
            });
            totalRecovered = sessionInvoices.reduce((acc, inv) => {
                const diff = (inv.amount || 0) - (inv.balance || 0);
                return acc + Math.max(0, diff);
            }, 0);
        }

        // Build action stats map
        const actionStatsMap: any = { total: 0, sent: 0, failed: 0, queued: 0, skipped: 0 };
        for (const stat of actionStats) {
            actionStatsMap[stat.status] = (stat as any)._count;
            actionStatsMap.total += (stat as any)._count;
        }

        const recoveryRate = totalSessions > 0 ? (recoveredSessions / totalSessions) * 100 : 0;

        // 7-day trend (simplified)
        const trend: any[] = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dayStr = date.toISOString().split('T')[0];
            const dayStart = new Date(`${dayStr}T00:00:00Z`);
            const dayEnd = new Date(`${dayStr}T23:59:59Z`);

            const [recovered, newOverdue] = await Promise.all([
                p.debtCollectionSession.count({
                    where: { businessId, status: 'RECOVERED', updatedAt: { gte: dayStart, lte: dayEnd } }
                }),
                p.debtCollectionSession.count({
                    where: { businessId, createdAt: { gte: dayStart, lte: dayEnd } }
                })
            ]);
            trend.push({ date: dayStr, recovered, newOverdue });
        }

        return {
            recoveryRate: Math.round(recoveryRate * 10) / 10,
            totalRecovered,
            totalOutstanding: activeSessions,
            activeSessions,
            recoveredSessions,
            terminatedSessions,
            totalSessions,
            actionStats: actionStatsMap,
            trend
        };
    }

    /**
     * Recovery rate trend over a period (daily resolution).
     */
    async getRecoveryRateTrend(businessId: string, days: number = 30) {
        const trend: any[] = [];
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dayStr = date.toISOString().split('T')[0];
            const dayEnd = new Date(`${dayStr}T23:59:59Z`);

            const [total, recovered] = await Promise.all([
                p.debtCollectionSession.count({ where: { businessId, createdAt: { lte: dayEnd } } }),
                p.debtCollectionSession.count({ where: { businessId, status: 'RECOVERED', updatedAt: { lte: dayEnd } } })
            ]);

            trend.push({
                date: dayStr,
                total,
                recovered,
                rate: total > 0 ? Math.round((recovered / total) * 1000) / 10 : 0
            });
        }
        return { businessId, days, trend };
    }

    // ════════════════════════════════════════════════════════════
    // ██  REST API METHODS — Phase 5: External Events
    // ════════════════════════════════════════════════════════════

    /**
     * Handle payment callback from ERP.
     * Auto-closes the recovery session for the paid invoice.
     */
    async handlePaymentCallback(businessId: string, payload: {
        invoiceId: string;
        paymentAmount: number;
        paymentDate?: string;
        source?: string;
    }) {
        const { invoiceId, paymentAmount, paymentDate, source } = payload;

        const session = await p.debtCollectionSession.findFirst({
            where: { businessId, externalInvoiceId: invoiceId, status: 'ACTIVE' }
        });

        if (!session) {
            // Check if PAUSED
            const pausedSession = await p.debtCollectionSession.findFirst({
                where: { businessId, externalInvoiceId: invoiceId, status: 'PAUSED' }
            });
            if (pausedSession) {
                await p.debtCollectionSession.update({
                    where: { id: pausedSession.id },
                    data: {
                        status: 'RECOVERED',
                        nextActionAt: null,
                        metadata: {
                            ...(pausedSession.metadata as any || {}),
                            recoveredAmount: paymentAmount,
                            recoveredAt: paymentDate || new Date().toISOString(),
                            recoverySource: source || 'payment_callback'
                        },
                        updatedAt: new Date()
                    }
                });
                logger.info({ invoiceId, businessId, amount: paymentAmount }, '💰 [Recovery API] Payment received — paused session recovered');
                
                await notificationService.notifyBusiness(
                    businessId,
                    'success',
                    'Payment Received & Recovered',
                    `Payment of $${paymentAmount} received for Invoice #${invoiceId}. Session fully recovered.`,
                    'recoveryAction',
                    `/dashboard/recovery/activity`
                );

                return { success: true, invoiceId, status: 'RECOVERED', sessionId: pausedSession.id };
            }

            // Idempotency: If session already RECOVERED or TERMINATED, return success (not an error)
            const terminalSession = await p.debtCollectionSession.findFirst({
                where: { businessId, externalInvoiceId: invoiceId, status: { in: ['RECOVERED', 'TERMINATED'] } }
            });
            if (terminalSession) {
                logger.info({ invoiceId, businessId, status: terminalSession.status }, '💰 [Recovery API] Payment callback — session already in terminal state (idempotent)');
                return { success: true, invoiceId, status: terminalSession.status, sessionId: terminalSession.id, alreadyRecovered: true };
            }

            return { success: false, error: 'No active/paused/terminal session found for invoice' };
        }

        await p.debtCollectionSession.update({
            where: { id: session.id },
            data: {
                status: 'RECOVERED',
                nextActionAt: null,
                metadata: {
                    ...(session.metadata as any || {}),
                    recoveredAmount: paymentAmount,
                    recoveredAt: paymentDate || new Date().toISOString(),
                    recoverySource: source || 'payment_callback'
                },
                updatedAt: new Date()
            }
        });

        logger.info({ invoiceId, businessId, amount: paymentAmount }, '💰 [Recovery API] Payment received — session recovered');
        
        await notificationService.notifyBusiness(
            businessId,
            'success',
            'Payment Received & Recovered',
            `Payment of $${paymentAmount} received for Invoice #${invoiceId}. Session successfully recovered.`,
            'recoveryAction',
            `/dashboard/recovery/activity`
        );

        return { success: true, invoiceId, status: 'RECOVERED', sessionId: session.id };
    }

    /**
     * AI-powered (rule-based) risk scoring for an invoice.
     * Uses: days overdue, amount, payment history, sequence step.
     */
    async analyzeInvoiceRisk(businessId: string, invoiceId: string) {
        const session = await p.debtCollectionSession.findFirst({
            where: { businessId, externalInvoiceId: invoiceId },
            include: { sequence: true, actions: true },
            orderBy: { createdAt: 'desc' }
        });

        // Base risk factors
        const factors: any[] = [];
        let riskScore = 0;

        const amount = (session?.metadata as any)?.amount || 0;
        const dueDate = (session?.metadata as any)?.dueDate ? new Date((session.metadata as any).dueDate) : null;
        const daysOverdue = dueDate ? Math.max(0, Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24))) : 0;
        const failedActions = session ? (session as any).actions.filter((a: any) => a.status === 'failed').length : 0;
        const totalActions = session ? (session as any).actions.length : 0;

        // Factor 1: Days overdue (max 30 pts)
        const daysScore = Math.min(daysOverdue * 0.5, 30);
        factors.push({ name: 'Days Overdue', impact: daysScore, description: `${daysOverdue} days past due date` });
        riskScore += daysScore;

        // Factor 2: Amount (max 20 pts)
        const amountScore = amount > 10000 ? 20 : amount > 5000 ? 15 : amount > 1000 ? 10 : 5;
        factors.push({ name: 'Outstanding Amount', impact: amountScore, description: `$${amount} outstanding` });
        riskScore += amountScore;

        // Factor 3: Failed actions (max 25 pts)
        const failScore = failedActions > 3 ? 25 : failedActions * 7;
        factors.push({ name: 'Communication Failures', impact: failScore, description: `${failedActions}/${totalActions} actions failed` });
        riskScore += failScore;

        // Factor 4: Step progression (max 15 pts)
        const stepIdx = session?.currentStepIndex || 0;
        const totalSteps = (session?.sequence?.steps as any[])?.length || 1;
        const stepScore = (stepIdx / totalSteps) * 15;
        factors.push({ name: 'Escalation Level', impact: Math.round(stepScore), description: `Step ${stepIdx + 1}/${totalSteps}` });
        riskScore += stepScore;

        // Factor 5: No session exists (max 10 pts)
        if (!session) {
            factors.push({ name: 'No Recovery Session', impact: 10, description: 'Invoice has no active recovery tracking' });
            riskScore += 10;
        }

        riskScore = Math.min(Math.round(riskScore), 100);

        const riskLevel = riskScore >= 70 ? 'critical' : riskScore >= 50 ? 'high' : riskScore >= 30 ? 'medium' : 'low';

        if (riskLevel === 'critical' || riskLevel === 'high') {
            await notificationService.notifyBusiness(
                businessId,
                'warning',
                'High Risk Invoice Detected',
                `A ${riskLevel} risk of default was detected for Invoice #${invoiceId} (Score: ${riskScore}/100).`,
                'recoveryAlert',
                `/dashboard/recovery/customers`
            );
        }

        const recommendedAction = riskLevel === 'critical'
            ? 'Immediate phone call + collection agency escalation'
            : riskLevel === 'high'
                ? 'Escalate to next step + personal follow-up email'
                : riskLevel === 'medium'
                    ? 'Continue automated sequence + monitor'
                    : 'Automated sequence sufficient';

        return {
            invoiceId,
            riskLevel,
            riskScore,
            factors,
            recommendedAction,
            estimatedRecoveryProbability: Math.max(0, 100 - riskScore),
            currentSession: session ? {
                id: session.id,
                status: session.status,
                step: `${session.currentStepIndex + 1}/${totalSteps}`,
                actionsCount: totalActions,
                failedActions
            } : null
        };
    }

    // ════════════════════════════════════════════════════════════
    // ██  REST API METHODS — Phase 6: Bulk Operations
    // ════════════════════════════════════════════════════════════

    /**
     * Bulk pause/resume/terminate sessions.
     */
    async bulkAction(businessId: string, action: 'pause' | 'resume' | 'terminate', sessionIds: string[]) {
        const results = { affected: 0, errors: [] as any[] };

        for (const id of sessionIds) {
            try {
                let result;
                switch (action) {
                    case 'pause':
                        result = await this.pauseSession(businessId, id);
                        break;
                    case 'resume':
                        result = await this.resumeSession(businessId, id);
                        break;
                    case 'terminate':
                        result = await this.terminateSession(businessId, id, 'bulk_action');
                        break;
                }
                if (result.success) {
                    results.affected++;
                } else {
                    results.errors.push({ sessionId: id, error: result.error });
                }
            } catch (err: any) {
                results.errors.push({ sessionId: id, error: err.message });
            }
        }

        logger.info({ businessId, action, affected: results.affected, errors: results.errors.length },
            '📦 [Recovery API] Bulk action completed');
        return { success: true, ...results };
    }

    /**
     * Export recovery data as CSV.
     */
    async exportCsv(businessId: string, type: 'sessions' | 'actions' | 'analytics' = 'sessions') {
        if (type === 'sessions') {
            const sessions = await p.debtCollectionSession.findMany({
                where: { businessId },
                include: { sequence: { select: { name: true } }, actions: { select: { status: true } } },
                orderBy: { createdAt: 'desc' }
            });

            const header = 'Invoice ID,Customer Name,Customer ID,Status,Sequence,Step,Actions Total,Actions Sent,Actions Failed,Created At,Updated At\n';
            const rows = sessions.map((s: any) => {
                const sent = s.actions.filter((a: any) => a.status === 'sent').length;
                const failed = s.actions.filter((a: any) => a.status === 'failed').length;
                return `${s.externalInvoiceId},"${s.customerName || ''}",${s.customerId || ''},${s.status},${s.sequence?.name || ''},${s.currentStepIndex},${s.actions.length},${sent},${failed},${s.createdAt.toISOString()},${s.updatedAt.toISOString()}`;
            }).join('\n');

            return header + rows;
        }

        if (type === 'actions') {
            const actions = await p.debtCollectionAction.findMany({
                where: { businessId },
                include: { session: { select: { customerName: true, customerId: true } } },
                orderBy: { createdAt: 'desc' }
            });

            const header = 'Action ID,Invoice ID,Customer,Type,Status,Sent At,Created At\n';
            const rows = actions.map((a: any) =>
                `${a.id},${a.externalInvoiceId},"${a.session?.customerName || ''}",${a.actionType},${a.status},${a.sentAt?.toISOString() || ''},${a.createdAt.toISOString()}`
            ).join('\n');

            return header + rows;
        }

        return '';
    }

    // ════════════════════════════════════════════════════════════
    // ██  ORCHESTRATION LAYER — Production-Grade Multi-Tenant
    // ════════════════════════════════════════════════════════════

    /**
     * ORCHESTRATOR: Fan-out per-tenant recovery jobs.
     * 
     * Called every 15 minutes by BullMQ cron. For each tenant with active
     * dunning sequences, queues TWO jobs:
     *   1. recovery:tenant-sync   — refresh overdue invoices from ERP
     *   2. recovery:tenant-process — process all due sessions
     * 
     * Jobs are staggered by 500ms per tenant to prevent thundering herd.
     * Deduplication via jobId prevents double-processing.
     * 
     * @returns cycle metrics
     */
    async orchestrate() {
        const cycleId = `orch-${Date.now()}`;
        const cycleStart = Date.now();

        console.log(`\n╔══════════════════════════════════════════════════════════════════╗`);
        console.log(`║  🔄 RECOVERY ORCHESTRATOR — Cycle ${cycleId}`);
        console.log(`║  Time: ${new Date().toISOString()}`);
        console.log(`╚══════════════════════════════════════════════════════════════════╝\n`);

        const { createQueue, QUEUES } = await import('../../lib/queue');
        const recoveryQueue = createQueue(QUEUES.RECOVERY_ENGINE);

        // 1. Find all tenants with active dunning sequences
        const activeSequences = await p.debtCollectionSequence.findMany({
            where: { 
                isActive: true,
                business: {
                    integrations: {
                        some: { provider: 'quickbooks', status: 'connected' }
                    }
                }
            },
            include: { 
                business: {
                    select: { metadata: true, id: true }
                }
            }
        });
        
        // Sort by priority found in metadata (Enterprise > Professional > Free)
        const sortedTenants = activeSequences.sort((a, b) => {
            const getScore = (seq: any) => {
                const meta = seq.business?.metadata as any;
                if (!meta) return 1;
                const tier = (meta.tier || meta.subscriptionTier || 'FREE').toUpperCase();
                const tierScore: any = { 'ENTERPRISE': 10, 'PROFESSIONAL': 5, 'PREMIUM': 8, 'FREE': 1 };
                return tierScore[tier] || 1;
            };
            return getScore(b) - getScore(a);
        });

        const tenantIds = Array.from(new Set(sortedTenants.map((s: any) => s.businessId))) as string[];

        if (tenantIds.length === 0) {
            console.log(`[Orchestrator] ⚠️ No tenants with active sequences. Skipping cycle.`);
            return { cycleId, tenants: 0, queued: 0, skipped: 0, duration: Date.now() - cycleStart };
        }

        console.log(`[Orchestrator] Found ${tenantIds.length} tenant(s) with active sequences`);

        // 2. Check for already-running tenant jobs (deduplication)
        const activeJobs = await recoveryQueue.getActive();
        const waitingJobs = await recoveryQueue.getWaiting();
        const runningTenants = new Set<string>();
        for (const job of [...activeJobs, ...waitingJobs]) {
            if ((job.name === 'recovery:tenant-sync' || job.name === 'recovery:tenant-process') && job.data?.businessId) {
                runningTenants.add(job.data.businessId);
            }
        }

        // 3. Fan out per-tenant jobs with staggered delays
        let queued = 0;
        let skipped = 0;
        const STAGGER_MS = 500; // 500ms between each tenant

        for (let i = 0; i < tenantIds.length; i++) {
            const bizId = tenantIds[i];

            if (runningTenants.has(bizId)) {
                console.log(`[Orchestrator] ⏭️ Tenant ${bizId.substring(0, 8)}… already processing — skipped`);
                skipped++;
                continue;
            }

            const delay = i * STAGGER_MS;

            // Queue tenant-sync (ERP data refresh)
            const priority = i < 10 ? 1 : 10; // First 10 get higher priority (lower number)
            
            await recoveryQueue.add('recovery:tenant-sync', { businessId: bizId, cycleId }, {
                delay,
                priority,
                jobId: `tenant-sync-${bizId}-${cycleId}`,
                removeOnComplete: { age: 3600 },
                removeOnFail: { age: 86400 }
            });

            // Queue tenant-process (due session processing) — after sync completes
            await recoveryQueue.add('recovery:tenant-process', { businessId: bizId, cycleId }, {
                delay: delay + 5000, // 5s after sync starts (gives ERP time to respond)
                priority,
                jobId: `tenant-process-${bizId}-${cycleId}`,
                removeOnComplete: { age: 3600 },
                removeOnFail: { age: 86400 }
            });

            queued++;
            console.log(`[Orchestrator] ✅ Queued tenant ${bizId.substring(0, 8)}… (delay: ${delay}ms)`);
        }

        const duration = Date.now() - cycleStart;
        console.log(`\n[Orchestrator] ── Cycle Complete ──`);
        console.log(`[Orchestrator]   Tenants: ${tenantIds.length} | Queued: ${queued} | Skipped: ${skipped} | Duration: ${duration}ms\n`);

        logger.info({
            cycleId,
            tenants: tenantIds.length,
            queued,
            skipped,
            duration
        }, '🔄 [Orchestrator] Cycle complete');

        return { cycleId, tenants: tenantIds.length, queued, skipped, duration };
    }

    /**
     * PER-TENANT SYNC: Refresh overdue invoice data from ERP.
     * Called by the orchestrator for each individual tenant.
     * Tenant failure is isolated — doesn't block other tenants.
     */
    async tenantSync(businessId: string, cycleId: string) {
        const start = Date.now();
        console.log(`[TenantSync] ▶ ${businessId.substring(0, 8)}… — syncing ERP data`);

        try {
            const result = await this.syncOverdueInvoices(businessId);

            // Auto-cluster customers based on LTV, risk, payment frequency
            // Non-fatal: clustering errors must not block the sync cycle
            try {
                const { clusteringService } = await import('./clustering.service');
                const clusterResult = await clusteringService.clusterBusiness(businessId);
                console.log(`[TenantSync] 🎯 Clustering: ${clusterResult.clustered} assigned, ${clusterResult.skipped} skipped`);
            } catch (clusterErr: any) {
                logger.warn({ businessId, err: clusterErr.message }, '[TenantSync] Clustering failed (non-fatal)');
            }

            const duration = Date.now() - start;
            console.log(`[TenantSync] ✅ ${businessId.substring(0, 8)}… — ${JSON.stringify(result)} (${duration}ms)`);
            logger.info({ businessId, cycleId, result, duration }, '[TenantSync] ERP sync complete');
            return { success: true, businessId, result, duration };
        } catch (err: any) {
            const duration = Date.now() - start;
            const errMsg = err.message || String(err);

            // Classify error type for operator visibility
            let errorType = 'unknown';
            if (errMsg.includes('token') || errMsg.includes('OAuth') || errMsg.includes('401') || errMsg.includes('unauthorized') || errMsg.includes('refresh')) {
                errorType = 'oauth_expired';
                console.log(`[TenantSync] ⚠️🔑 ${businessId.substring(0, 8)}… — OAuth token likely expired. User must reconnect QuickBooks.`);
                logger.warn({ businessId, cycleId, errorType, duration }, '[TenantSync] OAuth token expired — user must reconnect ERP');
            } else if (errMsg.includes('ECONNREFUSED') || errMsg.includes('ETIMEDOUT') || errMsg.includes('503')) {
                errorType = 'api_unavailable';
                console.log(`[TenantSync] ⚠️🌐 ${businessId.substring(0, 8)}… — ERP API unavailable (${duration}ms)`);
            } else {
                console.log(`[TenantSync] ❌ ${businessId.substring(0, 8)}… — ${errMsg} (${duration}ms)`);
            }

            logger.error({ businessId, cycleId, err: errMsg, errorType, duration }, '[TenantSync] ERP sync failed');
            return { success: false, businessId, error: errMsg, errorType, duration };
        }
    }

    /**
     * PER-TENANT PROCESS: Process all due recovery sessions for one tenant.
     * Finds sessions with nextActionAt <= NOW, batches per customer, dispatches to n8n.
     * Called by the orchestrator for each individual tenant.
     */
    async tenantProcess(businessId: string, cycleId: string) {
        const start = Date.now();
        console.log(`[TenantProcess] ▶ ${businessId.substring(0, 8)}… — processing due sessions`);

        try {
            // Find sessions due for action
            const dueSessions = await p.debtCollectionSession.findMany({
                where: {
                    businessId,
                    status: 'ACTIVE',
                    nextActionAt: { lte: new Date() }
                },
                include: { sequence: true }
            });

            if (dueSessions.length === 0) {
                const duration = Date.now() - start;
                console.log(`[TenantProcess] ⏸️ ${businessId.substring(0, 8)}… — 0 sessions due (${duration}ms)`);
                return { success: true, businessId, processed: 0, duration };
            }

            console.log(`[TenantProcess] 📋 ${businessId.substring(0, 8)}… — ${dueSessions.length} sessions due`);

            // Batch by customer
            const customerBatches = new Map<string, typeof dueSessions>();
            for (const session of dueSessions) {
                const custId = session.customerId || 'unknown';
                if (!customerBatches.has(custId)) customerBatches.set(custId, []);
                customerBatches.get(custId)!.push(session);
            }

            // Process each customer batch via existing processBusinessOverdues
            const result = await this.processBusinessOverdues(businessId);
            const duration = Date.now() - start;

            console.log(`[TenantProcess] ✅ ${businessId.substring(0, 8)}… — ${dueSessions.length} sessions, ${customerBatches.size} customers (${duration}ms)`);
            logger.info({
                businessId, cycleId, dueSessions: dueSessions.length,
                customers: customerBatches.size, result, duration
            }, '[TenantProcess] Processing complete');

            return { success: true, businessId, processed: dueSessions.length, customers: customerBatches.size, result, duration };
        } catch (err: any) {
            const duration = Date.now() - start;
            console.log(`[TenantProcess] ❌ ${businessId.substring(0, 8)}… — ${err.message} (${duration}ms)`);
            logger.error({ businessId, cycleId, err: err.message, duration }, '[TenantProcess] Processing failed');
            return { success: false, businessId, error: err.message, duration };
        }
    }

    /**
     * Queue health monitoring — returns metrics for the recovery queue.
     */
    async getQueueHealth() {
        const { createQueue, QUEUES } = await import('../../lib/queue');
        const recoveryQueue = createQueue(QUEUES.RECOVERY_ENGINE);

        const [waiting, active, completed, failed, delayed, repeatableJobs] = await Promise.all([
            recoveryQueue.getWaitingCount(),
            recoveryQueue.getActiveCount(),
            recoveryQueue.getCompletedCount(),
            recoveryQueue.getFailedCount(),
            recoveryQueue.getDelayedCount(),
            recoveryQueue.getRepeatableJobs()
        ]);

        // Get recent failed jobs for debugging
        const recentFailed = await recoveryQueue.getFailed(0, 5);
        const failedDetails = recentFailed.map((j: any) => ({
            id: j.id,
            name: j.name,
            failedReason: j.failedReason,
            timestamp: j.timestamp,
            data: { businessId: j.data?.businessId }
        }));

        return {
            queue: QUEUES.RECOVERY_ENGINE,
            counts: { waiting, active, completed, failed, delayed },
            scheduledJobs: repeatableJobs.map((j: any) => ({
                name: j.name,
                id: j.id,
                pattern: j.pattern,
                next: j.next ? new Date(j.next).toISOString() : null
            })),
            recentFailures: failedDetails,
            timestamp: new Date().toISOString()
        };
    }
}
