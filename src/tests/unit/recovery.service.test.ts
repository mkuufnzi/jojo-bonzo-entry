
// 1. Define constants for mocks (prefix with mock)
const mockAdd = jest.fn().mockResolvedValue({ id: 'job_1' });
const mockCreateQueue = jest.fn().mockImplementation(() => ({
    add: mockAdd
}));

// 2. Mock modules (hoisted)
jest.mock('../../lib/queue', () => ({
    __esModule: true,
    QUEUES: {
        RECOVERY_ENGINE: 'recovery-engine'
    },
    createQueue: (...args: any[]) => mockCreateQueue(...args)
}));

jest.mock('../../lib/prisma', () => ({
    __esModule: true,
    default: {
        integration: { findFirst: jest.fn() },
        debtCollectionAction: { 
            findFirst: jest.fn(),
            create: jest.fn(),
            count: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn()
        },
        debtCollectionSequence: { 
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            findMany: jest.fn(),
            upsert: jest.fn(),
            updateMany: jest.fn()
        },
        debtCollectionSession: {
            findFirst: jest.fn(),
            create: jest.fn(),
            count: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
            findUnique: jest.fn()
        },
        workflow: {
            findFirst: jest.fn()
        },
        contact: {
            findMany: jest.fn().mockResolvedValue([]),
            findFirst: jest.fn()
        },
        user: {
            findMany: jest.fn().mockResolvedValue([])
        },
        debtCollectionCustomer: {
            findFirst: jest.fn(),
            upsert: jest.fn()
        },
        debtCollectionCustomerProfile: {
            findUnique: jest.fn(),
            upsert: jest.fn()
        },
        debtCollectionInvoice: {
            upsert: jest.fn(),
            findMany: jest.fn().mockResolvedValue([])
        },
        debtCollectionCluster: {
            findMany: jest.fn().mockResolvedValue([])
        },
        debtCollectionStateHistory: {
            createMany: jest.fn()
        },
        workflowExecutionLog: {
            create: jest.fn()
        },
        notification: {
            create: jest.fn()
        }
    }
}));

jest.mock('../../services/integrations/providers/quickbooks.provider');

jest.mock('../../services/workflow.service', () => ({
    workflowService: {
        executeAction: jest.fn().mockResolvedValue({ success: true })
    }
}));

// 3. Imports
import { RecoveryService } from '../../modules/recovery/recovery.service';
import prisma from '../../lib/prisma';
import { QBOProvider } from '../../services/integrations/providers/quickbooks.provider';
import { workflowService } from '../../services/workflow.service';
import * as queueLib from '../../lib/queue';

