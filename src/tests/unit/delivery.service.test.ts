import { DeliveryService } from '../../services/v2/delivery.core';
import { Queue } from 'bullmq';
import { getRedisClient } from '../../lib/redis';

// Mock BullMQ
jest.mock('bullmq');
jest.mock('../../lib/redis');

describe('DeliveryService (V2)', () => {
    let service: DeliveryService;
    let mockRedis: any;

    beforeAll(() => {
        mockRedis = {
            incr: jest.fn().mockResolvedValue(1),
            expire: jest.fn(),
        };
        (getRedisClient as jest.Mock).mockReturnValue(mockRedis);
        service = new DeliveryService();
    });
    
    test('Dispatch should enforce rate limits', async () => {
        const request = {
            userId: 'user-123',
            eventType: 'invoice.created',
            payload: {}
        };

        // Case 1: Within Limit
        mockRedis.incr.mockResolvedValueOnce(50); 
        await service.dispatch(request);
        
        // Case 2: Exceeded Limit (Simulate logic - we need to see if it throws or returns false)
        // Access private method or infer from result if mocked internal logic
        // Actually, we are testing the public API.
        
        mockRedis.incr.mockResolvedValueOnce(101); // Limit is 100
        
        await expect(service.dispatch(request).catch(e => e.message)).resolves.toMatch(/Rate Limit Exceeded/);
    });

    test('Dispatch should return success with traceId', async () => {
         mockRedis.incr.mockResolvedValue(1);
         const result = await service.dispatch({
             userId: 'valid-user',
             eventType: 'test',
             payload: {}
         });
         
         expect(result.success).toBe(true);
         expect(result.traceId).toBeDefined();
    });
});
