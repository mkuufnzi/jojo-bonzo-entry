/**
 * cleanup-duplicate-sessions.ts
 * 
 * PURPOSE: Removes duplicate DebtCollectionSession records where the same invoice 
 * has sessions across MULTIPLE sequences.
 * 
 * QB has 44 invoices. Each should have at most ONE active session in any sequence.
 * The sync created sessions for the same invoice under both "Test" and "Smart Recovery" 
 * sequences due to the findApplicableSequence fallback.
 * 
 * STRATEGY: Group by externalInvoiceId only. Keep the OLDEST session, delete the rest.
 * 
 * Usage: npx ts-node src/scripts/cleanup-duplicate-sessions.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const p = prisma as any;

async function main() {
    console.log('🔍 Scanning for cross-sequence duplicate recovery sessions...\n');

    const allSessions = await p.debtCollectionSession.findMany({
        orderBy: { createdAt: 'asc' },
        select: { id: true, externalInvoiceId: true, businessId: true, sequenceId: true, status: true, createdAt: true }
    });

    // Group by externalInvoiceId ONLY (not by businessId::invoiceId)
    const sessionsByInvoice = new Map<string, any[]>();
    for (const session of allSessions) {
        const key = session.externalInvoiceId;
        if (!sessionsByInvoice.has(key)) {
            sessionsByInvoice.set(key, []);
        }
        sessionsByInvoice.get(key)!.push(session);
    }

    let duplicateCount = 0;
    const idsToDelete: string[] = [];

    for (const [invoiceId, sessions] of sessionsByInvoice.entries()) {
        if (sessions.length > 1) {
            const [keep, ...dupes] = sessions;
            console.log(`  📋 Invoice ${invoiceId}: keeping session ${keep.id} (seq: ${keep.sequenceId}), deleting ${dupes.length} cross-sequence duplicate(s)`);
            for (const dupe of dupes) {
                idsToDelete.push(dupe.id);
                duplicateCount++;
            }
        }
    }

    console.log(`\n📊 Summary: ${allSessions.length} total sessions, ${duplicateCount} cross-sequence duplicates found across ${sessionsByInvoice.size} unique invoices`);

    if (idsToDelete.length === 0) {
        console.log('✅ No duplicates to clean up!');
        return;
    }

    // Delete associated DebtCollectionActions first (FK constraint)
    const deletedActions = await p.debtCollectionAction.deleteMany({
        where: { sessionId: { in: idsToDelete } }
    });
    console.log(`🗑️  Deleted ${deletedActions.count} orphaned DebtCollectionAction(s)`);

    // Delete duplicate sessions
    const deletedSessions = await p.debtCollectionSession.deleteMany({
        where: { id: { in: idsToDelete } }
    });
    console.log(`🗑️  Deleted ${deletedSessions.count} duplicate DebtCollectionSession(s)`);

    // Verify
    const remaining = await p.debtCollectionSession.count();
    console.log(`\n✅ Cleanup complete. ${remaining} sessions remaining (should be ~44).`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
