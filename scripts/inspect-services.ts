
import prisma from '../src/lib/prisma';

async function main() {
  const services = await prisma.service.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      config: true
    }
  });
  console.log(JSON.stringify(services, null, 2));
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
