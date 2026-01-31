
import { aiService } from '../services/ai.service';
import prisma from '../lib/prisma';

async function main() {
    console.log('🛡️ Verifying AI Service Strict App Context...');

    try {
        const user = await prisma.user.findFirst();
        if (!user) {
            console.error('No user found');
            return;
        }

        console.log(`👤 Testing as User: ${user.email} (${user.id})`);

        // Test: The "Free Loader" Attack on AI
        console.log('\n🧪 Test: Attempting AI Generation without App ID...');
        try {
            // @ts-ignore - Intentionally passing undefined to test runtime guard
            await aiService.generateHtmlDocument(user.id, {
                prompt: 'Test Prompt',
                documentType: 'Invoice',
                // MISSING appId
            });
            
            console.error('❌ FAIL: AI Generation SUCCEEDED without App ID! (Should have failed)');
            process.exit(1);
        } catch (error: any) {
            if (error.message.includes('App Context (appId) is required') || error.message.includes('No App Connected')) {
                console.log('✅ PASS: Blocked with correct error:', error.message);
            } else {
                console.error('⚠️ FAIL: Blocked but wrong error:', error.message);
                console.error('Full Error:', error);
                process.exit(1);
            }
        }

        console.log('\n🏆 AI SECURITY CHECK PASSED.');

    } catch (err) {
        console.error('Unexpected error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
