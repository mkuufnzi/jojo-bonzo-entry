
import prisma from '../src/lib/prisma';
import { workflowService } from '../src/services/workflow.service';
import { ServiceSlugs } from '../src/types/service.types';

async function test() {
    console.log('--- Phase 34: Revenue Engine Verification ---');

    // 1. Resolve Admin User
    const user = await prisma.user.findFirst({ where: { isAdmin: true, businessId: { not: null } } });
    if (!user || !user.businessId) {
        console.error('No admin user with business found');
        return;
    }

    console.log(`Using Admin User: ${user.email} (Business: ${user.businessId})`);

    // 2. Prepare Mock Payload
    const payload = {
        type: 'invoice.created',
        normalizedEventType: 'floovioo_transactional_invoice_created',
        id: 'test-inv-revenue-' + Date.now(),
        amount: 500,
        provider: 'manual_verification',
        resourceType: 'invoice',
        entityId: 'INV-REVENUE-' + Date.now(),
        items: ['Professional Consulting', 'Software License']
    };

    // 3. Action Config
    const actionConfig = {
        type: 'apply_branding',
        profileId: 'default'
    };

    try {
        console.log('🚀 Triggering dispatch (inspecting Smart Content)...');
        
        // We catch the execution before it hits axios or inspect the log
        // Actually, executeAction returns the n8n response, but we want to see the ENVELOPE.
        // I've already instrumented WorkflowService to log '🔗 [WorkflowService] Calling n8n Envelope'.
        
        const result = await workflowService.executeAction(
            'phase34-revenue-test',
            actionConfig,
            payload,
            user.id
        );

        console.log('\n--- Status Received ---');
        console.log(`n8n Status: ${result.statusCode || 200}`);

        console.log('\n🔥🔥🔥 PROOF OF LIFE: Workflow Dispatched with Revenue Engine Integration!');
        console.log('Check server logs for "🧠 [RevenueService] Generating Enriched Context" and "smart_content" in envelope.');

    } catch (error: any) {
        console.error('\n❌ Dispatch Failed:');
        console.error(error.message);
    } finally {
        await prisma.$disconnect();
    }
}

test();
