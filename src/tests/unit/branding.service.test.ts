import { BrandingService } from '../../services/branding.service';
import prisma from '../../lib/prisma';

// Mock Prisma
jest.mock('../../lib/prisma', () => ({
    brandingProfile: {
        findUnique: jest.fn(),
    },
    documentTemplate: {
        findFirst: jest.fn() // Logic was findFirst or findUnique? Checking implementation...
    }
}));

describe('BrandingService', () => {
    let service: BrandingService;

    beforeEach(() => {
        service = new BrandingService();
        jest.clearAllMocks();
    });

    test('generatePreview should hydrate template correctly', async () => {
        const mockProfile = {
            id: 'profile-1',
            companyName: 'Acme Corp',
            colors: { primary: '#000000', secondary: '#ffffff' },
            logoUrl: 'http://logo.png',
            font: 'Roboto'
        };

        // Mock DB Calls
        (prisma.brandingProfile.findUnique as jest.Mock).mockResolvedValue(mockProfile);
        
        // This relies on the service having a default template fallback or finding one.
        // Assuming the service logic handles missing templates gracefully or we mock it.
        
        const result = await service.generatePreview('profile-1', 'invoice');
        
        expect(result).toContain('Acme Corp');
        expect(result).toContain('#000000');
        expect(result).toContain('<!DOCTYPE html>');
    });
});
