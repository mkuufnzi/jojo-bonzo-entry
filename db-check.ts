import prisma from './src/lib/prisma';

async function traceBusinessContext() {
    console.log('\n=== BUSINESS CONTEXT TRACE ===\n');
    
    const users = await prisma.user.findMany({
        select: { id: true, email: true, businessId: true }
    });
    console.log('Users:');
    users.forEach((u: any) => console.log(`  ${u.email} | businessId: ${u.businessId} | userId: ${u.id}`));
    
    const businesses = await prisma.business.findMany({
        include: { users: { select: { id: true, email: true } } }
    });
    console.log('\nBusinesses:');
    businesses.forEach((b: any) => {
        console.log(`  ${b.name} | ID: ${b.id}`);
        b.users.forEach((u: any) => console.log(`    -> User: ${u.email} | ${u.id}`));
    });
    
    const customerBiz = await prisma.unifiedCustomer.groupBy({ by: ['businessId'], _count: { id: true } });
    console.log('\nUnifiedCustomer by businessId:');
    customerBiz.forEach((c: any) => console.log(`  ${c.businessId}: ${c._count.id}`));
    
    const invoiceBiz = await prisma.unifiedInvoice.groupBy({ by: ['businessId'], _count: { id: true } });
    console.log('UnifiedInvoice by businessId:');
    invoiceBiz.forEach((c: any) => console.log(`  ${c.businessId}: ${c._count.id}`));

    const productBiz = await prisma.unifiedProduct.groupBy({ by: ['businessId'], _count: { id: true } });
    console.log('UnifiedProduct by businessId:');
    productBiz.forEach((c: any) => console.log(`  ${c.businessId}: ${c._count.id}`));

    const paymentBiz = await prisma.unifiedPayment.groupBy({ by: ['businessId'], _count: { id: true } });
    console.log('UnifiedPayment by businessId:');
    paymentBiz.forEach((c: any) => console.log(`  ${c.businessId}: ${c._count.id}`));
    
    await prisma.$disconnect();
    console.log('\n=== END ===');
}

traceBusinessContext().catch(e => { console.error('FATAL:', e); process.exit(1); });