describe('RecoveryService', () => {
    let service: RecoveryService;
    const mockBusinessId = 'biz_test_123';

    beforeEach(() => {
        service = new RecoveryService();
        jest.clearAllMocks();
        // Reset the mock implementation in case it was changed
        mockCreateQueue.mockReturnValue({ add: mockAdd });
        (prisma.contact.findMany as jest.Mock).mockResolvedValue([
            { externalId: 'cust_1', email: 'test-customer-cust_1@example.com' }
        ]);
    });

    describe('syncOverdueInvoices', () => {
        const mockOverdueInvoices = [
            { 
                externalId: 'inv_1', 
                total: 100, 
                status: 'overdue',
                contactName: 'John Doe',
                dueDate: '2026-01-01',
                rawData: { CustomerRef: { value: 'cust_1', name: 'John Doe' } }
            }
        ];

        it('should create sessions from manual invoices and bypass QBO', async () => {
            (prisma.debtCollectionSequence.findMany as jest.Mock).mockResolvedValue([{ 
                id: 'seq_1', 
                isActive: true, 
                isDefault: true,
                steps: [{ day: 1, action: 'email' }],
                rules: {} 
            }]);

            const result = await service.syncOverdueInvoices(mockBusinessId, mockOverdueInvoices);

            expect(result.success).toBe(true);
            expect(result.synced).toBe(1);
            expect(QBOProvider).not.toHaveBeenCalled(); 
            expect(prisma.debtCollectionSession.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    externalInvoiceId: 'inv_1',
                    customerId: 'cust_1',
                    customerName: 'John Doe',
                    status: 'ACTIVE'
                })
            }));
        });

        it('should resolve customer emails correctly in manual mode', async () => {
            (prisma.debtCollectionSequence.findMany as jest.Mock).mockResolvedValue([{ 
                id: 'seq_1', 
                isActive: true, 
                isDefault: true,
                steps: [{ day: 1, action: 'email' }],
                rules: {} 
            }]);

            await service.syncOverdueInvoices(mockBusinessId, mockOverdueInvoices);

            const createCall = (prisma.debtCollectionSession.create as jest.Mock).mock.calls[0][0];
            expect(createCall.data.metadata.customerEmail).toBe('test-customer-cust_1@example.com');
        });
    });

    describe('findApplicableSequence', () => {
        const mockInvoice = { total: 500 };
        const mockSequences = [
            { id: 'seq_high', rules: { minAmount: 1000 }, isActive: true },
            { id: 'seq_mid', rules: { minAmount: 100, maxAmount: 600 }, isActive: true },
            { id: 'seq_default', isDefault: true, isActive: true, rules: {} }
        ];

        it('should select sequence based on amount rules', async () => {
            const seq = await service.findApplicableSequence(mockBusinessId, mockInvoice, mockSequences);
            expect(seq.id).toBe('seq_mid');
        });

        it('should fallback to default sequence if no rules match', async () => {
            const smallInvoice = { total: 50 };
            const seq = await service.findApplicableSequence(mockBusinessId, smallInvoice, mockSequences);
            expect(seq.id).toBe('seq_default');
        });
    });

    describe('processRecovery', () => {
        const mockRequest = {
            businessId: mockBusinessId,
            externalInvoiceId: 'inv_1',
            customerEmail: 'test@example.com',
            amount: 100,
            currency: 'USD',
            dueDate: new Date()
        };

        const mockSession = {
            id: 'session_1',
            currentStepIndex: 0,
            metadata: { customerName: 'John Doe' },
            sequence: {
                steps: [
                    { day: 1, action: 'email', templateId: 't1' },
                    { day: 7, action: 'email', templateId: 't2' }
                ]
            }
        };

        it('should dispatch to workflowService for recovery_email action', async () => {
            (prisma.debtCollectionSession.findFirst as jest.Mock).mockResolvedValue(mockSession);
            (prisma.debtCollectionAction.create as jest.Mock).mockResolvedValue({ id: 'act_1' });

            const result = await service.processRecovery(mockRequest);

            expect(result.success).toBe(true);
            expect(workflowService.executeAction).toHaveBeenCalledWith(
                expect.stringContaining('recovery-session_1'),
                expect.objectContaining({ type: 'recovery_email', templateId: 't1' }),
                expect.objectContaining({ customerEmail: 'test@example.com' }),
                'system',
                mockBusinessId
            );
            expect(prisma.debtCollectionAction.update).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({ status: 'sent' })
            }));
        });

        it('should advance step index and calculate nextActionAt', async () => {
            (prisma.debtCollectionSession.findFirst as jest.Mock).mockResolvedValue(mockSession);
            (prisma.debtCollectionAction.create as jest.Mock).mockResolvedValue({ id: 'act_1' });

            await service.processRecovery(mockRequest);

            expect(prisma.debtCollectionSession.update).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 'session_1' },
                data: expect.objectContaining({
                    currentStepIndex: 1,
                    nextActionAt: expect.any(Date)
                })
            }));
        });
    });

    describe('Utility Logic', () => {
        it('calculateNextActionDate should respect day offsets', () => {
            const futureDate = new Date();
            futureDate.setFullYear(futureDate.getFullYear() + 1);
            futureDate.setMonth(1); 
            futureDate.setDate(1);
            
            const steps = [{ day: 5 }];
            
            const nextDate = (service as any).calculateNextActionDate(steps, 0, futureDate);
            
            // Should be futureDate (Feb 1) + 5 days = Feb 6
            expect(nextDate.getDate()).toBe(6);
            expect(nextDate.getMonth()).toBe(1); 
        });

        it('injectVariables should replace {{key}} with data[key]', () => {
            const template = 'Hello {{name}}, your balance is {{amount}}';
            const data = { name: 'John', amount: '$100' };
            
            const result = (service as any).injectVariables(template, data);
            
            expect(result).toBe('Hello John, your balance is $100');
        });
    });

    describe('processBusinessOverdues', () => {
        it('should queue actions for sessions due now', async () => {
            const mockDueSessions = [
                { 
                    id: 'sess_1', 
                    externalInvoiceId: 'inv_1', 
                    currentStepIndex: 0,
                    metadata: { amount: 100, customerEmail: 'a@b.com' } 
                }
            ];

            (prisma.debtCollectionSession.findMany as jest.Mock).mockResolvedValue(mockDueSessions);
            
            await service.processBusinessOverdues(mockBusinessId);

            expect(mockAdd).toHaveBeenCalledWith(
                'recovery:execute',
                expect.objectContaining({ externalInvoiceId: 'inv_1' }),
                expect.objectContaining({ jobId: expect.stringContaining('exec_sess_1_0') })
            );
        });
    });
});
