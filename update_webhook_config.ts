
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
config({ path: '.env.development' });

const prisma = new PrismaClient();

async function main() {
    const slug = 'ai-doc-generator';
    const webhookUrl = process.env.AI_GENERATION_WEBHOOK_URL;

    if (!webhookUrl) {
        console.error('❌ AI_GENERATION_WEBHOOK_URL not found in .env');
        process.exit(1);
    }

    const service = await prisma.service.findUnique({ where: { slug } });
    if (!service) {
        console.error(`❌ Service ${slug} not found`);
        process.exit(1);
    }

    console.log(`Found Service: ${service.name}`);
    
    // Merge with existing config
    const currentConfig = (service.config as any) || {};
    const newConfig = {
        ...currentConfig,
        webhooks: {
            analyze: webhookUrl,
            generate: webhookUrl // Using same URL for now, n8n will route
        }
    };

    await prisma.service.update({
        where: { slug },
        data: { config: newConfig }
    });

    console.log(`✅ Updated Config for ${slug}:`, JSON.stringify(newConfig, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
