import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
    console.log("Looking up user bwj.afs.tools.test@gmail.com...");
    const user = await prisma.user.findUnique({
        where: { email: 'bwj.afs.tools.test@gmail.com' }
    });
    
    if (!user) { console.log("User not found"); return; }
    
    console.log("User businessId field:", user.businessId);

    const allLinkedBusinesses = await prisma.business.findMany({
        where: { users: { some: { id: user.id } } },
        include: { integrations: true }
    });

    console.log("Businesses linked via users relation:");
    for (const b of allLinkedBusinesses) {
        console.log(` - Business: ${b.id}, Integrations: ${b.integrations.length}`);
    }
}

run().catch(console.error).finally(() => prisma.$disconnect());
