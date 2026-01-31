process.env.APP_URL = 'http://localhost:3002';
process.env.NODE_ENV = 'development';

import prisma from '../src/lib/prisma';
import { logger } from '../src/lib/logger';

async function seed() {
  logger.info('Starting Transactional Service Seed...');

  const serviceSlug = 'transactional-branding';
  
  // This URL is a placeholder. You should update it with your actual n8n Production Webhook URL
  // or set it via the ADMIN Dashboard later.
  const defaultN8nWebhook = 'https://n8n.automation-for-smes.com/webhook/d8045423-38f0-48eb-97c9-89171fb9c080'; 

  const serviceData = {
    name: 'Transactional Branding',
    slug: serviceSlug,
    description: 'Generates branded PDFs from transactional events via n8n.',
    pricePerRequest: 0.10, // Example pricing
    executionType: 'webhook_async',
    isActive: true,
    config: {
      webhooks: {
        // Default action for generic trigger
        default: {
            url: defaultN8nWebhook,
            method: 'POST',
            label: 'Catch-All / Router'
        },
        // [Standardized] Onboarding Step 1
        floovioo_onboarding_business_profile: {
            url: defaultN8nWebhook,
            method: 'POST',
            label: 'Onboarding: Business Profile'
        },
        // [Standardized] Onboarding Step 2
        floovioo_onboarding_integration_connected: {
            url: defaultN8nWebhook,
            method: 'POST',
            label: 'Onboarding: Integration Connected'
        },
        // [Standardized] Onboarding Step 3
        floovioo_onboarding_brand_settings: {
            url: defaultN8nWebhook,
            method: 'POST',
            label: 'Onboarding: Brand Settings'
        },
        // [Standardized] Onboarding Complete
        floovioo_onboarding_complete: {
            url: defaultN8nWebhook,
            method: 'POST',
            label: 'Onboarding: Final Completion'
        },
        // [Standardized] Unified Data Sync
        floovioo_onboarding_data_sync: {
            url: defaultN8nWebhook,
            method: 'POST',
            label: 'Onboarding: Data Sync'
        },
        // Real-time Event Triggers (Legacy/Direct)
        'invoice.created': {
            url: defaultN8nWebhook,
            method: 'POST',
            label: 'Invoice Created Event'
        }
      }
    }
  };

  const existing = await prisma.service.findUnique({
    where: { slug: serviceSlug }
  });

  if (existing) {
    logger.info(`Service '${serviceSlug}' already exists. Updating config...`);
    await prisma.service.update({
      where: { slug: serviceSlug },
      data: {
        config: serviceData.config,
        // Update other fields if necessary, but be careful not to overwrite custom pricing
        executionType: serviceData.executionType
      }
    });
  } else {
    logger.info(`Creating new service '${serviceSlug}'...`);
    await prisma.service.create({
      data: serviceData
    });
  }

  logger.info('✅ Transactional Service Seeded Successfully.');
}

seed()
  .catch((e) => {
    logger.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
