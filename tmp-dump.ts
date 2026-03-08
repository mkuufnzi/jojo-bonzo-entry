import { PrismaClient, Prisma } from '@prisma/client';
import fs from 'fs';
const prisma = new PrismaClient();
async function run() {
  const doc = await prisma.processedDocument.findFirst({
    where: { rawPayload: { not: Prisma.DbNull } },
    orderBy: { createdAt: 'desc' },
  });
  if (doc?.rawPayload) {
    fs.writeFileSync('payload-dump.json', JSON.stringify(doc.rawPayload, null, 2));
    console.log('Payload dumped to payload-dump.json');
  } else {
    console.log('No payload found.');
  }
}
run().finally(() => prisma.$disconnect());
