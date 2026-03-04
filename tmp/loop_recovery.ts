import prisma from '../src/lib/prisma';
import { RecoveryService } from '../src/modules/recovery/recovery.service';
import { logger } from '../src/lib/logger';

async function loopTrigger() {
    console.log('🚀 Starting Infinite Recovery Tester (2 minute intervals)...');
    
    let count = 0;
    const TOTAL_RUNS = 100;

    while (count < TOTAL_RUNS) {
        count++;
        console.log(`\n===========================================`);
        console.log(`💥 RUN ${count}/${TOTAL_RUNS} @ ${new Date().toISOString()}`);
        console.log(`===========================================`);
        
        // 1. Defeat the Idempotency Guard
        console.log('🧹 Clearing old actions and communication logs to bypass daily limits...');
        await prisma.debtCollectionCommunicationLog.deleteMany({});
        await prisma.debtCollectionAction.deleteMany({});
        
        // 2. We don't delete the Sessions every time because we want the step to advance
        // But we DO need to reset the nextActionAt trigger date so the Orchestrator picks it up NOW
        console.log('⚙️ Rewinding session timers so they are due NOW...');
        await prisma.debtCollectionSession.updateMany({
            where: { status: 'ACTIVE' },
            data: { nextActionAt: new Date(Date.now() - 100000) } // In the past
        });

        // 3. Manually invoke the orchestrator to sync and process invoices
        console.log('🔄 Running Orchestrator...');
        const service = new RecoveryService();
        await service.orchestrate();
        
        console.log(`✅ Orchestrator finished Run ${count}. Check n8n webhook history!`);
        
        if (count < TOTAL_RUNS) {
            console.log('⏳ Waiting 2 minutes for the next loop...');
            await new Promise(resolve => setTimeout(resolve, 2 * 60 * 1000));
        }
    }

    console.log('🎉 100 Runs Complete!');
    await prisma.$disconnect();
}

loopTrigger().catch(console.error);
