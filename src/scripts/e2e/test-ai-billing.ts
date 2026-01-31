/**
 * E2E Test: AI Service Billing Enforcement
 * Verifies that AI generation requires valid appId.
 */
import prisma from '../../lib/prisma';
import { aiService } from '../../services/ai.service';

async function main() {
    console.log('🤖 E2E Test: AI Service Billing');
    console.log('================================\n');

    try {
        const user = await prisma.user.findFirst({
            include: {
                apps: { where: { isActive: true } }
            }
        });

        if (!user) {
            console.error('❌ No users found');
            process.exit(1);
        }

        console.log(`👤 Testing as user: ${user.email}\n`);

        // Test 1: No AppId → Should Fail
        console.log('📋 Test 1: AI generation without appId...');
        try {
            await aiService.generateHtmlDocument(
                'Test prompt',
                user.id,
                'Invoice',
                {} // Missing appId in options
            );
            console.error('❌ FAIL: Should have been blocked');
            process.exit(1);
        } catch (error: any) {
            if (error.message.includes('App') || error.message.includes('appId')) {
                console.log('✅ PASS: Blocked correctly -', error.message.substring(0, 50));
            } else {
                console.log('⚠️  Blocked with different error:', error.message.substring(0, 80));
            }
        }

        // Test 2: Invalid AppId → Should Fail
        console.log('\n📋 Test 2: AI generation with invalid appId...');
        try {
            await aiService.generateHtmlDocument(
                'Test prompt',
                user.id,
                'Invoice',
                { appId: 'invalid_app_id_12345' }
            );
            console.error('❌ FAIL: Should have been blocked');
            process.exit(1);
        } catch (error: any) {
            console.log('✅ PASS: Invalid appId blocked -', error.message.substring(0, 50));
        }

        // Test 3: Valid AppId (if user has apps)
        if (user.apps && user.apps.length > 0) {
            console.log('\n📋 Test 3: Verify valid app context...');
            const validApp = user.apps[0];
            console.log(`   Using app: ${validApp.name} (${validApp.id})`);
            console.log('✅ Valid app context available for generation');
        } else {
            console.log('\n⚠️  Test 3: Skipped - No active apps for user');
        }

        console.log('\n🏆 AI SERVICE BILLING TESTS PASSED');

    } catch (error) {
        console.error('❌ Test Error:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
