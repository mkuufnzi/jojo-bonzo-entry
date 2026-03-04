const { PrismaClient } = require('@prisma/client');
const { RecoveryService } = require('./src/modules/recovery/recovery.service');

const p = new PrismaClient();

(async () => {
    try {
        // Find the business ID that has the connected Quickbooks integration
        const integration = await p.integration.findFirst({
            where: { provider: 'quickbooks', status: 'connected' }
        });

        if (!integration) {
            console.error('No connected quickbooks integration found.');
            return;
        }

        const businessId = integration.businessId;
        console.log(`Triggering sync for business ID: ${businessId}`);

        // Trigger the sync process which now includes the DATA HEALER
        const result = await RecoveryService.syncOverdueInvoices(businessId);
        console.log('Sync Result:', JSON.stringify(result, null, 2));

        // After sync, verify the amounts are fixed
        const recovered = await p.debtCollectionSession.findMany({
            where: { status: 'RECOVERED' },
            select: { id: true, externalInvoiceId: true, metadata: true }
        });

        if (recovered.length > 0) {
            const externalIds = recovered.map(s => s.externalInvoiceId);
            const invoices = await p.debtCollectionInvoice.findMany({
                where: { externalId: { in: externalIds } },
                select: { externalId: true, amount: true, balance: true, status: true }
            });

            console.log('\n📊 Healed Invoices:');
            console.log(JSON.stringify(invoices, null, 2));
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await p.$disconnect();
    }
})();
