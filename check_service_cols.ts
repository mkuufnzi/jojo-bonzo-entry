import prisma from './src/lib/prisma';

async function checkServiceTable() {
    console.log('--- SERVICE TABLE DIAGNOSTIC ---');
    try {
        // Raw query to check columns in PostgreSQL
        const result = await prisma.$queryRaw`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'Service'
        `;
        console.log('Columns in Service table:');
        console.table(result);

        const services = await prisma.service.findMany({ take: 1 });
        console.log('Sample service record:', services[0]);
    } catch (e) {
        console.error('Error checking Service table:', e);
    } finally {
        await prisma.$disconnect();
    }
}

checkServiceTable();
