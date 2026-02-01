import { TransactionalService } from '../../../src/services/v2/transactional.service';
import { designEngineService } from '../../../src/services/design-engine.service';
import { deliveryService } from '../../../src/services/v2/delivery.service';
import prisma from '../../../src/lib/prisma';
import { getRedisClient } from '../../../src/lib/redis';

// Mocks
jest.mock('../../../src/lib/prisma', () => ({
    user: { findUnique: jest.fn() },
    externalDocument: { findFirst: jest.fn() }
}));

jest.mock('../../../src/lib/redis', () => ({
    getRedisClient: jest.fn()
}));

jest.mock('../../../src/services/design-engine.service');
jest.mock('../../../src/services/v2/delivery.service');
jest.mock('../../../src/lib/logger', () => ({
    logger: {
        warn: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }
}));

describe('TransactionalService V2', () => {
    let service: TransactionalService;
    let mockRedis: any;

    beforeEach(() => {
        service = new TransactionalService();
        jest.clearAllMocks();
        
        mockRedis = {
            get: jest.fn(),
            set: jest.fn()
        };
        (getRedisClient as jest.Mock).mockReturnValue(mockRedis);
    });

    describe('preview', () => {
        it('should return cached result if available', async () => {
             mockRedis.get.mockResolvedValue(JSON.stringify({ html: '<div>Cached</div>', cached: true }));
             
             const result = await service.preview('user1', 'inv1');
             
             expect(result.html).toBe('<div>Cached</div>');
             expect(result.cached).toBe(true);
             expect(prisma.externalDocument.findFirst).not.toHaveBeenCalled();
        });

        it('should fetch and render if not cached', async () => {
             mockRedis.get.mockResolvedValue(null);
             (prisma.user.findUnique as jest.Mock).mockResolvedValue({ businessId: 'biz1' });
             (prisma.externalDocument.findFirst as jest.Mock).mockResolvedValue({
                 id: 'inv1',
                 externalId: 'ext1',
                 normalized: { id: 'inv1', number: 'INV-001', total: 100, status: 'draft', customer: { name: 'Test' }, items: [] }
             });
             (designEngineService.renderDocument as jest.Mock).mockResolvedValue({ html: '<div>Rendered</div>' });

             const result = await service.preview('user1', 'inv1');

             expect(result.html).toBe('<div>Rendered</div>');
             expect(mockRedis.set).toHaveBeenCalled();
        });
    });
});
