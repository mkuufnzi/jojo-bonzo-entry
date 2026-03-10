import { PrismaClient } from '@prisma/client';

async function dumpServices() {
    const prisma = new PrismaClient();
    try {
        const services = await prisma.service.findMany();
        console.log('--- ALL SERVICES ---');
        services.forEach(s => {
            console.log(`Slug: ${s.slug}`);
            console.log(`Active: ${s.isActive}`);
            console.log(`Config Type: ${typeof s.config}`);
            console.log(`Config: ${JSON.stringify(s.config, null, 2)}`);
            console.log('-------------------');
        });
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

dumpServices();
