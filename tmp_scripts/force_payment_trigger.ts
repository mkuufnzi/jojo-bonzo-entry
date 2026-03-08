import { RecoveryService } from '../src/modules/recovery/recovery.service';
import prisma from '../src/lib/prisma';
import { logger } from '../src/lib/logger';

async function main() {
    // 1. Find a customer with active sessions (or at least an unpaid invoice)
    const session = await (prisma as any).debtCollectionSession.findFirst({
        where: {
            status: 'ACTIVE'
        },
        include: {
            business: true
        }
    });

    if (!session) {
        console.log("No active sessions found. Please enroll an invoice first.");
        return;
    }

    const businessId = session.businessId;
    const externalInvoiceId = session.externalInvoiceId;
    
    // Check invoice record for amount
    const invoice = await (prisma as any).debtCollectionInvoice.findFirst({
        where: { businessId, externalId: externalInvoiceId }
    });

    console.log(`[TEST] Found session for Invoice: ${externalInvoiceId} ($${invoice?.amount || '?'})`);
    console.log(`[TEST] Sending simulated ERP 'invoice.paid' webhook...`);

    const service = new RecoveryService();
    
    // Simulate what the webhook controller passes into handleErpEvent
    await service.handleErpEvent(businessId, {
        type: 'invoice.paid',
        externalId: externalInvoiceId,
        payload: {
            TotalAmt: invoice?.amount || 100,
            Balance: 0
        }
    });

    console.log(`[TEST] Event dispatched successfully.`);
    process.exit(0);
}

main().catch(console.error);
