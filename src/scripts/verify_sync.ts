
import dotenv from 'dotenv';
dotenv.config({ path: 'environments/.env.development' });
import prisma from '../lib/prisma';
import { syncWorker } from '../services/integrations/sync.worker';

async function testSync() {
  try {
    // 1. Find a business with a Zoho integration
    const integration = await prisma.integration.findFirst({
        where: { provider: 'zoho' },
        include: { business: true }
    });

    if (!integration) {
      console.log('No Zoho integration found to test.');
      return;
    }

    console.log(`Starting sync for Business: ${integration.business.name} (${integration.businessId})`);
    
    // 2. Trigger Sync
    const result = await syncWorker.syncBusiness(integration.businessId);
    
    console.log('Sync Result:', JSON.stringify(result, null, 2));

    // 3. Check DB
    const count = await (prisma as any).externalDocument.count({
        where: { businessId: integration.businessId }
    });
    console.log(`Verified counts in ExternalDocument table: ${count}`);

  } catch (error) {
    console.error('Test Sync Failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testSync();
