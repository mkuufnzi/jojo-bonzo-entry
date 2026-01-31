import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function checkWebhookConfig() {
    console.log('🔍 Checking webhook configuration for ai-doc-generator...\n');
    
    try {
        const service = await prisma.service.findUnique({
            where: { slug: 'ai-doc-generator' }
        });
        
        if (!service) {
            console.log('❌ Service "ai-doc-generator" not found in database!');
            console.log('   You need to create the service entry with webhook configuration.');
            return;
        }
        
        console.log('✅ Service found:', service.name);
        console.log('   ID:', service.id);
        console.log('   Slug:', service.slug);
        console.log('   Enabled:', service.isActive);
        console.log('');
        
        const config = service.config as any;
        
        if (!config) {
            console.log('❌ No config found for this service!');
            return;
        }
        
        console.log('📋 Config:', JSON.stringify(config, null, 2));
        console.log('');
        
        if (!config.webhooks) {
            console.log('❌ No webhooks configuration found!');
            console.log('   Expected config.webhooks with keys: analyze, generate, format');
            return;
        }
        
        const requiredActions = ['analyze', 'generate', 'format'];
        const webhooks = config.webhooks;
        
        console.log('🔗 Webhook URLs:');
        for (const action of requiredActions) {
            if (webhooks[action]) {
                console.log(`   ✅ ${action}: ${webhooks[action]}`);
            } else {
                console.log(`   ❌ ${action}: MISSING!`);
            }
        }
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkWebhookConfig();
