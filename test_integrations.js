const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Checking Integrations for FlooviooTest1...");
    const businessId = '8bc0766d-b529-4f82-808f-63d4b9c85d39';
    
    const integrations = await prisma.integration.findMany({
        where: { businessId: businessId }
    });
    console.dir(integrations, { depth: null });
    
    process.exit(0);
}
main();
