import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function diagnose() {
    console.log('🔍 Deep Inspection of Document 75 Items...');
    try {
        const doc = await prisma.processedDocument.findFirst({
            where: { resourceId: '75' },
            orderBy: { createdAt: 'desc' }
        });

        if (!doc) {
            console.log('❌ ProcessedDocument 75 not found.');
        } else {
            console.log('✅ Document Details:');
            const data: any = doc.rawPayload;
            
            // Log structure to find items
            console.log('Structure keys:', Object.keys(data));
            if (data.data) console.log('Data keys:', Object.keys(data.data));
            if (data.trigger) console.log('Trigger keys:', Object.keys(data.trigger));

            const items = data.items || data.trigger?.items || data.data?.trigger?.items;
            const qboLine = data.Line || data.trigger?.Line || data.data?.trigger?.payload?.Line;

            console.log('Items Array Found:', !!items, Array.isArray(items) ? items.length : 'N/A');
            console.log('QBO Line Array Found:', !!qboLine, Array.isArray(qboLine) ? qboLine.length : 'N/A');

            if (qboLine) {
                console.log('First QBO Line Sample:', JSON.stringify(qboLine[0], null, 2));
            }

            const total = data.TotalAmt || data.trigger?.TotalAmt || data.data?.trigger?.payload?.TotalAmt;
            console.log('Total Amount Found:', total);
        }

    } catch (error) {
        console.error('❌ Diagnostics failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

diagnose();
