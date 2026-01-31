// Hardcode env for script execution context
process.env.APP_URL = 'http://localhost:3002';
process.env.SESSION_SECRET = 'mock-secret-for-script-execution';
process.env.NODE_ENV = 'development';

import { designEngineService } from '../src/services/design-engine.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://root_admin:ChangeMe123!@127.0.0.1:5432/postgres?schema=application"
    },
  },
});

async function main() {
    // Find a user with a business
    const user = await prisma.user.findFirst({
        where: { business: { isNot: null } },
        include: { business: true }
    });

    if (!user) {
        console.log('No test user found with business.');
        return;
    }

    // Ensure 'system' app exists to prevent FK errors in logging
    const systemApp = await prisma.app.upsert({
        where: { id: 'system' },
        update: {},
        create: {
            id: 'system',
            name: 'System Internal',
            description: 'Internal System App',
            apiKey: 'sys_internal_key_' + Date.now(),
            userId: user.id 
        }
    });
    console.log(`✅ System App ensured: ${systemApp.id}`);

    console.log(`Testing Sync for User: ${user.email} (${user.id})`);
    
    try {
        const result = await designEngineService.syncOnboardingComplete(user.id);
        console.log('✅ Sync executed successfully.');
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (e: any) {
        console.error('❌ Sync Failed:', e.message);
        if (e.response) {
            console.error('Response Status:', e.response.status);
            console.error('Response Data:', e.response.data);
        }
    }
}

main().finally(() => prisma.$disconnect());
