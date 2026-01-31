
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Design Engine Service...');

  const service = await prisma.service.upsert({
    where: { slug: 'design-engine' },
    update: {
        name: 'Design Engine',
        description: 'Enterprise Rendering Core for Transmuting Data into Visual Assets',
        isActive: true,
        executionType: 'local'
    },
    create: {
      name: 'Design Engine',
      slug: 'design-engine',
      description: 'Enterprise Rendering Core for Transmuting Data into Visual Assets',
      pricePerRequest: 0.05,
      executionType: 'local',
      isActive: true,
      config: {
          webhooks: {
              compose: { url: 'https://n8n.automation-for-smes.com/webhook/compose-layout', method: 'POST' },
              extract: { url: 'https://n8n.automation-for-smes.com/webhook/extract-brand', method: 'POST' }
          },
          paths: [
              { path: '/compose', billable: false },
              { path: '/render', billable: true }
          ]
      }
    }
  });

  console.log(`✅ Service Registered: ${service.name} (${service.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
