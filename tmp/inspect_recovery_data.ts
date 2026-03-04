import prisma from '../src/lib/prisma';

async function inspectData() {
    console.log('🔍 Inspecting Recovery Service Data...');

    // 1. Check Service Registry
    const recoveryService = await prisma.service.findUnique({
        where: { slug: 'floovioo_transactional_debt-collection' }
    });
    console.log('\n--- Service: floovioo_transactional_debt-collection ---');
    console.log(JSON.stringify(recoveryService, null, 2));

    // 2. Check ProcessedDocuments (last 5)
    const recentDocs = await prisma.processedDocument.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' }
    });
    console.log('\n--- Recent ProcessedDocuments ---');
    console.log(JSON.stringify(recentDocs, null, 2));

    // 3. Check UsageLogs (last 5)
    const recentUsage = await prisma.usageLog.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' }
    });
    console.log('\n--- Recent UsageLogs ---');
    console.log(JSON.stringify(recentUsage, null, 2));

    // 4. Check DebtCollectionActions (last 5 sent)
    const recentActions = await prisma.debtCollectionAction.findMany({
        where: { status: 'sent' },
        take: 5,
        orderBy: { sentAt: 'desc' }
    });
    console.log('\n--- Recent DebtCollectionActions (SENT) ---');
    console.log(JSON.stringify(recentActions, null, 2));

    await prisma.$disconnect();
}

inspectData();
