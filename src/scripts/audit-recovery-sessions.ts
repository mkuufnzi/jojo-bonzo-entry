/**
 * audit-recovery-sessions.ts
 * 
 * PURPOSE: Audit the recovery session count against actual QB invoice count.
 * Identifies duplicates and reports the breakdown per customer and per sequence.
 * 
 * Usage: npx ts-node src/scripts/audit-recovery-sessions.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const p = prisma as any;

async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Floovioo Recovery Session Audit');
    console.log('═══════════════════════════════════════════════════════════\n');

    // 1. Count DB sessions
    const allSessions = await p.debtCollectionSession.findMany({
        select: {
            id: true,
            externalInvoiceId: true,
            businessId: true,
            customerId: true,
            customerName: true,
            sequenceId: true,
            status: true,
            currentStepIndex: true,
            createdAt: true,
            sequence: { select: { name: true } }
        },
        orderBy: { createdAt: 'asc' }
    });

    const activeSessions = allSessions.filter((s: any) => s.status === 'ACTIVE');
    const terminatedSessions = allSessions.filter((s: any) => s.status === 'TERMINATED');
    const otherSessions = allSessions.filter((s: any) => !['ACTIVE', 'TERMINATED'].includes(s.status));

    console.log(`📊 Total sessions in DB: ${allSessions.length}`);
    console.log(`   ├─ ACTIVE:     ${activeSessions.length}`);
    console.log(`   ├─ TERMINATED: ${terminatedSessions.length}`);
    console.log(`   └─ Other:      ${otherSessions.length}\n`);

    // 2. Unique invoice IDs
    const uniqueInvoiceIds = new Set(allSessions.map((s: any) => s.externalInvoiceId));
    console.log(`📋 Unique externalInvoiceIds: ${uniqueInvoiceIds.size}`);
    console.log(`   → If QB has 44 invoices and DB has ${uniqueInvoiceIds.size} unique IDs, ${uniqueInvoiceIds.size === 44 ? '✅ MATCH' : '❌ MISMATCH'}\n`);

    // 3. Sessions per customer
    const byCustomer = new Map<string, any[]>();
    for (const s of allSessions) {
        const key = s.customerName || s.customerId || 'Unknown';
        if (!byCustomer.has(key)) byCustomer.set(key, []);
        byCustomer.get(key)!.push(s);
    }

    console.log(`👥 Sessions by customer:`);
    for (const [customer, sessions] of byCustomer.entries()) {
        const activeCount = sessions.filter((s: any) => s.status === 'ACTIVE').length;
        const uniqueInvs = new Set(sessions.map((s: any) => s.externalInvoiceId));
        console.log(`   ${customer}: ${sessions.length} sessions (${activeCount} active) | ${uniqueInvs.size} unique invoices`);
    }

    // 4. Sessions per sequence
    console.log(`\n📂 Sessions by sequence:`);
    const bySequence = new Map<string, any[]>();
    for (const s of allSessions) {
        const key = s.sequence?.name || s.sequenceId;
        if (!bySequence.has(key)) bySequence.set(key, []);
        bySequence.get(key)!.push(s);
    }
    for (const [seq, sessions] of bySequence.entries()) {
        console.log(`   ${seq}: ${sessions.length} sessions`);
    }

    // 5. Cross-sequence duplicates (same invoiceId in multiple sequences)
    const invoiceToSequences = new Map<string, Set<string>>();
    for (const s of allSessions) {
        const invId = s.externalInvoiceId;
        if (!invoiceToSequences.has(invId)) invoiceToSequences.set(invId, new Set());
        invoiceToSequences.get(invId)!.add(s.sequence?.name || s.sequenceId);
    }

    const crossSeqDupes = [...invoiceToSequences.entries()].filter(([_, seqs]) => seqs.size > 1);
    console.log(`\n🔍 Cross-sequence duplicates: ${crossSeqDupes.length} invoices in multiple sequences`);
    if (crossSeqDupes.length > 0) {
        for (const [invId, seqs] of crossSeqDupes.slice(0, 5)) {
            console.log(`   Invoice ${invId}: in ${[...seqs].join(', ')}`);
        }
        if (crossSeqDupes.length > 5) console.log(`   ... and ${crossSeqDupes.length - 5} more`);
    }

    // 6. Try QB integration to compare
    console.log('\n🔗 Checking QuickBooks integration...');
    const integration = await p.integration.findFirst({
        where: { provider: 'quickbooks', status: 'connected' }
    });

    if (integration) {
        try {
            const { QBOProvider } = await import('../services/integrations/providers/quickbooks.provider');
            const provider = new QBOProvider();
            await provider.initialize(integration);
            const overdueInvoices = await provider.getOverdueInvoices(0);
            console.log(`   QB overdue invoices: ${overdueInvoices.length}`);
            console.log(`   DB sessions:         ${allSessions.length}`);
            console.log(`   DB unique invoices:  ${uniqueInvoiceIds.size}`);
            console.log(`   Ratio:               ${(allSessions.length / overdueInvoices.length).toFixed(1)}x`);

            if (allSessions.length > overdueInvoices.length) {
                const excess = allSessions.length - overdueInvoices.length;
                console.log(`\n   ⚠️  ${excess} EXCESS sessions found (${allSessions.length} - ${overdueInvoices.length})`);
                console.log(`   → This confirms cross-sequence duplication or stale sessions`);
            }
        } catch (qbErr: any) {
            console.log(`   ❌ QB query failed: ${qbErr.message}`);
        }
    } else {
        console.log('   ⚠️  No connected QB integration found');
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  Audit Complete');
    console.log('═══════════════════════════════════════════════════════════');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
