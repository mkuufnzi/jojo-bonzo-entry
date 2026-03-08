
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testResolution() {
    console.log('--- Testing Business Resolution Logic ---');
    try {
        const user = await prisma.user.findFirst({
            where: { email: 'bwj.afs.tools.test@gmail.com' }
        });

        if (!user) {
            console.log('User not found');
            return;
        }

        console.log(`User: ${user.email} (ID: ${user.id}, businessId: ${user.businessId})`);

        // Simulate resolveBusinessContext
        const businessId = user.businessId;
        let business = null;

        if (businessId) {
            business = await prisma.business.findUnique({
                where: { id: businessId },
                include: { integrations: true }
            });
        }

        if (!business) {
            console.log('Fallback: Searching by user membership...');
            business = await prisma.business.findFirst({
                where: { users: { some: { id: user.id } } },
                include: { integrations: true }
            });
        }

        if (business) {
            console.log(`SUCCESS: Resolved Business: ${business.name} (ID: ${business.id})`);
            console.log(`Integrations Count: ${business.integrations.length}`);
        } else {
            console.log('FAILURE: Could not resolve business context');
        }

    } catch (e) {
        console.error('Test Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

testResolution();
