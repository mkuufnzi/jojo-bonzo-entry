
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const targetId = 'a2dcc7c9-aac5-4e3d-9137-b64fa6ad0571';
  console.log(`Searching for Service ID: ${targetId}`);

  const service = await prisma.service.findUnique({
    where: { id: targetId }
  });

  if (!service) {
      console.log('Service NOT FOUND');
  } else {
      console.log('Service Found:', service.name, `(${service.slug})`);
      console.log('Config:', JSON.stringify(service.config, null, 2));
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
