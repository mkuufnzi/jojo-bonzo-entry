
import { designEngineService } from './src/services/design-engine.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🧪 Testing Design Engine Compose...');
    
    // 1. Get our known ROOT user
    const email = 'bonzocreatives@gmail.com';
    const user = await prisma.user.findUnique({ where: { email } });
    
    if(!user) throw new Error('User not found');

    // 2. Mock Payload (e.g. from an Invoice Created event)
    const payload = {
        type: 'invoice',
        options: { templateId: 'invoice_standard' }, // Force standard for test
        data: {
            number: 'INV-001',
            date: '2023-01-01',
            items: [{ desc: 'Test Item', price: 100 }]
        }
    };

    // 3. Compose
    try {
        const result = await designEngineService.composeLayout(payload, user.id);
        console.log('✅ Compose Success!');
        console.log('Layout ID:', result.layoutId);
        console.log('Branding:', JSON.stringify(result.branding, null, 2));
    } catch (e) {
        console.error('❌ Compose Failed:', e);
    }
}

main()
  .finally(async () => await prisma.$disconnect());
