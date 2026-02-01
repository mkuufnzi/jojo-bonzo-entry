
// @ts-nocheck
import { workflowService } from '../src/services/workflow.service';
import { pdfService } from '../src/services/pdf.service';
import { storageService } from '../src/services/storage.service';
import prisma from '../src/lib/prisma';
import { v4 as uuid } from 'uuid';
import axios from 'axios';

// Mock Axios? We can't easily mock axios import here because it's already imported by WorkflowService.
// BUT, WorkflowService.executeAction calls axios.post calls n8n.
// Since we want to test the SUCCESS path, we need axios.post to return success.
// We can try to monkey-patch axios if it's the default export?
// WorkflowService uses "import axios from 'axios'".
// Modifying require('axios').post might work if they share the sa// Use require for robust patching
const axios = require('axios');

const mockPost = async (url: string, data: any) => {
    console.log('Mock Axios Post called to:', url);
    return {
        status: 200,
        data: [{ html: '<html><body>Branded Content</body></html>' }]
    };
};

// Patch everywhere
axios.post = mockPost;
if (axios.default) {
    axios.default.post = mockPost;
}


async function main() {
    console.log('🧪 Starting Manual Verification for N8N Processing...');

    // 1. Setup Data
    const businessId = `test-biz-${uuid()}`;
    const userId = `test-user-${uuid()}`;
    const workflowId = `wf-${uuid()}`;
    const appId = `app-${uuid()}`; // Needs valid App

    // Create User, Business, App
    await prisma.business.create({
        data: { id: businessId, name: 'Test Biz n8n' }
    });
    await prisma.user.create({
        data: { id: userId, email: `n8n-${uuid()}@example.com`, businessId }
    });
    await prisma.app.create({
        data: { id: appId, name: 'System App', apiKey: `key-${uuid()}`, userId }
    });

    console.log('✅ Setup DB Records');

    // Create Workflow
    await prisma.workflow.create({
        data: {
            id: workflowId,
            businessId,
            name: 'Test Workflow',
            triggerType: 'webhook',
            actionConfig: { type: 'apply_branding' }
        }
    });

    // 2. Monkey Patch Services
    (pdfService as any).generatePdfFromHtml = async (html: string) => {
        console.log(`✅ Mock PdfService called. HTML Length: ${html.length}`);
        return Buffer.from('mock-pdf-content');
    };

    (storageService as any).saveFile = async (uid: string, buff: Buffer, fname: string, folder: string) => {
        console.log(`✅ Mock StorageService called. Filename: ${fname}`);
        return `/uploads/processed/${fname}`; // Fake URL
    };

    // 3. Invoke executeAction
    // We need to bypass private visibility.
    // Also we need `executeAction` signature: (workflowId, actionConfig, payload, userId)
    // AND it calculates `context` inside which needs `user.apps[0]`.
    
    // We can call it via `testWorkflow`? No, `testWorkflow` generates its own payload.
    // Let's call `executeAction` directly using `any` cast.

    const payload = {
        type: 'invoice.created',
        normalizedEventType: 'invoice.created',
        provider: 'quickbooks',
        id: 'external-id-123'
    };

    console.log('▶️ Calling executeAction...');
    
    // Note: executeAction checks user/apps internally.
    const result = await (workflowService as any).executeAction(
        workflowId,
        { type: 'apply_branding' },
        payload,
        userId
    );

    console.log('Result:', result);

    // 4. Verify DB
    // ProcessedDocument should be created inside executeAction
    // Wait, executeAction CREATES the processed document?
    // Let's check the code.
    // Yes: "const processedDoc = await prisma.processedDocument.create({...})"

    const processedDoc = await prisma.processedDocument.findFirst({
        where: { userId, resourceId: 'external-id-123' }
    });

    if (!processedDoc) {
        console.error('❌ Failed: ProcessedDocument not found');
        process.exit(1);
    }

    if (processedDoc.status === 'completed' && processedDoc.brandedUrl?.includes('branded-external-id-123')) {
        console.log(`✅ Success! ProcessedDocument Updated:`, processedDoc.brandedUrl);
    } else {
        console.error('❌ Failed: ProcessedDocument status/url incorrect:', processedDoc);
        process.exit(1);
    }

    // Cleanup
    console.log('🧹 Cleanup...');
    await prisma.processedDocument.deleteMany({ where: { businessId } });
    await prisma.workflow.deleteMany({ where: { businessId } });
    await prisma.app.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });

    console.log('✨ Done');
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
