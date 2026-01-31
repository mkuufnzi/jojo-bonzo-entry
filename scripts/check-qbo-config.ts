
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const service = await prisma.service.findFirst({
    where: { slug: 'quickbooks' }
  });

  console.log('--- QuickBooks Service Config ---');
  if (!service) {
    console.log('No QuickBooks service found.');
  } else {
      console.log(`ID: ${service.id}`);
      console.log(`Config: ${JSON.stringify(service.config, null, 2)}`);
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
