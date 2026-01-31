/**
 * Ensures every business has a "System Automation" app for ERP-triggered workflows
 * 
 * This script implements the architecture rule: "All API calls must have App + API Key"
 * For system-triggered workflows (like ERP webhooks), we auto-create a default app
 * with appropriate service scopes.
 */
import prisma from '../src/lib/prisma';
import { logger } from '../src/lib/logger';
import { v4 as uuid } from 'uuid';

/**
 * Get or create a default "System Automation" app for a business
 * @param businessId - The business ID to create the app for
 * @returns The App ID (existing or newly created)
 */
export async function ensureDefaultApp(businessId: string): Promise<string> {
  // Check if System Automation app already exists
  const user = await prisma.user.findFirst({ 
    where: { businessId },
    include: { apps: true }
  });
  
  if (!user) {
    throw new Error(`No user found for businessId: ${businessId}`);
  }
  
  const existingApp = user.apps.find(app => app.name === 'System Automation');
  if (existingApp) {
    logger.info({ businessId, appId: existingApp.id }, 'Using existing System Automation app');
    return existingApp.id;
  }
  
  // Create new System Automation app
  logger.info({ businessId }, 'Creating System Automation app');
  
  const app = await prisma.app.create({
    data: {
      id: uuid(),
      name: 'System Automation',
      description: 'Auto-created app for system-triggered workflows (ERP webhooks, scheduled tasks, etc.)',
      apiKey: `sk_system_${businessId.substring(0, 8)}_${uuid()}`,
      userId: user.id,
      isActive: true
    }
  });
  
  // Grant access to all transactional services
  const transactionalServices = await prisma.service.findMany({
    where: {
      OR: [
        { slug: { startsWith: 'transactional' } },
        { slug: 'ai-doc-gen' }, // Legacy service name
        { slug: 'pdf-gen' }     // Legacy service name
      ]
    }
  });
  
  logger.info({ 
    businessId, 
    appId: app.id, 
    serviceCount: transactionalServices.length 
  }, 'Granting service access to System Automation app');
  
  for (const service of transactionalServices) {
    await prisma.appService.create({
      data: {
        appId: app.id,
        serviceId: service.id,
        isEnabled: true
      }
    });
  }
  
  return app.id;
}

/**
 * Batch create System Automation apps for all businesses
 * Run this after migration to ensure all existing businesses have the default app
 */
export async function migrateAllBusinesses() {
  const businesses = await prisma.business.findMany({
    include: {
      users: {
        include: { apps: true },
        take: 1
      }
    }
  });
  
  logger.info({ count: businesses.length }, 'Starting migration: creating System Automation apps');
  
  let created = 0;
 let skipped = 0;
  
  for (const business of businesses) {
    const hasSystemApp = business.users[0]?.apps.some(app => app.name === 'System Automation');
    
    if (hasSystemApp) {
      skipped++;
      continue;
    }
    
    try {
      await ensureDefaultApp(business.id);
      created++;
    } catch (error) {
      logger.error({ businessId: business.id, error }, 'Failed to create System Automation app');
    }
  }
  
  logger.info({ created, skipped, total: businesses.length }, 'Migration complete');
  return { created, skipped };
}

// Allow running standalone
if (require.main === module) {
  migrateAllBusinesses()
    .then(({ created, skipped }) => {
      console.log(`✅ Migration complete: ${created} created, ${skipped} skipped`);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}
