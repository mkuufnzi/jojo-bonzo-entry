
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.userTemplate.count();
  console.log(`Total UserTemplates: ${count}`);
  
  const templates = await prisma.userTemplate.findMany();
  console.log('Templates:', JSON.stringify(templates, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
