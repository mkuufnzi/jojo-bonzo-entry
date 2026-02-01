
import { workflowService } from '../../services/workflow.service';
import prisma from '../../lib/prisma';
import axios from 'axios';
import { pdfService } from '../../services/pdf.service';
import { storageService } from '../../services/storage.service';
import { mockDeep } from 'jest-mock-extended';

// Mock Dependencies
jest.mock('axios');
jest.mock('../../lib/prisma', () => ({
    __esModule: true,
    default: mockDeep(),
}));
jest.mock('../../services/pdf.service', () => ({
    pdfService: {
        generatePdfFromHtml: jest.fn()
    }
}));
jest.mock('../../services/storage.service', () => ({
    storageService: {
        saveFile: jest.fn()
    }
}));
jest.mock('../../lib/logger', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    }
}));

describe('WorkflowService n8n Response Processing', () => {
    const userId = 'user-123';
    const businessId = 'biz-123';
    const workflowId = 'wf-123';
    const processedDocId = 'doc-123';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should process HTML response, generate PDF, and update DB', async () => {
        // 1. Setup Data
        const payload = {
            type: 'invoice.created',
            normalizedEventType: 'invoice.created',
            provider: 'quickbooks',
            id: 'inv-123'
        };

        const workflow = {
            id: workflowId,
            triggerConfig: { event: 'invoice.created', provider: 'quickbooks' },
            actionConfig: { type: 'apply_branding' }
        };

        // 2. Mock Prisma Calls
        (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: userId, businessId, apps: [{ id: 'app-1' }] });
        (prisma.processedDocument.create as jest.Mock).mockResolvedValue({ id: processedDocId, resourceId: 'inv-123' });
        (prisma.workflow.findUnique as jest.Mock).mockResolvedValue(workflow);

        // 3. Mock N8N Response (HTML)
        const n8nHtml = '<html><body>Branded Invoice</body></html>';
        (axios.post as jest.Mock).mockResolvedValue({
            status: 200,
            data: [{ html: n8nHtml }]
        });

        // 4. Mock Services
        (pdfService.generatePdfFromHtml as jest.Mock).mockResolvedValue(Buffer.from('PDF_CONTENT'));
        (storageService.saveFile as jest.Mock).mockResolvedValue('/uploads/branded.pdf');

        // 5. Execute Action (via private method access or mocking processWebhook logic)
        // Since executeAction is private, we can try to reach it via testWorkflow or casting
        // Or we can just call it if we cast service to any
        await (workflowService as any).executeAction(workflowId, workflow.actionConfig, payload, userId);

        // 6. Verify flow
        expect(pdfService.generatePdfFromHtml).toHaveBeenCalledWith(n8nHtml);
        expect(storageService.saveFile).toHaveBeenCalledWith(
            userId, 
            expect.any(Buffer), 
            expect.stringMatching(/branded-inv-123-.*\.pdf/), 
            'processed'
        );
        
        // 7. Verify DB Update
        expect(prisma.processedDocument.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: processedDocId },
            data: expect.objectContaining({
                status: 'completed',
                brandedUrl: '/uploads/branded.pdf'
            })
        }));
    });
});
