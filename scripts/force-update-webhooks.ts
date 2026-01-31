
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });

const prisma = new PrismaClient();

async function main() {
    console.log('🔄 Force-updating AI Webhook Configuration...');

    const serviceSlug = 'ai-doc-generator';
    const service = await prisma.service.findUnique({
        where: { slug: serviceSlug }
    });

    if (!service) {
        console.error(`❌ Service ${serviceSlug} not found!`);
        return;
    }

    const currentConfig = service.config as any || {};
    const webhooks = currentConfig.webhooks || {};

    const generateUrl = process.env.N8N_WEBHOOK_AI_GENERATE;
    const analyzeUrl = process.env.N8N_WEBHOOK_AI_ANALYZE;
    const formatUrl = process.env.N8N_WEBHOOK_AI_FORMAT;

    if (!generateUrl || !analyzeUrl || !formatUrl) {
         console.error('❌ Missing Env Vars despite loading .env.development');
         return;
    }

    // Force update the URLs
    webhooks.generate = { ...webhooks.generate, url: generateUrl };
    webhooks.analyze = { ...webhooks.analyze, url: analyzeUrl };
    webhooks.format = { 
        url: formatUrl, 
        method: 'POST', 
        label: 'Format Document',
        description: 'Phase 3: Final HTML formatting'
    };

    const newConfig = {
        ...currentConfig,
        webhooks
    };

    await prisma.service.update({
        where: { slug: serviceSlug },
        data: { config: newConfig }
    });

    console.log(`✅ Updated ${serviceSlug} webhooks to:`);
    console.log(`   Generate: ${generateUrl}`);
    console.log(`   Analyze: ${analyzeUrl}`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
