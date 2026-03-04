import prisma from '../src/lib/prisma';
import { RecoveryService } from '../src/modules/recovery/recovery.service';
import { logger } from '../src/lib/logger';

async function forceTrigger() {
    console.log('🚀 Forcing Recovery Engine Trigger...');
    
    // 1. Delete all existing DebtCollectionAction and DebtCollectionSession records
    // so the engine thinks every overdue invoice is BRAND NEW and needs an email NOW.
    console.log('🧹 Clearing old recovery sessions and actions...');
    await prisma.debtCollectionCommunicationLog.deleteMany({});
    await prisma.debtCollectionAction.deleteMany({});
    await prisma.debtCollectionSession.deleteMany({});
    
    // 2. Set the recovery sequence to trigger immediately (Delay days = 0)
    console.log('⚙️ Updating sequence rules to trigger immediately (delay: 0)...');
    await prisma.debtCollectionSequenceStep.updateMany({
        data: {
            dayOffset: 0 // Fire immediately on overdue
        }
    });

    // 3. Manually invoke the orchestrator to sync and process invoices
    console.log('🔄 Running Orchestrator...');
    const service = new RecoveryService();
    await service.orchestrate();
    
    console.log('✅ Orchestrator finished firing. Check n8n or terminal for webhook logs!');
    await prisma.$disconnect();
}

forceTrigger().catch(console.error);
