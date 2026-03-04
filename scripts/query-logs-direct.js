const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- Direct Database Diagnostics ---');
    
    const usageLogsCount = await prisma.usageLog.count();
    console.log(`Total UsageLogs: ${usageLogsCount}`);

    const transactionalLogs = await prisma.usageLog.findMany({
        where: { service: { slug: 'transactional-branding' } },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { service: true }
    });
    console.log(`Recent Transactional Logs (slug=transactional-branding): ${transactionalLogs.length}`);
    transactionalLogs.forEach(l => console.log(`- ${l.createdAt}: ${l.status}, Metadata: ${l.metadata}`));

    const allSlugs = await prisma.service.findMany({ select: { slug: true } });
    console.log('Available Service Slugs:', allSlugs.map(s => s.slug).join(', '));

    const processedDocs = await prisma.processedDocument.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' }
    });
    console.log(`Recent ProcessedDocuments: ${processedDocs.length}`);
    processedDocs.forEach(d => console.log(`- ${d.createdAt}: ${d.status}, Provider: ${d.provider}, flooviooId: ${d.flooviooId}`));

    const externalDocsCount = await prisma.externalDocument.count();
    console.log(`Total ExternalDocuments: ${externalDocsCount}`);

    const auditLogsCount = await prisma.auditLog.count({
        where: { serviceId: 'transactional-branding' }
    });
    console.log(`AuditLogs for transactional-branding: ${auditLogsCount}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
