import prisma from '../src/lib/prisma';

async function cleanupData() {
    console.log('⚠️  Starting Dangerous Data Cleanup...');
    
    // Order matters for Foreign Key constraints if cascades aren't perfect
    
    console.log('1. Deleting UsageLogs...');
    await prisma.usageLog.deleteMany({});
    
    console.log('2. Deleting Invoices...');
    await prisma.invoice.deleteMany({});

    console.log('3. Deleting Subscriptions...');
    await prisma.subscription.deleteMany({});

    console.log('4. Deleting Apps...');
    await prisma.app.deleteMany({});
    
    console.log('5. Deleting Payment Methods...');
    await prisma.paymentMethod.deleteMany({});
    
    console.log('6. Deleting Notifications & Configs...');
    await prisma.notification.deleteMany({});
    await prisma.notificationConfig.deleteMany({});

    console.log('7. Deleting Users...');
    await prisma.user.deleteMany({});

    console.log('✅ Local Database Cleared.');
}

cleanupData()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
