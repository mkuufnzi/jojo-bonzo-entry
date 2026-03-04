const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: 'environments/.env.development' });

const prisma = new PrismaClient();

async function main() {
    try {
        const service = await prisma.service.findUnique({
            where: { slug: 'floovioo_transactional_debt-collection' }
        });
        console.log(JSON.stringify(service, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
