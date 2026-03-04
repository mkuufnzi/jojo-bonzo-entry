import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔄 [Reset] Deactivating all recovery sequences...');
    
    try {
        const result = await prisma.dunningSequence.updateMany({
            data: { isActive: false }
        });
        
        console.log(`✅ [Reset] Deactivated ${result.count} sequences.`);
        
        // Also cleanup test dunning actions to start fresh
        const actions = await prisma.dunningAction.deleteMany({
            where: {
                externalInvoiceId: {
                    contains: 'E2E-INV-P3-'
                }
            }
        });
        console.log(`✅ [Reset] Cleaned up ${actions.count} test dunning actions.`);

    } catch (error) {
        console.error('❌ [Reset] Failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(console.error);
