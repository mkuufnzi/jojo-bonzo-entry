import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanup() {
    console.log('🧹 Starting Branding History cleanup...');
    try {
        const count = await prisma.processedDocument.deleteMany({});
        console.log(`✅ Deleted ${count.count} branding history items.`);
    } catch (error) {
        console.error('❌ Failed to delete branding history:', error);
    } finally {
        await prisma.$disconnect();
    }
}

cleanup();
