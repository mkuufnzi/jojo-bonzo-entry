
import prisma from '../src/lib/prisma';

async function main() {
  console.log('🌱 Seeding QuickBooks Service Configuration...');

  const token = '45f7432c-1630-4cfb-97e3-75b642928ab7'; // From User Screenshot

  const service = await prisma.service.upsert({
    where: { slug: 'quickbooks' },
    update: {
      config: {
        verifierToken: token,
        webhooks: {
          notification: {
            url: '/api/v1/webhooks/quickbooks/notification',
            label: 'Event Notification',
            description: 'Receives Invoice/Customer updates from QBO'
          }
        }
      }
    },
    create: {
      slug: 'quickbooks',
      name: 'QuickBooks Integration',
      description: 'Core integration service for Intuit QuickBooks Online.',
      isActive: true,
      executionType: 'local',
      config: {
        verifierToken: token,
        webhooks: {
          notification: {
            url: '/api/v1/webhooks/quickbooks/notification',
            label: 'Event Notification',
            description: 'Receives Invoice/Customer updates from QBO'
          }
        }
      }
    }
  });

  const transactionalService = await prisma.service.upsert({
    where: { slug: 'transactional-core' },
    update: {
      name: 'Floovioo Transactional Core',
      description: 'The engine for converting raw ERP documents into branded assets.',
      isActive: true,
      executionType: 'webhook_async',
      pricePerRequest: 0.10
    },
    create: {
      slug: 'transactional-core',
      name: 'Floovioo Transactional Core',
      description: 'The engine for converting raw ERP documents into branded assets.',
      isActive: true,
      executionType: 'webhook_async',
      pricePerRequest: 0.10,
      config: {
        timeout: 30000,
        retryStrategy: { attempts: 3, delay: 1000 }
      }
    }
  });

  console.log('✅ QuickBooks Service Upserted:', service.id);
  console.log('✅ Transactional Core Service Upserted:', transactionalService.id);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
