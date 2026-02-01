
// Use ts-node register to allow importing TS files
require('ts-node').register({ transpileOnly: true });

const { workflowService } = require('../src/services/workflow.service');
const { pdfService } = require('../src/services/pdf.service');
const { storageService } = require('../src/services/storage.service');
const prisma = require('../src/lib/prisma').default;
const { v4: uuid } = require('uuid');
const axios = require('axios');

// Mock Axios
const mockPost = async (url, data) => {
    console.log('Mock Axios Post called to:', url);
    return {
        status: 200,
        data: [{ html: '<html><body>Branded Content</body></html>' }]
    };
};

axios.post = mockPost;
if (axios.default) {
    axios.default.post = mockPost;
}

async function main() {
    console.log('🧪 Starting Manual Verification (JS) for N8N Processing...');

    const businessId = uuid();
    const userId = uuid();
    const workflowId = uuid();
    const appId = uuid(); 

    try {
        console.log('Creating DB records...');
        await prisma.business.create({
            data: { id: businessId, name: 'Test Biz n8n JS' }
        });
        await prisma.user.create({
            data: { id: userId, email: `n8n-js-${uuid()}@example.com`, businessId }
        });
        await prisma.app.create({
            data: { id: appId, name: 'System App JS', apiKey: `key-${uuid()}`, userId }
        });
        await prisma.workflow.create({
            data: {
                id: workflowId,
                businessId,
                name: 'Test Workflow JS',
                triggerType: 'webhook',
                actionConfig: { type: 'apply_branding' }
            }
        });

        console.log('✅ Setup DB Records');

        // Monkey Patch Services (Modify the singleton instances)
        pdfService.generatePdfFromHtml = async (html) => {
            console.log(`✅ Mock PdfService called. HTML Length: ${html.length}`);
            return Buffer.from('mock-pdf-content');
        };

        storageService.saveFile = async (uid, buff, fname, folder) => {
            console.log(`✅ Mock StorageService called. Filename: ${fname}`);
            return `/uploads/processed/${fname}`; 
        };

        const payload = {
            type: 'invoice.created',
            normalizedEventType: 'invoice.created',
            provider: 'quickbooks',
            id: 'external-id-999'
        };

        console.log('▶️ Calling executeAction...');
        
        const result = await workflowService.executeAction(
            workflowId,
            { type: 'apply_branding' },
            payload,
            userId
        );

        console.log('Result:', result);

        // Verify ProcessedDocument update
        const processedDoc = await prisma.processedDocument.findFirst({
            where: { userId, resourceId: 'external-id-999' }
        });

        if (!processedDoc) {
            throw new Error('ProcessedDocument not found');
        }

        console.log('ProcessedDocument Status:', processedDoc.status);
        console.log('ProcessedDocument BrandedUrl:', processedDoc.brandedUrl);

        if (processedDoc.status === 'completed' && processedDoc.brandedUrl && processedDoc.brandedUrl.includes('branded-external-id-999')) {
            console.log('✅ Success! Workflow correctly processed output and updated DB.');
        } else {
            throw new Error(`Verification Failed. Status: ${processedDoc.status}`);
        }

    } catch (e) {
        console.error('❌ Verification Error:', e);
        process.exit(1);
    } finally {
        console.log('🧹 Cleanup...');
        try {
            await prisma.processedDocument.deleteMany({ where: { businessId } });
            await prisma.workflow.deleteMany({ where: { businessId } });
            await prisma.app.deleteMany({ where: { userId } });
            await prisma.user.deleteMany({ where: { businessId } });
            await prisma.business.delete({ where: { id: businessId } });
            await prisma.$disconnect();
        } catch (err) {
            console.error('Cleanup failed:', err);
        }
    }
}

main();
