const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Checking UnifiedCustomer businessIds...");
    const customers = await prisma.unifiedCustomer.groupBy({
        by: ['businessId'],
        _count: { id: true }
    });
    console.log(customers);

    console.log("\nChecking User businessIds...");
    const users = await prisma.user.findMany({ select: { id: true, email: true, businessId: true }});
    console.log(users);

    console.log("\nChecking Business memberships...");
    const businesses = await prisma.business.findMany({
        select: { id: true, name: true, users: { select: { id: true, email: true } } }
    });
    console.log(JSON.stringify(businesses, null, 2));

    process.exit(0);
}
main();
