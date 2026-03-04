/**
 * Restore canonical n8n webhook URL for the Debt Collection AI service.
 * 
 * Run: npx ts-node tmp/restore_recovery_webhook.ts
 * 
 * This overwrites any stale URL that may have been injected manually.
 * The canonical URL comes from seeder.service.ts. In production this is
 * overridden by process.env.N8N_WEBHOOK_RECOVERY_EXECUTE.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const SLUG = 'floovioo_transactional_debt-collection';
const CANONICAL_URL = process.env.N8N_WEBHOOK_RECOVERY_EXECUTE 
    || 'https://n8n.automation-for-smes.com/webhook/ce76d8c1-5242-49c7-a350-02f55b7c2db4';

async function restore() {
    console.log('🔧 Restoring canonical Recovery webhook URL...');

    const service = await prisma.service.findUnique({ where: { slug: SLUG } });
    if (!service) {
        console.error(`❌ Service '${SLUG}' not found`);
        return;
    }

    const existingConfig = (service.config as any) || {};
    const existingWebhooks = existingConfig.webhooks || {};

    const updatedConfig = {
        ...existingConfig,
        webhooks: {
            ...existingWebhooks,
            recovery_action: {
                ...(existingWebhooks.recovery_action || {}),
                url:    CANONICAL_URL,
                method: 'POST',
                label:  'Trigger Recovery Action',
                description: 'Triggers the n8n workflow for sending recovery communications (email/sms)'
            }
        }
    };

    await prisma.service.update({
        where: { id: service.id },
        data:  { config: updatedConfig }
    });

    console.log(`✅ recovery_action URL restored → ${CANONICAL_URL}`);
}

restore()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
