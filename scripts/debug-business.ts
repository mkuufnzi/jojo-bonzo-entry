import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
    console.log("Looking for ALL integrations...");
    const integrations = await prisma.integration.findMany({
        include: { business: { include: { users: true } } }
    });
    
    for (const int of integrations) {
        console.log(`Integration: ${int.provider} - BusinessId: ${int.businessId}`);
        console.log(`  Linked Users:`, int.business.users.map(u => ({ id: u.id, email: u.email })));
    }
}

run().catch(console.error).finally(() => prisma.$disconnect());
