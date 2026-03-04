/**
 * purge-stale-sessions.ts
 * 
 * PURPOSE: Removes all recovery sessions that are no longer overdue in QB.
 * The audit showed QB has 0 overdue invoices but DB has 89 stale sessions.
 * 
 * Usage: npx ts-node src/scripts/purge-stale-sessions.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const p = prisma as any;

async function main() {
    console.log('🧹 Purging stale recovery sessions...\n');

    // 1. Get current QB overdue invoice IDs
    const integration = await p.integration.findFirst({
        where: { provider: 'quickbooks', status: 'connected' }
    });

    let qbInvoiceIds: string[] = [];
    if (integration) {
        try {
            const { QBOProvider } = await import('../services/integrations/providers/quickbooks.provider');
            const provider = new QBOProvider();
            await provider.initialize(integration);
            const overdueInvoices = await provider.getOverdueInvoices(0);
            qbInvoiceIds = overdueInvoices.map((inv: any) => inv.externalId);
            console.log(`📊 QB currently has ${qbInvoiceIds.length} overdue invoices`);
        } catch (err: any) {
            console.log(`⚠️  QB query failed: ${err.message}`);
        }
    }

    // 2. Find all DB sessions
    const allSessions = await p.debtCollectionSession.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, externalInvoiceId: true }
    });
    console.log(`📊 DB has ${allSessions.length} ACTIVE sessions`);

    // 3. Identify stale sessions (not in current QB overdue list)
    const staleSessionIds = allSessions
        .filter((s: any) => !qbInvoiceIds.includes(s.externalInvoiceId))
        .map((s: any) => s.id);

    console.log(`🔍 ${staleSessionIds.length} sessions are stale (invoice no longer overdue in QB)`);

    if (staleSessionIds.length === 0) {
        console.log('✅ No stale sessions to purge!');
        return;
    }

    // 4. Mark stale sessions as RECOVERED (not delete — preserve audit trail)
    const updated = await p.debtCollectionSession.updateMany({
        where: { id: { in: staleSessionIds } },
        data: { status: 'RECOVERED', updatedAt: new Date() }
    });
    console.log(`✅ Marked ${updated.count} sessions as RECOVERED`);

    // 5. Remaining active
    const remaining = await p.debtCollectionSession.count({ where: { status: 'ACTIVE' } });
    console.log(`📊 ${remaining} ACTIVE sessions remaining (should match QB overdue count: ${qbInvoiceIds.length})`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
