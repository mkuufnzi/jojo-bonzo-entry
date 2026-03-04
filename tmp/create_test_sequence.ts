import prisma from '../src/lib/prisma';
import { RecoveryService } from '../src/modules/recovery/recovery.service';

async function createAndRunTestSequence() {
    console.log('🚀 Creating Test Instant Sequence for Rapid Debugging...');

    // 1. Get the first active business and a single test customer
    const customer = await prisma.debtCollectionCustomer.findFirst({
        include: { business: true }
    });

    if (!customer) {
        console.error('❌ No customers found in DB to test with.');
        return;
    }

    const businessId = customer.businessId;

    // Get a template to link to avoid Prisma errors
    const template = await prisma.debtCollectionMessageTemplate.findFirst({
        where: { businessId }
    });

    // 2. Clear old state to ensure clean run
    console.log('🧹 Wiping existing dunning action logs...');
    await prisma.debtCollectionCommunicationLog.deleteMany({});
    await prisma.debtCollectionAction.deleteMany({});
    await prisma.debtCollectionSession.deleteMany({});
    await prisma.debtCollectionSequenceStep.deleteMany({ where: { sequence: { name: 'Test Instant' } } });
    await prisma.debtCollectionSequence.deleteMany({ where: { name: 'Test Instant' } });

    // 3. Create the Rapid Sequence (100 steps, all Day 0)
    console.log('📝 Creating "Test Instant" sequence with 100 chained steps...');
    const steps: any[] = [];
    for (let i = 0; i < 100; i++) {
        steps.push({
            dayOffset: 0,
            actionType: 'email',
            escalationLevel: i < 33 ? 1 : i < 66 ? 2 : 3,
            templateId: template ? template.id : null
        });
    }

    const testSequence = await prisma.debtCollectionSequence.create({
        data: {
            businessId,
            name: 'Test Instant',
            isActive: true,
            isDefault: false,
            steps: JSON.stringify(steps), 
            debtCollectionSequenceSteps: {
                create: steps
            }
        }
    });

    // 4. Force assign this sequence to our single test customer's Cluster/Profile
    console.log(`🔗 Assigning Test Sequence to Business Default temporarily...`);
    await prisma.debtCollectionSequence.updateMany({
        where: { businessId, NOT: { id: testSequence.id } },
        data: { isDefault: false, isActive: false }
    });
    await prisma.debtCollectionSequence.update({
        where: { id: testSequence.id },
        data: { isDefault: true } 
    });


    // 5. Build an aggressive cron loop
    console.log(`\n===========================================`);
    console.log(`💥 ORCHESTRATOR 100x RAPID FIRE INITIATED`);
    console.log(`===========================================`);
    
    let count = 0;
    const TOTAL_RUNS = 100;

    while (count < TOTAL_RUNS) {
        count++;
        console.log(`\n▶️ RUN ${count}/${TOTAL_RUNS} @ ${new Date().toISOString()}`);
        
        // Defeat the daily Idempotency limitations
        await prisma.debtCollectionAction.deleteMany({});
        
        // Reset the session timer so the next step evaluates as DUE NOW
        await prisma.debtCollectionSession.updateMany({
            where: { status: 'ACTIVE' },
            data: { nextActionAt: new Date(Date.now() - 100000) } 
        });

        // Fire
        const service = new RecoveryService();
        await service.orchestrate();
        
        console.log(`✅ Run ${count} Complete. Waiting 2 minutes...`);
        if (count < TOTAL_RUNS) {
            await new Promise(resolve => setTimeout(resolve, 2 * 60 * 1000));
        }
    }

    console.log('🎉 100 Runs Complete!');
    await prisma.$disconnect();
}

createAndRunTestSequence().catch(console.error);
