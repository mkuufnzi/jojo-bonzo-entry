
import prisma from './src/lib/prisma';

async function testControllerLogic() {
    const provider = 'quickbooks';
    const businessId = '1a98aaf1-9c92-4d1f-b854-3da8899a310f'; // FlooviooTest1

    console.log('Testing Integration Lookup...');
    
    try {
        // 1. Find Integration
        const integration = await prisma.integration.findFirst({
            where: { businessId, provider }
        });
        console.log('Integration found:', integration ? 'YES' : 'NO', integration?.id);

        if (!integration) return;

        // 2. Test JSON Filter Query (Suspect)
        console.log('Testing JSON Filter Query...');
        const integrationDefinition = await prisma.integrationDefinition.findFirst({
            where: { 
                OR: [
                    { slug: provider },
                    { config: { path: ['provider'], equals: provider } } 
                ]
            }
        });
        console.log('Definition found (JSON Filter):', integrationDefinition ? 'YES' : 'NO', integrationDefinition?.name);

        // 3. Test Service Config
        console.log('Testing Service Lookup...');
        const serviceRecord = await prisma.service.findUnique({
            where: { slug: provider }
        });
        console.log('Service found:', serviceRecord ? 'YES' : 'NO', serviceRecord?.config);

    } catch (error) {
        console.error('CRASHED:', error);
    } finally {
        await prisma.$disconnect();
    }
}

testControllerLogic();
