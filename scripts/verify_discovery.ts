
import { serviceRegistry } from '../src/services/service-registry.service';
import { aiService } from '../src/services/ai.service';
import prisma from '../src/lib/prisma';

async function verifyDiscovery() {
    console.log('🔍 Starting Service Discovery Verification...');

    // 1. Initialize Registry
    console.log('1. Loading Services...');
    await serviceRegistry.loadServices();

    // 2. Check Manifest Loading
    const manifest = serviceRegistry.getManifest('ai-doc-generator');
    if (!manifest) {
        console.error('❌ Manifest not loaded for ai-doc-generator');
        process.exit(1);
    }
    console.log('✅ Manifest Loaded:', manifest!.actions.map(a => a.key).join(', '));

    // 3. Verify Provider Registration
    const provider = serviceRegistry.getProvider('ai-doc-generator');
    if (!provider) {
         console.error('❌ Provider not registered for ai-doc-generator');
         process.exit(1);
    }
    console.log('✅ Provider Registered');

    // 4. Test Dynamic Dispatch (Simulation)
    console.log('4. Testing Dynamic Dispatch...');
    try {
        // Mock user
        const user = { id: 'test-user', email: 'test@example.com' };
        
        // Mocking method on instance
        const serviceAny = aiService as any;
        const originalGenerate = serviceAny.generateHtmlDocument;
        let called = false;
        
        serviceAny.generateHtmlDocument = async (...args: any[]) => {
            console.log('   ✅ aiService.generateHtmlDocument was called with action:', args[3]?.action);
            called = true;
            return { success: true };
        };

        await provider.executeAction('draft', { prompt: 'test' }, user);
        
        if (!called) {
            console.error('❌ Dispatch failed: generateHtmlDocument was NOT called');
        }

        // 5. Test "New Action" (Discovery)
        console.log('5. Testing New Action "refine"...');
        called = false;
        await provider.executeAction('refine', { prompt: 'test' }, user);
        
        if (called) {
             console.log('✅ Dispatch for "refine" succeeded (routed correctly)');
        } else {
             console.error('❌ Dispatch for "refine" failed');
        }

        // Restore
        aiService.generateHtmlDocument = originalGenerate;

    } catch (e) {
        console.error('❌ Verification Error:', e);
    }
}

verifyDiscovery().catch(console.error);
