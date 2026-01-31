import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://root_admin:ChangeMe123!@127.0.0.1:5432/postgres?schema=application"
    },
  },
});

async function main() {
    const slug = 'transactional-core';
    const targetUrl = 'https://n8n.automation-for-smes.com/webhook/d8045423-38f0-48eb-97c9-89171fb9c080';

    const service = await prisma.service.findUnique({ where: { slug } });
    if (!service) throw new Error('Service not found');

    const config = service.config as any;
    
    // Add onboarding_complete
    config.webhooks.onboarding_complete = {
        url: targetUrl,
        label: "Onboarding: Unified Completion"
    };

    // Add data_sync for background syncs
    config.webhooks.data_sync = {
        url: targetUrl,
        label: "Data Sync: Entity Ingestion"
    };

    // Also fix default just in case
    if (!config.webhooks.default || !config.webhooks.default.url) {
        config.webhooks.default = {
            url: targetUrl,
            label: "Catch-All / Router"
        };
    }

    await prisma.service.update({
        where: { slug },
        data: { config }
    });

    console.log('✅ Updated service config with onboarding_complete and data_sync webhooks.');
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
