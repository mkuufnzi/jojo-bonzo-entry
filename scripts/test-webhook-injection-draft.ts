
import { WebhookController } from '../src/controllers/webhook.controller';
import { workflowService } from '../src/services/workflow.service';
import prisma from '../src/lib/prisma';
import { Request, Response } from 'express';

// Mock dependencies
jest.mock('../src/lib/prisma', () => ({
    user: {
        findUnique: jest.fn()
    },
    integration: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn()
    },
    workflowExecutionLog: {
        create: jest.fn()
    },
    workflow: {
        findMany: jest.fn()
    }
}));

jest.mock('../src/services/workflow.service', () => ({
    workflowService: {
        processWebhook: jest.fn().mockResolvedValue([])
    }
}));

// Mock TokenManager (dynamic import)
jest.mock('../src/services/integrations/token.manager', () => ({
    TokenManager: {
        getValidAccessToken: jest.fn().mockResolvedValue('mock_access_token_123')
    }
}));

async function runTest() {
    console.log('🧪 Testing Webhook Token Injection...');

    const controller = new WebhookController();
    
    // Mock Request/Response
    const req = {
        params: { userId: 'user_123', provider: 'zoho' },
        body: { event: 'invoice.created', id: 'inv_001' }
    } as any;

    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
    } as any;

    // 1. Mock DB Responses
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ businessId: 'biz_123' });
    (prisma.integration.findFirst as jest.Mock).mockResolvedValue({ id: 'int_123', accessToken: 'old_token' });
    
    // 2. Execute
    await controller.handleErpWebhook(req, res);

    // 3. Verify
    console.log('\n--- Verification ---');
    
    // Check if TokenManager was "called" (via the side effect of req.body._auth)
    if (req.body._auth && req.body._auth.accessToken === 'mock_access_token_123') {
        console.log('✅ Token Injection Succeeded!');
        console.log('   _auth:', req.body._auth);
    } else {
        console.error('❌ Token Injection Failed.');
        console.error('   req.body:', req.body);
    }

    // Check if Workflow Service received the enriched payload
    const processWebhookMock = workflowService.processWebhook as jest.Mock;
    if (processWebhookMock.mock.calls.length > 0) {
        const payload = processWebhookMock.mock.calls[0][1];
        if (payload._auth) {
             console.log('✅ WorkflowService received enriched payload.');
        } else {
             console.error('❌ WorkflowService did NOT receive enriched payload.');
        }
    } else {
        console.error('❌ WorkflowService was never called.');
    }
}

// Run (needs ts-node)
// But wait, this uses jest mocks which won't work in a simple ts-node script without jest runner.
// I will rewrite to use simple manual mocks for a standalone script.
