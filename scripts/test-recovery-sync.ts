import { RecoveryService } from '../src/modules/transactional/recovery/recovery.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runTest() {
    try {
        const business = await prisma.business.findFirst();
        if(!business) {
            console.log("No business found");
            return;
        }
        
        console.log(`Testing Sync for Business: ${business.id}`);
        const service = new RecoveryService();
        const result = await service.syncOverdueInvoices(business.id);
        console.log("Sync Result:", result);

        // Verify local storage
        const count = await prisma.externalDocument.count({
            where: { businessId: business.id, type: 'invoice' }
        });
        
        console.log(`✅ Current Local Invoice Cache Count: ${count}`);

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

runTest();
