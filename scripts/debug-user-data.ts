import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
    console.log("Looking up user bwj.afs.tools.test@gmail.com...");
    const user = await prisma.user.findUnique({
        where: { email: 'bwj.afs.tools.test@gmail.com' }
    });
    
    if (!user) { console.log("User not found"); return; }
    
    const businessId = user.businessId || '';

    const extDocs = await prisma.externalDocument.count({ where: { businessId } });
    const unifiedCustomers = await prisma.unifiedCustomer.count({ where: { businessId } });
    const unifiedInvoices = await prisma.unifiedInvoice.count({ where: { businessId } });

    console.log("Business:", businessId);
    console.log("ExternalDocs:", extDocs);
    console.log("UnifiedCustomers:", unifiedCustomers);
    console.log("UnifiedInvoices:", unifiedInvoices);
}

run().catch(console.error).finally(() => prisma.$disconnect());
