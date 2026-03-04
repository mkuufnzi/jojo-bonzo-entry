import { config } from 'dotenv';
config({ path: '.env.development' });
import { RecoveryService } from '../src/modules/transactional/recovery/recovery.service';
import prisma from '../src/lib/prisma';

async function test() {
    const r = new RecoveryService();
    const businessId = "726496ca-c4e9-4f37-9a9f-649721ac64da";
    
    console.log("Triggering Debt Collection Sync Pipeline...");
    
    try {
        await r.syncOverdueInvoices(businessId);
        
        const countI = await prisma.debtCollectionInvoice.count({ where: { businessId } });
        const countC = await prisma.debtCollectionCustomer.count({ where: { businessId } });
        
        console.log(`✅ Debt Collection Invoices in DB: ${countI}`);
        console.log(`✅ Debt Collection Customers in DB: ${countC}`);
        
        const sample = await prisma.debtCollectionCustomer.findFirst({
            where: { businessId }
        });
        
        console.log("\nSample Customer Profile Cached:");
        console.log(JSON.stringify(sample, null, 2));

    } catch (e) {
        console.error("Test failed", e);
    }
}

test().finally(() => process.exit(0));
