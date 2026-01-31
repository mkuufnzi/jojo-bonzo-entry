
import prisma from '../src/lib/prisma';

async function fixWebhooks() {
    console.log('🔧 Starting Webhook URL Fix...');

    try {
        const service = await prisma.service.findUnique({
            where: { slug: 'ai-doc-generator' }
        });

        if (!service) {
            console.error('❌ Service ai-doc-generator not found!');
            return;
        }

        const config = service.config as any;
        console.log('📝 Current Webhooks:', JSON.stringify(config.webhooks, null, 2));

        let updated = false;
        
        if (config.webhooks) {
            for (const key of Object.keys(config.webhooks)) {
                const webhook = config.webhooks[key];
                let url = typeof webhook === 'string' ? webhook : webhook.url;
                
                if (url && url.includes('/webhook-test/')) {
                    const newUrl = url.replace('/webhook-test/', '/webhook/');
                    console.log(`✨ Updating ${key}: ${url} -> ${newUrl}`);
                    
                    if (typeof webhook === 'string') {
                        config.webhooks[key] = newUrl;
                    } else {
                        config.webhooks[key].url = newUrl;
                    }
                    updated = true;
                }
            }
        }

        if (updated) {
            await prisma.service.update({
                where: { slug: 'ai-doc-generator' },
                data: { config }
            });
            console.log('✅ Service configuration updated successfully!');
        } else {
            console.log('ℹ️ No test webhooks found to update.');
        }

    } catch (error) {
        console.error('❌ Error fixing webhooks:', error);
    } finally {
        await prisma.$disconnect();
    }
}

fixWebhooks();
