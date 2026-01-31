
import { WebhookService } from '../../services/webhook.service';
import prisma from '../../lib/prisma';
import { AppError } from '../../lib/AppError';

// Mock Prisma
jest.mock('../../lib/prisma', () => ({
    service: {
        findMany: jest.fn()
    }
}));

describe('WebhookService', () => {
    let service: WebhookService;

    beforeEach(() => {
        service = new WebhookService();
        jest.clearAllMocks();
    });

    it('should resolve specific action endpoint if configured', async () => {
        const mockHelpers = [
            {
                slug: 'test-service',
                isActive: true,
                config: {
                    webhooks: {
                        default: { url: 'http://default.com' },
                        'invoice.created': { url: 'http://specific.com' }
                    }
                }
            }
        ];

        (prisma.service.findMany as jest.Mock).mockResolvedValue(mockHelpers);

        await service.refreshConfig();
        const url = await service.getEndpoint('test-service', 'invoice.created');
        
        expect(url).toBe('http://specific.com');
    });

    it('should fallback to default if specific action missing', async () => {
         const mockHelpers = [
            {
                slug: 'test-service',
                isActive: true,
                config: {
                    webhooks: {
                        default: { url: 'http://default.com' }
                    }
                }
            }
        ];

        (prisma.service.findMany as jest.Mock).mockResolvedValue(mockHelpers);

        await service.refreshConfig();
        const url = await service.getEndpoint('test-service', 'unknown.action');
        
        expect(url).toBe('http://default.com');
    });

    it('should throw error if service config missing entirely', async () => {
        (prisma.service.findMany as jest.Mock).mockResolvedValue([]);
        await service.refreshConfig();

        await expect(service.getEndpoint('missing-service')).rejects.toThrow(AppError);
    });
});
