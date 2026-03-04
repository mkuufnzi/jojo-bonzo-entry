
import prisma from '../../src/lib/prisma';
import { RecoveryService } from '../../src/modules/transactional/recovery/recovery.service';

const TEST_BUSINESS_ID = '1a98aaf1-9c92-4d1f-b854-3da8899a310f'; // FlooviooTest1

async function runLiveRecoveryTest() {
    console.log('🚀 Starting Live Recovery Engine Test...');
    console.log(`🏢 Business ID: ${TEST_BUSINESS_ID}`);

    const service = new RecoveryService();

    try {
        // 1. Initial Status Check
        console.log('\n📊 Checking Initial Status...');
        const initialStatus = await service.getStatus(TEST_BUSINESS_ID);
        console.log('Status:', JSON.stringify(initialStatus, null, 2));

        // 2. Sync Overdue Invoices (Live QBO Call)
        console.log('\n🔄 Syncing Overdue Invoices (Live API Call)...');
        const syncResult = await service.syncOverdueInvoices(TEST_BUSINESS_ID);
        console.log('Sync Result:', JSON.stringify(syncResult, null, 2));

        // 3. Verify Dunning Actions Created
        if (syncResult.success && syncResult.synced !== undefined && syncResult.synced > 0) {
            console.log('\n✅ Checking Database for Created Actions...');
            const actions = await prisma.dunningAction.findMany({
                where: { businessId: TEST_BUSINESS_ID, status: 'pending' },
                take: 3
            });
            console.log(`Found ${actions.length} pending actions:`);
            actions.forEach(a => console.log(` - Action ${a.id} for Invoice ${a.externalInvoiceId} (Type: ${a.actionType})`));
        } else {
            console.log('\n⚠️ No overdue invoices found to sync. Skipping verification.');
            
            // Allow manual mock creation if live data is empty?
            // For now, we prefer to know if live data is empty.
        }

        // 4. Update Sequence Settings
        console.log('\n⚙️ Updating Sequence Settings...');
        const updatedSeq = await service.updateSequence(TEST_BUSINESS_ID, {
            name: 'Live Test Sequence ' + Date.now(),
            isActive: true
        });
        console.log('Updated Sequence:', updatedSeq.name);

        console.log('\n✅ Test Complete.');

    } catch (error) {
        console.error('\n❌ Test Failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Ensure env is loaded implicitly by running via:
// $env:APP_URL='http://localhost:3002'; npx ts-node scripts/e2e/test-recovery-live.ts
runLiveRecoveryTest();
