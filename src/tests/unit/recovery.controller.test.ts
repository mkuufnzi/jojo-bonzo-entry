
import { Request, Response } from 'express';

// 1. Create a queue mock object that we can control
const mockQueue = {
    getJob: jest.fn(),
    add: jest.fn(),
    on: jest.fn()
};

// 2. Mock the library to return our object
jest.mock('../../lib/queue', () => ({
    createQueue: jest.fn(() => mockQueue),
    QUEUES: { RECOVERY_ENGINE: 'recovery-engine' }
}));

// 3. Mock other dependencies
jest.mock('../../lib/logger', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn()
    }
}));

jest.mock('../../lib/prisma', () => ({
    __esModule: true,
    default: {}
}));

// 4. Import the controller (it will use our mocked createQueue)
import { RecoveryController } from '../../modules/recovery/recovery.controller';

describe('RecoveryController', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let jsonMock: jest.Mock;
    let statusMock: jest.Mock;

    beforeEach(() => {
        // Reset mocks
        mockQueue.getJob.mockReset();
        mockQueue.add.mockReset();

        jsonMock = jest.fn();
        statusMock = jest.fn().mockReturnValue({ json: jsonMock });
        mockRes = {
            json: jsonMock,
            status: statusMock,
            locals: { user: { businessId: 'biz_123' } }
        };
        mockReq = {
            params: {},
            body: {},
            user: { businessId: 'biz_123' }
        } as any;
    });

    describe('getSyncJobStatus', () => {
        it('should return job status if job exists', async () => {
            mockReq.params = { id: 'job_123' };
            
            const mockJob = {
                getState: jest.fn().mockResolvedValue('completed'),
                returnvalue: { success: true }
            };
            mockQueue.getJob.mockResolvedValue(mockJob);

            await RecoveryController.getSyncJobStatus(mockReq as Request, mockRes as Response);

            expect(mockQueue.getJob).toHaveBeenCalledWith('job_123');
            expect(jsonMock).toHaveBeenCalledWith({
                success: true,
                state: 'completed',
                result: { success: true }
            });
        });

        it('should return 404 if job not found', async () => {
            mockReq.params = { id: 'job_404' };
            mockQueue.getJob.mockResolvedValue(null);

            await RecoveryController.getSyncJobStatus(mockReq as Request, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(404);
            expect(jsonMock).toHaveBeenCalledWith({ success: false, error: 'Job not found' });
        });

        it('should handle errors gracefully', async () => {
            mockReq.params = { id: 'job_err' };
            mockQueue.getJob.mockRejectedValue(new Error('Redis error'));

            await RecoveryController.getSyncJobStatus(mockReq as Request, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(500);
            expect(jsonMock).toHaveBeenCalledWith({ success: false, error: 'Redis error' });
        });
    });
});
