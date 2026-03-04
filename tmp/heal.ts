import { PrismaClient } from '@prisma/client';
import { QBOProvider } from '../src/services/integrations/providers/quickbooks.provider';

const p = new PrismaClient();

async function heal() {
    try {
        console.log('Fetching integrations...');
        const integration = await p.integration.findFirst({
            where: { provider: 'quickbooks', status: 'connected' }
        });

        if (!integration) {
            console.error('No connected quickbooks integration found.');
            return;
        }

        const businessId = integration.businessId;
        console.log(`Business ID: ${businessId}`);

        const corruptedSessions = await p.debtCollectionSession.findMany({
            where: { businessId, status: 'RECOVERED' },
            select: { id: true, externalInvoiceId: true }
        });
        
        console.log(`Found ${corruptedSessions.length} RECOVERED sessions`);
        if (corruptedSessions.length === 0) return;

        const corruptedInvoiceIds = corruptedSessions.map(s => s.externalInvoiceId);
        const zeroAmountInvoices = await p.debtCollectionInvoice.findMany({
            where: { businessId, externalId: { in: corruptedInvoiceIds }, amount: 0 },
            select: { externalId: true }
        });

        console.log(`Found ${zeroAmountInvoices.length} invoices with amount=0`);
        if (zeroAmountInvoices.length === 0) return;

        const qbo = new QBOProvider();
        await qbo.initialize(integration);
        
        for (const inv of zeroAmountInvoices) {
            const healId = inv.externalId;
            console.log(`Fetching QBO Invoice ${healId}...`);
            const invData = await qbo.fetchRaw(`/query?query=select * from Invoice where DocNumber = '${healId}'`);
            const qboInv = invData.QueryResponse?.Invoice?.[0];
            
            if (qboInv) {
                const totalAmt = parseFloat(qboInv.TotalAmt || '0');
                console.log(`-> QBO TotalAmt: $${totalAmt}`);
                
                if (totalAmt > 0) {
                    await p.debtCollectionInvoice.updateMany({
                        where: { businessId, externalId: healId },
                        data: { amount: totalAmt, updatedAt: new Date() }
                    });

                    const sessToUpdate = corruptedSessions.find(s => s.externalInvoiceId === healId);
                    if (sessToUpdate) {
                        const existingSess = await p.debtCollectionSession.findUnique({ where: { id: sessToUpdate.id } });
                        if (existingSess) {
                            await p.debtCollectionSession.update({
                                where: { id: sessToUpdate.id },
                                data: { metadata: { ...(existingSess.metadata as object || {}), amount: totalAmt } }
                            });
                        }
                    }
                    console.log(`✅ Healed invoice ${healId} to $${totalAmt}`);
                }
            } else {
                console.log(`-> Invoice ${healId} not found in QBO`);
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        await p.$disconnect();
    }
}

heal();
