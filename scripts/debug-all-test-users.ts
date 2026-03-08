import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
    console.log("Looking up all test users...");
    const users = await prisma.user.findMany({
        where: { email: { contains: 'test@' } }
    });
    
    for (const u of users) {
        console.log(`User: ${u.email} (Name: ${u.name}, ID: ${u.id})`);
        
        const b = await prisma.business.findFirst({
            where: { users: { some: { id: u.id } } },
            include: { integrations: true }
        });
        
        if (b) {
            console.log(` - Business: ${b.id}`);
            console.log(` - Integrations:`, b.integrations.map(i => i.provider));
            const unifiedInvoices = await prisma.unifiedInvoice.count({ where: { businessId: b.id } });
            console.log(` - Unified Invoices: ${unifiedInvoices}`);
        } else {
            console.log(` - No Business found`);
        }
    }
}

run().catch(console.error).finally(() => prisma.$disconnect());
