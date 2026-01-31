
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const integrations = await prisma.integration.findMany({
    where: { provider: 'quickbooks' }
  });

  console.log('--- Connected QuickBooks Integrations ---');
  if (integrations.length === 0) {
    console.log('No QuickBooks integrations found.');
  } else {
    integrations.forEach(i => {
      console.log(`ID: ${i.id}`);
      console.log(`Business ID: ${i.businessId}`);
      console.log(`Metadata: ${JSON.stringify(i.metadata, null, 2)}`);
      
      // Try to parse Realm ID specifically
      const meta = i.metadata as any;
      if (meta && meta.realmId) {
          console.log(`👉 ACTUAL CONNECTED REALM ID: ${meta.realmId}`);
      }
    });
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
