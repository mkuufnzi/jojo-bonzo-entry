import prisma from '../src/lib/prisma';
const p = prisma as any;

async function verifyFix() {
    console.log('🚀 Starting Sequencer Fix Verification...');

    try {
        // 1. Setup: Create a purposefully corrupted sequence for a test business
        const testBusinessId = 'test-business-fix-' + Date.now();
        
        // Ensure business exists (optional, or use existing)
        await p.business.upsert({
            where: { id: testBusinessId },
            create: { id: testBusinessId, name: 'Fix Test Business' },
            update: {}
        });

        console.log('🛠️ Creating corrupted sequence...');
        const corruptedSteps = {
            create: [
                { dayOffset: 1, actionType: 'EMAIL' },
                { dayOffset: 7, actionType: 'SMS' }
            ]
        };

        const seq = await p.debtCollectionSequence.create({
            data: {
                businessId: testBusinessId,
                name: 'Corrupted Test Sequence',
                steps: corruptedSteps,
                isActive: true
            }
        });

        console.log(`✅ Corrupted sequence created with ID: ${seq.id}`);

        // 2. Simulate Controller Self-Healing Logic
        console.log('🩹 Running self-healing logic simulation...');
        const fetchedSeq = await p.debtCollectionSequence.findUnique({ where: { id: seq.id } });
        const stepsObj = fetchedSeq.steps as any;

        if (stepsObj && typeof stepsObj === 'object' && stepsObj.create && Array.isArray(stepsObj.create)) {
            const repairedSteps = stepsObj.create.map((s: any) => ({
                day: s.dayOffset || s.day,
                action: (s.actionType || s.action || 'email').toLowerCase()
            }));

            await p.debtCollectionSequence.update({
                where: { id: seq.id },
                data: { steps: repairedSteps }
            });
            console.log('✨ Data repaired successfully in DB.');
        } else {
            console.error('❌ Self-healing logic failed to detect corruption!');
            process.exit(1);
        }

        // 3. Final Check
        const finalSeq = await p.debtCollectionSequence.findUnique({ where: { id: seq.id } });
        console.log('🔍 Final Steps Data:', JSON.stringify(finalSeq.steps, null, 2));

        if (Array.isArray(finalSeq.steps) && finalSeq.steps[0].day === 1 && finalSeq.steps[0].action === 'email') {
            console.log('✅ VERIFICATION SUCCESSFUL: Data is correctly formatted as an array.');
        } else {
            console.error('❌ VERIFICATION FAILED: Data format is still incorrect.');
            process.exit(1);
        }

        // Cleanup
        await p.debtCollectionSequence.delete({ where: { id: seq.id } });
        // await p.business.delete({ where: { id: testBusinessId } }); 

    } catch (error) {
        console.error('❌ Verification crashed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

verifyFix();
