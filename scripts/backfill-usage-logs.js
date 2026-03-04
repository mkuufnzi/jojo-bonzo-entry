const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- Backfilling UsageLogs for Transactional Branding ---');
    
    // 1. Find all completed ProcessedDocuments that don't have a corresponding UsageLog
    const completedDocs = await prisma.processedDocument.findMany({
        where: { 
            status: 'completed',
            eventType: { contains: 'invoice' } // Focus on transactional invoices
        }
    });

    console.log(`Found ${completedDocs.length} completed documents to check.`);

    const service = await prisma.service.findFirst({ where: { slug: 'transactional-branding' } });
    if (!service) {
        console.error('Service "transactional-branding" not found!');
        return;
    }

    let backfilled = 0;
    for (const doc of completedDocs) {
        // Check if UsageLog already exists for this flooviooId
        const existing = await prisma.usageLog.findFirst({
            where: { metadata: { contains: doc.flooviooId } }
        });

        if (!existing) {
            console.log(`- Backfilling ${doc.flooviooId} (External: ${doc.resourceId})`);
            await prisma.usageLog.create({
                data: {
                    userId: doc.userId,
                    appId: doc.appId,
                    serviceId: service.id,
                    action: 'apply_branding',
                    resourceType: doc.resourceType,
                    status: 'success',
                    statusCode: 200,
                    duration: doc.processingTimeMs || 0,
                    cost: service.pricePerRequest || 0,
                    metadata: JSON.stringify({
                        flooviooId: doc.flooviooId,
                        externalId: doc.resourceId,
                        restored: true
                    }),
                    createdAt: doc.createdAt // Use original creation date
                }
            });
            backfilled++;
        }
    }

    console.log(`✅ Backfill complete. Created ${backfilled} UsageLog entries.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
