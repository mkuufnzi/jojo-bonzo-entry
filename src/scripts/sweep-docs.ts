import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function sweepStuckDocuments() {
    try {
        console.log('🧹 Starting cleanup of stuck processed documents...');
        
        // Find all documents stuck in 'processing' state
        const stuckDocs = await prisma.processedDocument.findMany({
            where: {
                status: 'processing'
            }
        });

        console.log(`Found ${stuckDocs.length} documents stuck in 'processing' state.`);

        if (stuckDocs.length === 0) {
            console.log('✨ Database is already clean. No action needed.');
            return;
        }

        // Update them all to 'timeout'
        // Alternatively we can use 'failed', but 'timeout' is more accurate for a missed webhook
        const result = await prisma.processedDocument.updateMany({
            where: {
                status: 'processing'
            },
            data: {
                status: 'timeout',
                errorMessage: 'Webhook completion callback timed out or was misrouted.',
                updatedAt: new Date()
            }
        });

        console.log(`✅ Successfully marked ${result.count} documents as 'timeout'.`);
        
    } catch (error) {
        console.error('❌ Error during cleanup:', error);
    } finally {
        await prisma.$disconnect();
    }
}

sweepStuckDocuments();
