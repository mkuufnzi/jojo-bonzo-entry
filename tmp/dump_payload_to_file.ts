import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

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

        fs.writeFileSync('tmp/payload_dump.json', JSON.stringify(doc.rawPayload, null, 2));
        console.log(`Full payload for ${doc.id} written to tmp/payload_dump.json`);
    } catch (error) {
        console.error('Error inspecting payload:', error);
    } finally {
        await prisma.$disconnect();
    }
}

inspectFullPayload();
