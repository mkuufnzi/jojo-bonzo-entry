
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  const user = await prisma.user.findUnique({
    where: { email: 'bwj.floovioo.test@gmail.com' },
    select: { id: true, email: true, businessId: true }
  });
  console.log('--- USER CHECK ---');
  console.log(JSON.stringify(user, null, 2));
  
  if (user && user.businessId) {
    const business = await prisma.business.findUnique({
      where: { id: user.businessId }
    });
    console.log('--- BUSINESS CHECK ---');
    console.log(JSON.stringify(business, null, 2));
  }
}

check().catch(console.error).finally(() => prisma.$disconnect());
