import { SeederService } from '../src/services/seeder.service';
import prisma from '../src/lib/prisma';

async function main() {
  await SeederService.seed();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
