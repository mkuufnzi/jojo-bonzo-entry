
import { transactionalService } from '../src/services/v2/transactional.service';
import { deliveryService } from '../src/services/v2/delivery.service';
import { on } from 'events';
import prisma from '../src/lib/prisma';
import { logger } from '../src/lib/logger';

// Mock Logger to avoid clutter
logger.level = 'error';

async function main() {
    console.log('🚀 Starting V2 Logic Verification...');

    // 1. Find a valid user
    const user = await prisma.user.findFirst({
        where: { business: { isNot: null } },
        include: { business: true }
    });

    if (!user || !user.business) {
        console.error('❌ No valid user/business found for test');
        return;
    }
    console.log(`✅ User found: ${user.email} (${user.id})`);

    // 2. Create a Mock ExternalDocument (Invoice)
    const mockInvoiceId = `inv_test_${Date.now()}`;
    const invoiceData = {
        InvoiceID: mockInvoiceId,
        DocNumber: 'INV-TEST-V2',
        TotalAmt: 500.00,
        CustomerRef: { name: 'V2 Test Customer' },
        Line: [{ Description: 'Test Service', Amount: 500.00 }]
    };

    const doc = await prisma.externalDocument.create({
        data: {
            businessId: user.business.id,
            integrationId: 'mock_int', // This acts as a placeholder
            externalId: mockInvoiceId,
            type: 'invoice',
            data: invoiceData,
            createdAt: new Date()
        }
    });
    console.log(`✅ Created Mock Invoice: ${doc.id}`);

    try {
        // 3. Test Preview (Transactional -> Design)
        console.log('🔄 Testing Preview...');
        const preview = await transactionalService.preview(user.id, doc.id);
        
        if (preview.html && preview.html.includes('html')) {
             console.log('✅ Preview Successful (HTML Generated)');
        } else {
             console.error('❌ Preview Failed (No HTML)');
        }

        // 4. Test Send (Transactional -> Delivery -> Workflow)
        console.log('🔄 Testing Send (Email)...');
        const sendResult = await transactionalService.send(user.id, doc.id, 'email');
        
        if (sendResult.dispatched) {
            console.log(`✅ Send Successful (Dispatched to ${sendResult.workflowCount} workflows)`);
        } else {
             console.log('ℹ️ Send Completed (No workflows matched, but execution was safe)');
        }

    } catch (e: any) {
        console.error('❌ Verification Failed:', e.message);
    } finally {
        // Cleanup
        await prisma.externalDocument.delete({ where: { id: doc.id } });
        console.log('🧹 Cleanup Done');
        await prisma.$disconnect();
    }
}

main();
