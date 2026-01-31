
import prisma from '../src/lib/prisma';
import { workflowService } from '../src/services/workflow.service';
import axios from 'axios';
import { logger } from '../src/lib/logger';

// Mock Axios
const originalPost = axios.post;
let lastPostCall: any = null;

// Monkey-patching axios for this test script context
axios.post = async (url: string, data: any) => {
    console.log(`\n[MOCK] Axios POST intercept:`);
    console.log(`URL: ${url}`);
    console.log(`Payload:`, JSON.stringify(data, null, 2));
    lastPostCall = { url, data };
    return { 
        data: { success: true, mock: true, generatedPdf: 'http://mock.com/invoice.pdf' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
    } as any;
};

async function test() {
    console.log('--- Starting Workflow Live Test ---');

    // 1. Setup Data
    console.log('1. Setting up Test Data...');
    const email = `test-wf-${Date.now()}@example.com`;
    const user = await prisma.user.create({
        data: {
            email,
            password: 'hash',
            business: {
                create: {
                    name: 'Test Business',
                    city: 'Test City'
                }
            }
        }
    });

    try {
        const wf = await workflowService.createWorkflow(user.id, {
            name: 'Test Workflow',
            triggerType: 'webhook',
            triggerConfig: { event: 'invoice.created' },
            actionConfig: { type: 'apply_branding' }
        });
        console.log(`   Created User: ${user.id}`);
        console.log(`   Created Workflow: ${wf.id}`);
        
        // 2. Trigger Webhook Processing
        console.log('2. Triggering Webhook Processing...');
        const payload = {
            type: 'invoice.created',
            id: 'inv-1001',
            amount: 500,
            provider: 'zoho'
        };
        
        const results = await workflowService.processWebhook(user.id, payload);
        console.log('3. Results:', JSON.stringify(results, null, 2));

        // 3. Verification
        if (results.length > 0 && results[0].status === 'success') {
            console.log('✅ Workflow execution reported success.');
        } else {
            console.error('❌ Workflow execution failed or returned no results.');
            process.exit(1);
        }

        if (lastPostCall && lastPostCall.data.action === 'apply_branding') {
            console.log('✅ Axios Mock confirmed correct payload.');
        } else {
            console.error('❌ Axios Mock did NOT receive expected call.');
            process.exit(1);
        }

    } catch (error) {
        console.error('Test Failed:', error);
    } finally {
        // Cleanup
        console.log('4. Cleaning up...');
        await prisma.user.delete({ where: { id: user.id } });
        await prisma.business.delete({ where: { id: user.businessId! } }); // Cascade should handle wf
        
        // Restore axios (good practice)
        axios.post = originalPost;
        await prisma.$disconnect();
    }
}

test();
