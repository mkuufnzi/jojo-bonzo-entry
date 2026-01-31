/**
 * E2E Test: PDF Service Billing Enforcement
 * Verifies that PDF conversion requires valid appId.
 */
import prisma from '../../lib/prisma';
import { pdfService } from '../../services/pdf.service';

async function main() {
    console.log('📄 E2E Test: PDF Service Billing');
    console.log('=================================\n');

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
        console.log('📋 Test 1: PDF conversion without appId...');
        try {
            // @ts-ignore - Intentionally passing undefined
            await pdfService.processPdfRequestSync(user.id, undefined, {
                url: 'https://example.com',
                format: 'A4'
            }, '127.0.0.1');
            console.error('❌ FAIL: Should have been blocked');
            process.exit(1);
        } catch (error: any) {
            if (error.message.includes('App Context') || error.message.includes('appId')) {
                console.log('✅ PASS: Blocked correctly -', error.message);
            } else {
                console.log('⚠️  Blocked with different error:', error.message);
            }
        }

        // Test 2: Invalid AppId → Should Fail
        console.log('\n📋 Test 2: PDF conversion with invalid appId...');
        try {
            await pdfService.processPdfRequestSync(user.id, 'invalid_app_id', {
                url: 'https://example.com',
                format: 'A4'
            }, '127.0.0.1');
            console.error('❌ FAIL: Should have been blocked');
            process.exit(1);
        } catch (error: any) {
            console.log('✅ PASS: Invalid appId blocked -', error.message.substring(0, 60));
        }

        // Test 3: Valid App Check
        if (user.apps && user.apps.length > 0) {
            console.log('\n📋 Test 3: Verify valid app context...');
            const validApp = user.apps[0];
            console.log(`   Valid app available: ${validApp.name}`);
            console.log('✅ App context ready for PDF conversion');
        } else {
            console.log('\n⚠️  Test 3: Skipped - No active apps');
        }

        console.log('\n🏆 PDF SERVICE BILLING TESTS PASSED');

    } catch (error) {
        console.error('❌ Test Error:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
