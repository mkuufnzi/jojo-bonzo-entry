import { TransactionalService } from '../../services/v2/transactional.service';
import { DeliveryService } from '../../services/v2/delivery.core';
import { v4 as uuidv4 } from 'uuid';
import { getRedisClient } from '../../lib/redis';

// Mock Dependencies
jest.mock('../../services/v2/delivery.core');
jest.mock('../../lib/redis');
jest.mock('../../services/design-engine.service', () => ({
    designEngineService: {
        renderDocument: jest.fn().mockResolvedValue({ html: '<html></html>' })
    }
}));

describe('TransactionalService (V2)', () => {
    let service: TransactionalService;
    let mockDeliveryService: jest.Mocked<DeliveryService>;
    let mockRedis: any;

    beforeAll(() => {
        // Setup Mocks
        mockRedis = {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
        };
        (getRedisClient as jest.Mock).mockReturnValue(mockRedis);

        service = new TransactionalService();
        mockDeliveryService = (service as any).deliveryService; // Access private property or mock prototype if needed
        // Simpler: Just mock the instance the service uses if it's imported or injected.
        // Since TransactionalService instantiates DeliveryService internally (or imports singleton), we mocked the module.
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('Send should dispatch delivery request', async () => {
        const userId = uuidv4();
        const invoiceId = uuidv4();
        
        // Mock Delivery Success
        (DeliveryService.prototype.dispatch as jest.Mock).mockResolvedValue({
            success: true,
            traceId: 'trace-123',
            attemptCount: 1,
            results: { status: 'queued' }
        });

        const result = await service.send(
            userId,
            invoiceId,
            'email'
        );

        // Result is DispatchResult
        expect((result as any).success).toBe(true);
        expect((result as any).traceId).toBe('trace-123');
        expect((result as any).results?.status).toBe('queued');
        expect(DeliveryService.prototype.dispatch).toHaveBeenCalledTimes(1);
    });

    test('Send with Idempotency Key should return cached result', async () => {
        const userId = uuidv4();
        const invoiceId = uuidv4();
        const idempotencyKey = 'idem-key-123';

        // Mock Redis Cache Hit
        mockRedis.get.mockResolvedValue(JSON.stringify({
            status: 'completed',
            traceId: 'cached-trace-id',
            timestamp: new Date().toISOString()
        }));

        const result = await service.send(
            userId,
            invoiceId,
            'email',
            idempotencyKey
        );

        // Result is { status: 'skipped', reason: '...' }
        expect((result as any).status).toBe('skipped');
        expect((result as any).reason).toBe('idempotent_replay');
        expect(DeliveryService.prototype.dispatch).not.toHaveBeenCalled();
    });
});
