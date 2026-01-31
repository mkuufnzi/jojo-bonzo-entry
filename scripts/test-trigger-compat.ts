import { WorkflowService } from '../src/services/workflow.service';
import prisma from '../src/lib/prisma';
import { logger } from '../src/lib/logger';

async function testTriggerCompat() {
    process.env.APP_URL = 'http://localhost:3002'; // Required for config validation
    const workflowService = new WorkflowService();

    // 1. Find a test user with a business
    const user = await prisma.user.findFirst({
        where: { businessId: { not: null } },
        include: { business: true }
    });

    if (!user || !user.businessId) {
        console.error('❌ No user with businessId found for testing.');
        process.exit(1);
    }

    console.log(`\n🧪 Testing Trigger Compatibility for User: ${user.email} (${user.id})`);
    console.log(`🏢 Business: ${user.business?.name} (${user.businessId})\n`);

    // 2. Create a temporary 'invoice.created' workflow if none exists
    let testWorkflow = await prisma.workflow.findFirst({
        where: { 
            businessId: user.businessId,
            triggerType: 'webhook',
            isActive: true,
            triggerConfig: { path: ['event'], equals: 'invoice.created' }
        }
    });

    if (!testWorkflow) {
        console.log('📝 Creating temporary test workflow with trigger: invoice.created');
        testWorkflow = await prisma.workflow.create({
            data: {
                businessId: user.businessId,
                name: 'TEST: Compat Trigger',
                description: 'Verify invoice.updated matches invoice.created',
                triggerType: 'webhook',
                isActive: true,
                triggerConfig: { event: 'invoice.created' },
                actionConfig: { type: 'ping' } // Minimal action
            }
        });
    } else {
        console.log(`✅ Using existing workflow: ${testWorkflow.name} (Trigger: ${(testWorkflow.triggerConfig as any).event})`);
    }

    // 3. Simulate invoice.updated payload
    const payload = {
        type: 'invoice.updated',
        provider: 'qbo',
        entityId: 'test_123',
        entityType: 'invoice',
        payload: {
            _enriched: true,
            id: 'test_123',
            name: 'INV-TEST'
        }
    };

    console.log(`\n📡 Dispatching event: ${payload.type}...`);
    
    try {
        const results = await workflowService.processWebhook(user.id, payload);
        
        const match = results.find(r => r.workflowId === testWorkflow?.id);
        
        if (match && match.status === 'success') {
            console.log('\n✨ SUCCESS: Fuzzy matcher correctly triggered the workflow!');
            console.log('Result:', JSON.stringify(results, null, 2));
        } else {
            console.error('\n❌ FAILURE: Workflow was not triggered by the fuzzy matcher.');
            console.log('Results:', JSON.stringify(results, null, 2));
        }
    } catch (error) {
        console.error('❌ ERROR during dispatch:', error);
    } finally {
        // Cleanup if we created a temp workflow
        if (testWorkflow.name === 'TEST: Compat Trigger') {
            console.log('\n🧹 Cleaning up temporary workflow...');
            await prisma.workflow.delete({ where: { id: testWorkflow.id } });
        }
        await prisma.$disconnect();
    }
}

testTriggerCompat().catch(console.error);
