import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function seedUserWorkspace() {
    console.log("Looking up user 'AFS Tools Test'...");
    const user = await prisma.user.findFirst({
        where: { name: { contains: 'AFS Tools' } },
        include: { business: true }
    });

    if (!user) {
        console.log("No user found.");
        process.exit(0);
    }

    let businessId = user.businessId || user.business?.id;
    let business = null;

    if (businessId) {
        business = await prisma.business.findUnique({ where: { id: businessId } });
    }

    if (!business) {
        console.log("Failed to resolve business.");
        process.exit(0);
    }

    console.log("Resolved Business:", business.name, "ID:", business.id);

    // Bypass TS compiler entirely for dynamic tables using raw SQL
    // Check integration
    const existingSync = await prisma.$queryRaw`SELECT * FROM "Integration" WHERE "businessId" = ${business.id} LIMIT 1`;
    let intg: any = Array.isArray(existingSync) && existingSync.length > 0 ? existingSync[0] : null;

    if (!intg) {
        console.log("Creating mock integration...");
        await prisma.$queryRaw`
            INSERT INTO "Integration" (id, "businessId", provider, "accessToken", status, "createdAt", "updatedAt") 
            VALUES (gen_random_uuid(), ${business.id}, 'mock_qb', 'mock', 'connected', NOW(), NOW())
        `;
    }

    console.log("Seeding mock UnifiedCustomers...");
    for (let i = 1; i <= 5; i++) {
        const ext = 'CUST-' + i;
        await prisma.$queryRaw`
            INSERT INTO "UnifiedCustomer" (id, "businessId", "externalId", source, name, email, "totalSpent", "createdAt", "updatedAt")
            VALUES (gen_random_uuid(), ${business.id}, ${ext}, 'mock_qb', ${'Acme Corp ' + i}, ${'contact' + i + '@acme.com'}, ${Math.floor(Math.random() * 5000) + 1000}, NOW(), NOW())
            ON CONFLICT DO NOTHING
        `;
    }

    console.log("Seeding mock UnifiedInvoices...");
    for (let i = 1; i <= 30; i++) {
        const date = new Date();
        date.setDate(date.getDate() - Math.floor(Math.random() * 30));
        
        const ext = 'INV-' + Date.now() + '-' + i;
        const source = i % 2 === 0 ? 'mock_qb' : 'mock_zoho';
        const cid = 'CUST-' + ((i % 5) + 1);
        const amount = Math.floor(Math.random() * 900) + 100;
        const status = i % 4 === 0 ? 'overdue' : 'paid';

        await prisma.$queryRaw`
            INSERT INTO "UnifiedInvoice" (id, "businessId", "externalId", source, "customerId", amount, status, "issuedAt", "dueDate", "createdAt", "updatedAt")
            VALUES (gen_random_uuid(), ${business.id}, ${ext}, ${source}, ${cid}, ${amount}, ${status}, ${date}, ${date}, NOW(), NOW())
            ON CONFLICT DO NOTHING
        `;
    }

    console.log("Seeding complete! Refresh the Unified Data Hub dashboard.");
}

seedUserWorkspace()
    .catch(console.error)
    .finally(() => prisma.$disconnect().then(() => process.exit(0)));
