
import { WorkflowService } from '../../services/workflow.service';
import prisma from '../../lib/prisma';
import { mockDeep } from 'jest-mock-extended';

// Mock Prisma
jest.mock('../../lib/prisma', () => ({
    __esModule: true,
    default: mockDeep(),
}));

// Mock Logger
jest.mock('../../lib/logger', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    }
}));

describe('WorkflowService.ensureDefaultWorkflow', () => {
    let service: WorkflowService;

    beforeEach(() => {
        service = new WorkflowService();
        jest.clearAllMocks();
    });

    test('should create default workflow if none exist', async () => {
        const userId = 'user-123';
        const businessId = 'biz-123';
        const provider = 'quickbooks';

        // Mock findFirst -> returns null (no existing workflow)
        (prisma.workflow.findFirst as jest.Mock).mockResolvedValue(null);
        
        // Mock create -> returns new workflow
        (prisma.workflow.create as jest.Mock).mockResolvedValue({
            id: 'wf-new',
            name: 'Auto-Brand New Invoices (Quickbooks)',
            isActive: true
        });

        await (service as any).ensureDefaultWorkflow(userId, businessId, provider);

        expect(prisma.workflow.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                businessId,
                triggerConfig: { provider: 'quickbooks', event: 'invoice.*' },
                actionConfig: { type: 'apply_branding', profileId: 'default' }
            })
        }));
    });

    test('should SKIP creation if workflow already exists', async () => {
        const userId = 'user-123';
        const businessId = 'biz-123';
        const provider = 'quickbooks';

        // Mock findFirst -> returns existing workflow
        (prisma.workflow.findFirst as jest.Mock).mockResolvedValue({
            id: 'wf-existing',
            triggerType: 'webhook',
            isActive: true
        });

        await (service as any).ensureDefaultWorkflow(userId, businessId, provider);

        expect(prisma.workflow.create).not.toHaveBeenCalled();
    });
});
