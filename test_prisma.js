const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const businessId = '8bc0766d-b529-4f82-808f-63d4b9c85d39';
    const userId = '71c15a09-da77-4966-81bf-8034d8313f91';

    console.log("1. Testing findUnique with include...");
    const b1 = await prisma.business.findUnique({
        where: { id: businessId },
        include: { integrations: { where: { status: 'connected' } } }
    });
    console.log("Result 1:", b1 ? b1.name : "NULL");

    console.log("\n2. Testing getUnifiedBusinessStats directly...");
    const [invoiceStats, customerCount, orderCount] = await Promise.all([
        prisma.unifiedInvoice.aggregate({
            where: { businessId },
            _sum: { amount: true, balance: true },
            _count: { id: true }
        }),
        prisma.unifiedCustomer.count({ where: { businessId } }),
        (prisma).unifiedOrder.count({ where: { businessId } }).catch(() => "error on unifiedOrder")
    ]);
    console.log("Stats:");
    console.log("Invoice count:", invoiceStats._count.id);
    console.log("Customer count:", customerCount);
    console.log("Order count:", orderCount);

    process.exit(0);
}
main();
