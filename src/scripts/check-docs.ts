import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const docs = await prisma.processedDocument.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  
  const mapped = docs.map(d => ({
    id: d.id,
    resourceId: d.resourceId,
    eventType: d.eventType,
    status: d.status,
    hasSnapshot: !!d.snapshotHtml,
    snapshotLength: d.snapshotHtml ? d.snapshotHtml.length : 0,
    hasRawPayload: !!d.rawPayload,
  }));
  
  console.log(JSON.stringify(mapped, null, 2));
}

run().catch(console.error).finally(() => prisma.$disconnect());
