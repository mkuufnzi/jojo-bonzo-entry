import prisma from '../src/lib/prisma';
import { templateGenerator } from '../src/services/template-generator.service';
import { logger } from '../src/lib/logger';

async function verifyUnifiedBranding() {
    console.log('🧪 [Test] Starting Unified Smart Document Verification');

    try {
        // 1. Get/Setup Test Data
        let user = await prisma.user.findFirst({ 
            where: { email: { contains: 'test' } },
            include: { business: true } 
        });
        
        if (!user) {
            console.log('⚠️ No test user found, looking for any user...');
            user = await prisma.user.findFirst({ include: { business: true } });
        }

        if (!user || !user.businessId) {
             throw new Error('Database must have at least one user with a business for this test.');
        }

        console.log(`👤 Testing with User: ${user.email}, Business: ${user.business?.name}`);

        // 2. Mock Payload with SKUs for Revenue Integration
        const payload = {
            docNumber: 'UNIFIED-TEST-001',
            customer: { name: 'Smart Customer', email: 'smart@example.com' },
            items: [
                { description: 'Premium Matcha Powder', sku: 'MAT-001', quantity: 2, rate: 34.50 },
                { description: 'Ceremonial Whisk Set', sku: 'ACC-004', quantity: 1, rate: 29.99 }
            ],
            currency: 'USD',
            provider: 'test_suite'
        };

        // 3. Generate HTML via Unified Service
        console.log('\n--- 📄 Testing Unified Rendering ---');
        const html = await templateGenerator.generateHtml(user.id, user.businessId, 'invoice', payload);
        
        // 4. Validate output
        const hasCustomer = html.includes('Smart Customer');
        const hasDocId = html.includes('UNIFIED-TEST-001');
        const hasRevenueItem = html.includes('Premium Matcha Powder');
        
        console.log('   Checks:');
        console.log(`   - Includes Customer Name: ${hasCustomer ? '✅' : '❌'}`);
        console.log(`   - Includes Document ID: ${hasDocId ? '✅' : '❌'}`);
        console.log(`   - Includes Line Items: ${hasRevenueItem ? '✅' : '❌'}`);

        if (hasCustomer && hasDocId && hasRevenueItem) {
            console.log('\n✅ Unified Smart Document Generation Successful!');
        } else {
            console.error('\n❌ Unified Generation Failed: Content missing in rendered HTML');
        }

    } catch (error: any) {
        console.error('💥 Verification Failed:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

verifyUnifiedBranding();
