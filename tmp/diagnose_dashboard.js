const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function diagnose() {
    // 1. Check session customerId format
    const sessions = await prisma.debtCollectionSession.findMany({
        where: { externalInvoiceId: { in: ['1005', '1004'] } },
        select: { id: true, customerId: true, externalInvoiceId: true, status: true }
    });
    console.log('--- Sessions for invoices 1005/1004 ---');
    console.log(JSON.stringify(sessions, null, 2));

    // 2. Check invoice balance for paid invoices
    const invoices = await prisma.debtCollectionInvoice.findMany({
        where: { externalId: { in: ['1005', '1004'] } },
        select: { externalId: true, amount: true, balance: true, status: true, customerId: true }
    });
    console.log('--- DebtCollectionInvoice for 1005/1004 ---');
    console.log(JSON.stringify(invoices, null, 2));

    // 3. Check DebtCollectionCustomer for BONIFACE 
    const customer = await prisma.debtCollectionCustomer.findFirst({
        where: { externalId: '1' },
        select: { id: true, externalId: true, name: true }
    });
    console.log('--- DebtCollectionCustomer externalId=1 ---');
    console.log(JSON.stringify(customer, null, 2));

    // 4. Check a session customerId value
    const sampleSession = await prisma.debtCollectionSession.findFirst({
        select: { customerId: true, customerName: true, externalInvoiceId: true }
    });
    console.log('--- Sample session customerId format ---');
    console.log(JSON.stringify(sampleSession, null, 2));

    // 5. Count sessions by status
    const statusCounts = await prisma.debtCollectionSession.groupBy({
        by: ['status'],
        _count: true
    });
    console.log('--- Session status counts ---');
    console.log(JSON.stringify(statusCounts, null, 2));

    // 6. Check recovered sessions
    const recovered = await prisma.debtCollectionSession.findMany({
        where: { status: 'RECOVERED' },
        select: { id: true, customerId: true, externalInvoiceId: true }
    });
    console.log('--- RECOVERED sessions ---');
    console.log(JSON.stringify(recovered, null, 2));

    await prisma.$disconnect();
}

diagnose().catch(e => { console.error(e); process.exit(1); });
