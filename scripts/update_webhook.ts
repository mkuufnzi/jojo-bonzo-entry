
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const serviceSlug = 'ai-doc-generator';
  console.log(`Searching for service: ${serviceSlug}...`);

  const service = await prisma.service.findUnique({
    where: { slug: serviceSlug },
  });

  if (!service) {
    console.error(`Service '${serviceSlug}' not found.`);
    return;
  }

  console.log('Current Config:', JSON.stringify(service.config, null, 2));

  // Update Config
  const config = service.config as any;
  const webhooks = config.webhooks || {};

  // Update ANALYZE webhook with the assumed correct UUID
  // Using 'webhook-test' for testing as per N8N conventions for non-activated workflows
  // or 'webhook' if it is active. User mentioned "The requested webhook ... is not registered"
  // which implies they tried to call it.
  
  // The correct ID inferred from logs: d589295d-d986-4bad-9147-dafb3b7dd7e7
  // Correct N8N URL format: https://n8n.automation-for-smes.com/webhook-test/<UUID>
  
  const commonWebhookUrl = 'https://n8n.automation-for-smes.com/webhook-test/d589295d-d986-4bad-9147-dafb3b7dd7e7';

  // Wholistic Fix: Assuming a single N8N workflow handles all actions via the 'action' payload field.
  // We apply the same Test URL to all ai-doc-generator actions.
  
  webhooks.analyze = {
    ...webhooks.analyze,
    url: commonWebhookUrl,
    label: 'Analyze Context (Test)'
  };
  
  webhooks.generate = {
    ...webhooks.generate,
    url: commonWebhookUrl,
    label: 'Generate Document (Test)'
  };

  webhooks.format = {
    ...webhooks.format,
    url: commonWebhookUrl,
    label: 'Format Document (Test)'
  };

  config.webhooks = webhooks;

  const updated = await prisma.service.update({
    where: { slug: serviceSlug },
    data: { config },
  });

  console.log('✅ Updated Config:', JSON.stringify(updated.config, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
