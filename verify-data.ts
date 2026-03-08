import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
    const email = 'bonzocreatives@gmail.com';
    const user = await prisma.user.findUnique({
        where: { email },
        include: { business: true }
    });

    if (!user) {
        console.error(`User ${email} not found`);
        return;
    }

    const businessId = user.businessId || user.business?.id;
    console.log(`User Business ID: ${businessId}`);

    const counts = {
        customers: await prisma.unifiedCustomer.count({ where: { businessId } }),
        invoices: await prisma.unifiedInvoice.count({ where: { businessId } }),
        products: await prisma.unifiedProduct.count({ where: { businessId } }),
        orders: await prisma.unifiedOrder.count({ where: { businessId } }),
        payments: await prisma.unifiedPayment.count({ where: { businessId } }),
        estimates: await prisma.unifiedEstimate.count({ where: { businessId } }),
    };

    console.log('Counts for this business:', JSON.stringify(counts, null, 2));

    // Check sources
    const invoiceSources = await prisma.unifiedInvoice.groupBy({
        by: ['source'],
        where: { businessId },
        _count: true
    });
    console.log('Invoice Sources:', JSON.stringify(invoiceSources, null, 2));

    // Sample data
    const sampleInvoice = await prisma.unifiedInvoice.findFirst({
        where: { businessId },
        include: { customer: true }
    });
    console.log('Sample Invoice with Customer:', JSON.stringify(sampleInvoice, null, 2));

    // Check for dangling invoices (missing customers)
    const danglingInvoices = await (prisma.unifiedInvoice as any).findMany({
        where: {
            businessId,
            customerId: { notIn: [] } // Just checking existence
        },
        take: 5
    });
    
    // Manual check for customers
    if (sampleInvoice && !sampleInvoice.customer) {
        console.warn('⚠️ WARNING: Invoice exists but customer relation returned NULL!');
        const rawCustomer = await prisma.unifiedCustomer.findUnique({
            where: { id: sampleInvoice.customerId }
        });
        console.log('Raw Customer lookup:', rawCustomer ? 'Found' : 'NOT FOUND');
    }

    await prisma.$disconnect();
}

check();
