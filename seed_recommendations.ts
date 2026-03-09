
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: 'bonzocreatives@gmail.com' },
    include: { business: true }
  });

  if (!user || !user.businessId) {
    console.log('User or Business not found');
    return;
  }

  const businessId = user.businessId;

  // Find an integration to link products to
  const integration = await prisma.integration.findFirst({
    where: { businessId }
  });

  if (!integration) {
    console.log('Integration not found for business');
    return;
  }

  // Create some products if they don't exist
  const products = [
    { 
        externalId: 'ext-p1',
        sku: 'SKU-001', 
        name: 'Product 1', 
        price: 100, 
        currency: 'GBP', 
        businessId,
        integrationId: integration.id,
        source: 'manual'
    },
    { 
        externalId: 'ext-p2',
        sku: 'SKU-002', 
        name: 'Product 2', 
        price: 200, 
        currency: 'GBP', 
        businessId,
        integrationId: integration.id,
        source: 'manual'
    }
  ];

  for (const p of products) {
    await prisma.unifiedProduct.upsert({
      where: { 
          businessId_integrationId_externalId: { 
              businessId, 
              integrationId: integration.id, 
              externalId: p.externalId 
          } 
      },
      update: {},
      create: p
    });
  }

  // Create a recommendation rule
  await prisma.recommendationRule.upsert({
    where: { id: 'test-rule-1' },
    update: {},
    create: {
      id: 'test-rule-1',
      name: 'Test Rule',
      businessId,
      triggerSku: 'SKU-001',
      targetSku: 'SKU-002',
      priority: 1,
      isActive: true
    }
  });

  console.log('Sample data created successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

