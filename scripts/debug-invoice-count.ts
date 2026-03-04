
import { QBOProvider } from '../src/services/integrations/providers/quickbooks.provider';
import prisma from '../src/lib/prisma';

async function testQBO() {
    console.log('Testing QBO Provider...');
    
    // 1. Get Integration
    const businessId = '1a98aaf1-9c92-4d1f-b854-3da8899a310f'; // FlooviooTest1
    const integration = await prisma.integration.findFirst({
        where: { businessId, provider: 'quickbooks' }
    });

    if (!integration) {
        console.error('Integration not found');
        return;
    }

    // 2. Initialize
    const provider = new QBOProvider();
    await provider.initialize(integration);

    // 3. Test Connectivity Status (Query Counts)
    console.log('Fetching Connectivity Status...');
    const result = await provider.getInvoiceStats();
    console.log('Result:', result);

    await prisma.$disconnect();
}

testQBO();
