import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function diagnose() {
    console.log('🔍 Deep Scan of Document 75...');
    try {
        const doc = await prisma.processedDocument.findFirst({
            where: { resourceId: '75' },
            orderBy: { createdAt: 'desc' }
        });

        if (!doc) {
            console.log('❌ ProcessedDocument 75 not found.');
        } else {
            console.log('✅ Document Details:');
            console.log(JSON.stringify({
                id: doc.id,
                resourceId: doc.resourceId,
                status: doc.status,
                hasSnapshot: !!doc.snapshotHtml,
                snapshotHtml: doc.snapshotHtml // Might be large
            }, null, 2));
        }

    } catch (error) {
        console.error('❌ Diagnostics failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

diagnose();
