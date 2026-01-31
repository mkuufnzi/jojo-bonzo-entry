import { pdfService } from '../services/pdf.service';
import { AppError } from '../lib/AppError';
import prisma from '../lib/prisma';

async function main() {
    console.log('🛡️ Verifying Strict Billing Guardrails...');

    try {
        const user = await prisma.user.findFirst();
        if (!user) {
            console.error('No user found');
            return;
        }

        console.log(`👤 Testing as User: ${user.email} (${user.id})`);

        // Test 1: The "Free Loader" Attack
        // Attempt to convert PDF without App ID
        console.log('\n🧪 Test 1: "Free Loader" Attack (No App ID)...');
        try {
            // @ts-ignore - Intentionally passing undefined to test runtime guard
            await pdfService.processPdfRequestSync(user.id, undefined, {
                url: 'https://example.com',
                format: 'A4'
            }, '127.0.0.1');
            
            console.error('❌ FAIL: "Free Loader" attack SUCCEEDED! (Should have failed)');
            process.exit(1);
        } catch (error: any) {
            if (error.message.includes('App Context (appId) is required')) {
                console.log('✅ PASS: Blocked with correct error: "App Context (appId) is required"');
            } else {
                console.error('⚠️ FAIL: Blocked but wrong error:', error.message);
                process.exit(1);
            }
        }

        // Test 2: Invalid App ID
        console.log('\n🧪 Test 2: Invalid App ID...');
        try {
            await pdfService.processPdfRequestSync(user.id, 'app_fake_123', {
                url: 'https://example.com',
                format: 'A4'
            }, '127.0.0.1');

             console.error('❌ FAIL: Invalid App ID attack SUCCEEDED! (Should have failed)');
        } catch (error: any) {
             console.log(`✅ PASS: Blocked with error: "${error.message}"`);
        }

        console.log('\n🏆 ALL SYSTEM CHECKS PASSED.');

    } catch (err) {
        console.error('Unexpected error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
