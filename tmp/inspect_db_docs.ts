import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function inspectDocument() {
    try {
        console.log('--- Inspecting Recent ProcessedDocuments ---');
        const docs = await prisma.processedDocument.findMany({
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
                id: true,
                resourceId: true,
                provider: true,
                eventType: true,
                status: true,
                createdAt: true,
                rawPayload: true
            }
        });

        if (docs.length === 0) {
            console.log('No documents found.');
            return;
        }

        docs.forEach((doc, index) => {
            console.log(`\n[Document ${index + 1}]`);
            console.log(`ID: ${doc.id}`);
            console.log(`Resource ID: ${doc.resourceId}`);
            console.log(`Provider: ${doc.provider}`);
            console.log(`Event Type: ${doc.eventType}`);
            console.log(`Status: ${doc.status}`);
            console.log(`Created At: ${doc.createdAt}`);
            console.log(`Has rawPayload: ${!!doc.rawPayload}`);
            if (doc.rawPayload) {
                console.log('rawPayload (truncated):', JSON.stringify(doc.rawPayload).substring(0, 500) + '...');
                // Check specifically for "✨" in rawPayload
                const payloadStr = JSON.stringify(doc.rawPayload);
                if (payloadStr.includes('✨')) {
                    console.log('⚠️ CONTAINS SPARKLE EMOJI (✨)');
                } else {
                    console.log('No sparkle emoji found in rawPayload string representation.');
                }
            }
        });
    } catch (error) {
        console.error('Error inspecting documents:', error);
    } finally {
        await prisma.$disconnect();
    }
}

inspectDocument();
