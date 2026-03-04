import prisma from '../src/lib/prisma';

async function main() {
    console.log('--- Database Diagnostics ---');
    
    const usageLogsCount = await prisma.usageLog.count();
    console.log(`Total UsageLogs: ${usageLogsCount}`);

    const transactionalLogs = await prisma.usageLog.findMany({
        where: { service: { slug: 'transactional-branding' } },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { service: true }
    });
    console.log(`Recent Transactional Logs: ${transactionalLogs.length}`);
    transactionalLogs.forEach(l => console.log(`- ${l.createdAt}: ${l.status}, Metadata: ${l.metadata}`));

    const processedDocs = await prisma.processedDocument.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' }
    });
    console.log(`Recent ProcessedDocuments: ${processedDocs.length}`);
    processedDocs.forEach(d => console.log(`- ${d.createdAt}: ${d.status}, Provider: ${d.provider}, flooviooId: ${d.flooviooId}`));

    const externalDocs = await prisma.externalDocument.count();
    console.log(`Total ExternalDocuments: ${externalDocs}`);

    const business = await prisma.business.findFirst();
    if (business) {
        console.log(`Sample Business: ${business.id}, Name: ${business.name}`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
