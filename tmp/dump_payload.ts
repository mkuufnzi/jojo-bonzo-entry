import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function inspectFullPayload() {
    try {
        const doc = await prisma.processedDocument.findFirst({
            where: { resourceId: 'unknown' },
            orderBy: { createdAt: 'desc' }
        });

        if (!doc) {
            console.log('No "unknown" documents found.');
            return;
        }

        console.log(`--- Full Payload for Document ${doc.id} ---`);
        console.log(JSON.stringify(doc.rawPayload, null, 2));
    } catch (error) {
        console.error('Error inspecting payload:', error);
    } finally {
        await prisma.$disconnect();
    }
}

inspectFullPayload();
