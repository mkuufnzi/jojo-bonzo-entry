import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const service = await prisma.service.findUnique({
        where: { slug: 'transactional-core' }
    });

    console.log('Service:', service ? service.slug : 'NOT FOUND');
    if (service) {
        console.log('Config:', JSON.stringify(service.config, null, 2));
    }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
