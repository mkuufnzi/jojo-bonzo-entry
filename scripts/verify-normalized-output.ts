import { workflowService } from '../src/services/workflow.service';
import { n8nPayloadFactory } from '../src/services/n8n/n8n-payload.factory';
import prisma from '../src/lib/prisma';
import axios from 'axios';

// Manual axios mock
const mockedAxiosPost = async (url: string, data: any) => {
    return { status: 200, data: { success: true } };
};
(axios as any).post = mockedAxiosPost;

async function verifyNormalization() {
    console.log('🧪 Starting Normalization & Event Naming Verification...\n');

    // 1. Find a test user
    const user = await prisma.user.findFirst({
        where: { businessId: { not: null } },
        include: { business: true }
    });

    if (!user) {
        console.error('❌ No test user found');
        return;
    }

    const workflowId = 'test-wf-id';
    const actionConfig = { type: 'apply_branding' };
    
    // 2. Simulate normalized event from QBO
    const payload = {
        type: 'invoice.created',
        provider: 'quickbooks',
        entityId: 'quickbooks_inv_123',
        entityType: 'invoice',
        normalizedEventType: 'transactional_branding_request',
        payload: {
            id: 'quickbooks_inv_123',
            DocNumber: '1001',
            TotalAmt: 500.00,
            _enriched: true
        }
    };

    console.log(`📡 Scenario: Integration sends normalized event with type: ${payload.normalizedEventType}`);

    // Capture the call to axios
    let capturedEnvelope: any = null;
    (axios.post as any) = async (url: string, data: any) => {
        capturedEnvelope = data;
        return { status: 200, data: { success: true } };
    };

    try {
        await workflowService.executeAction(workflowId, actionConfig, payload, user.id);

        if (!capturedEnvelope) {
            console.error('❌ n8n was not called');
            return;
        }

        console.log('✅ Captured n8n Envelope:', JSON.stringify(capturedEnvelope, null, 2));

        if (capturedEnvelope.eventType === 'transactional_branding_request') {
            console.log('\n✨ SUCCESS: n8n received the explicitly requested event type!');
        } else {
            console.error(`\n❌ FAILURE: Expected eventType "transactional_branding_request", but got "${capturedEnvelope.eventType}"`);
        }

        if (capturedEnvelope.data.trigger.normalizedEventType === 'transactional_branding_request') {
            console.log('✅ Integration data preserved in payload.');
        }

    } catch (error) {
        console.error('❌ Error during verification:', error);
    } finally {
        await prisma.$disconnect();
    }
}

verifyNormalization().catch(console.error);
