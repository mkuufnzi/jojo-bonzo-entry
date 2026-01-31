// Hardcode env for service execution context - MUST BE FIRST
process.env.APP_URL = 'http://localhost:3002';
process.env.SESSION_SECRET = 'mock-secret';
process.env.NODE_ENV = 'development';

import { PrismaClient } from '@prisma/client';
import { designEngineService } from '../src/services/design-engine.service';

// Use production credentials (as per .env.development)
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://root_admin:ChangeMe123!@127.0.0.1:5432/postgres?schema=application"
    },
  },
});

// Hardcode env for service execution context
process.env.APP_URL = 'http://localhost:3002';
process.env.SESSION_SECRET = 'mock-secret';
process.env.NODE_ENV = 'development';

async function main() {
    console.log('🔍 Starting Final Verification Protocol...\n');

    // 1. Service Registry Audit
    console.log('1️⃣  Auditing Service Registry...');
    const services = await prisma.service.findMany({
        where: { slug: { contains: 'transactional' } }
    });

    if (services.length === 0) {
        console.error('❌ CRITICAL: No transactional services found!');
    } else if (services.length > 1) {
        console.error('❌ WARNING: Duplicate services found:');
        services.forEach(s => console.log(`   - ${s.name} (${s.slug})`));
    } else {
        const svc = services[0];
        console.log(`✅ Clean. Found 1 service: ${svc.name}`);
        console.log(`   Slug: ${svc.slug}`);
        
        // Check Webhook Config
        const config = svc.config as any;
        const webhookUrl = config?.webhooks?.onboarding_complete?.url || config?.webhooks?.onboarding_complete;
        
        if (webhookUrl) {
            console.log(`✅ Webhook Configured: ${webhookUrl}`);
        } else {
            console.error('❌ CRITICAL: onboarding_complete webhook MISSING in config!');
        }
    }
    console.log('');

    // 2. Integration & Payload Test
    console.log('2️⃣  Testing Webhook Dispatch...');
    
    // Find a valid user to test with
    const user = await prisma.user.findFirst({
        where: { business: { isNot: null } },
        include: { business: true }
    });

    if (!user) {
        console.log('⚠️ No test user found. Skipping payload test.');
    } else {
        console.log(`   Target User: ${user.email}`);
        
        // Ensure System App (dependency for logging)
        await prisma.app.upsert({
            where: { id: 'system' },
            create: {
                id: 'system',
                name: 'System Internal',
                apiKey: 'sys_verif_' + Date.now(),
                userId: user.id
            },
            update: {}
        });

        try {
            await designEngineService.syncOnboardingComplete(user.id);
            console.log('✅ syncOnboardingComplete executed successfully.');
        } catch (e: any) {
            console.error('❌ Webhook Dispatch Failed:', e.message);
        }
    }

    console.log('\n🏁 Verification Complete.');
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
