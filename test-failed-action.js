const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: 'environments/.env.development' });

const prisma = new PrismaClient();

async function main() {
    try {
        const failedAction = await prisma.dunningAction.findFirst({
            where: { status: 'failed' },
            orderBy: { id: 'desc' }
        });
        console.log(JSON.stringify(failedAction, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
