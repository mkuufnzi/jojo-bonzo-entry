import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function fixWebhook() {
  console.log('🔧 Injecting Recovery Webhook Config...');
  
  // The service slug used in WorkflowService
  const slug = 'floovioo_transactional_debt-collection';
  
  const service = await prisma.service.findUnique({ where: { slug } });
  
  if (!service) {
      console.log(`❌ Service ${slug} not found in DB!`);
      return;
  }
  
  // Merge existing config with new webhook config
  const existingConfig = (service.config as any) || {};
  const newConfig = {
      ...existingConfig,
      webhooks: {
          ...(existingConfig.webhooks || {}),
          recovery_action: {
              url: 'https://n8n.automation-for-smes.com/webhook-test/recovery-dispatch',
              method: 'POST',
              description: 'Smart Recovery Webhook'
          }
      }
  };
  
  await prisma.service.update({
      where: { id: service.id },
      data: { config: newConfig }
  });
  
  console.log(`✅ Webhook 'recovery_action' injected into ${slug}`);
}

fixWebhook()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
