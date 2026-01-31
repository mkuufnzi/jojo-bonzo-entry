import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const services = await prisma.service.findMany();
    console.log('--- Services ---');
    services.forEach(s => {
        console.log(`ID: ${s.id}`);
        console.log(`Slug: ${s.slug}`);
        console.log(`Config: ${JSON.stringify(s.config)}`);
        console.log('----------------');
    });
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
