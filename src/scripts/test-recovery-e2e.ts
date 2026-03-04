import { PrismaClient } from '@prisma/client';
import { RecoveryService } from '../modules/recovery/recovery.service';

const prisma = new PrismaClient();
const svc = new RecoveryService();

async function main() {
    console.log('Fetching business...');
    const b = await prisma.business.findFirst();
    if (!b) return console.log('No business found');
    console.log(`Syncing recovery for business: ${b.id}`);
    
    // Step 1: Sync from External Integrations (e.g. QuickBooks) to create Dunning Actions
    console.log('--- STEP 1: Syncing Invoices into Active Sessions ---');
    const syncResult = await svc.syncOverdueInvoices(b.id);
    console.log('Sync Result:', syncResult);
    
    // Step 2: Poll Database for Due Actions and Push to n8n Queue/Engine
    console.log('\n--- STEP 2: Processing Business Overdues (Cron Dispatch) ---');
    const dispatchResult = await svc.processBusinessOverdues(b.id);
    console.log('Dispatch Result:', dispatchResult);
    
    process.exit(0);
}

main().catch(console.error);
