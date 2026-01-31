
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: { id: true, email: true, name: true, role: true }
  });
  
  console.log('Recent Users:');
  console.table(users);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
