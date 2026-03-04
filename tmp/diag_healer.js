const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function diagnose() {
    try {
        const businessId = '8bc0766d-b529-4f82-808f-63d4b9c85d39'; // from logs
        
        const corruptedSessions = await p.debtCollectionSession.findMany({
            where: { businessId, status: 'RECOVERED' },
            select: { id: true, externalInvoiceId: true, metadata: true }
        });
        
        console.log(`[Diagnostic] Found ${corruptedSessions.length} RECOVERED sessions`);
        
        if (corruptedSessions.length > 0) {
            const corruptedInvoiceIds = corruptedSessions.map(s => s.externalInvoiceId);
            const zeroAmountInvoices = await p.debtCollectionInvoice.findMany({
                where: { businessId, externalId: { in: corruptedInvoiceIds } },
                select: { externalId: true, amount: true, balance: true }
            });
            console.log(`[Diagnostic] Corrupted invoices check:`);
            console.log(JSON.stringify(zeroAmountInvoices, null, 2));

            // Also check the recovery stats calculation directly
            const invoiceAmountMap = new Map();
            for (const inv of zeroAmountInvoices) {
                invoiceAmountMap.set(inv.externalId, { amount: inv.amount || 0, balance: inv.balance || 0 });
            }

            let recoveredAmount = 0;
            for (const sess of corruptedSessions) {
                const inv = invoiceAmountMap.get(sess.externalInvoiceId);
                let invoiceAmount = inv?.amount || 0;
                const invoiceBalance = inv?.balance || 0;

                let source = 'invoice table';
                if (invoiceAmount === 0 && sess.metadata?.amount) {
                    invoiceAmount = parseFloat(sess.metadata.amount) || 0;
                    source = 'session metadata';
                }

                console.log(`  Session ${sess.id} (inv ${sess.externalInvoiceId}): Using amount $${invoiceAmount} from ${source}, balance $${invoiceBalance}`);
                
                const diff = invoiceAmount - invoiceBalance;
                recoveredAmount += Math.max(0, diff);
            }
            console.log(`[Diagnostic] Final recoveredAmount calculation: $${recoveredAmount}`);
        }
    } finally {
        await p.$disconnect();
    }
}

diagnose().catch(console.error);
