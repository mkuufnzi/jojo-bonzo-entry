import prisma from '../src/lib/prisma';

async function mapSequenceToUser() {
    // 1. Find the sequence
    const sequence = await prisma.debtCollectionSequence.findFirst({
        where: { name: 'Test Instant' }
    });

    if (!sequence) {
        console.log('Test Instant sequence not found, perhaps it was recreated or deleted.');
        return; 
    }

    // 2. Find the user's actual business (User seems to be active under AFS Tools Test)
    // Could track by user email or name.
    const user = await prisma.user.findFirst({
        where: { name: 'SaaS Super Admin' }, 
        include: { business: true }
    });
    
    // There appears to be an AFS Tools Test user based on screenshot
    const afsUser = await prisma.user.findFirst({
        where: { name: 'AFS Tools Test' },
        include: { business: true }
    });

    const targetBusinessId = afsUser?.businessId || user?.businessId;

    if (!targetBusinessId) return;

    // 3. Update the sequence to belong to their business
    await prisma.debtCollectionSequence.update({
        where: { id: sequence.id },
        data: { businessId: targetBusinessId }
    });

    console.log(`Successfully mapped 'Test Instant' to business ID ${targetBusinessId}`);

    // Update customer too, so the orchestrator runs it for them
    await prisma.debtCollectionCustomer.updateMany({
        data: { businessId: targetBusinessId }
    });

    await prisma.debtCollectionAction.deleteMany({});
}

mapSequenceToUser().catch(console.error);
