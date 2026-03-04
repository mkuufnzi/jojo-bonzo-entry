const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
    try {
        const recovered = await p.debtCollectionSession.findMany({
            where: { status: 'RECOVERED' },
            select: { id: true, externalInvoiceId: true, metadata: true }
        });
        console.log(`Found ${recovered.length} RECOVERED session(s)`);

        for (const sess of recovered) {
            // Check DebtCollectionAction for original amount
            const actions = await p.debtCollectionAction.findMany({
                where: { sessionId: sess.id },
                select: { id: true, metadata: true },
                orderBy: { createdAt: 'asc' },
                take: 1
            });

            console.log(`\nSession ${sess.id} (inv ${sess.externalInvoiceId}):`);
            console.log(`  Session metadata:`, JSON.stringify(sess.metadata));
            if (actions.length > 0) {
                console.log(`  Action metadata:`, JSON.stringify(actions[0].metadata));
            } else {
                console.log(`  No actions found`);
            }

            // Check state history for amount info
            const history = await p.debtCollectionStateHistory.findMany({
                where: { sessionId: sess.id },
                select: { reason: true, previousStatus: true, newStatus: true, createdAt: true }
            });
            console.log(`  State history:`, JSON.stringify(history, null, 2));
        }
    } finally {
        await p.$disconnect();
    }
})();
