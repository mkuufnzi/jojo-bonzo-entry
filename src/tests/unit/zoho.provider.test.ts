
import { ZohoProvider } from '../../services/integrations/providers/zoho.provider';
import { Integration } from '@prisma/client';

// Mock Fetch Global
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('ZohoProvider', () => {
    let provider: ZohoProvider;
    let mockIntegration: Integration;

    beforeEach(() => {
        provider = new ZohoProvider();
        mockIntegration = {
            id: 'zoho_int_123',
            businessId: 'biz_123',
            provider: 'zoho',
            name: 'Zoho CRM',
            status: 'connected',
            accessToken: 'mock_access_token',
            refreshToken: 'mock_refresh_token',
            expiresAt: new Date(Date.now() + 3600 * 1000),
            metadata: { organization_id: 'org_123', api_domain: 'https://www.zohoapis.eu' },
            settings: {},
            createdAt: new Date(),
            updatedAt: new Date()
        };
        mockFetch.mockClear();
    });

    describe('initialize', () => {
        it('should set custom api domain and orgId', async () => {
            await provider.initialize(mockIntegration);
            expect((provider as any).baseUrl).toContain('zohoapis.eu');
            expect((provider as any).orgId).toBe('org_123');
        });
    });

    describe('getInvoices', () => {
        beforeEach(async () => {
            await provider.initialize(mockIntegration);
            jest.spyOn(provider, 'ensureValidToken').mockResolvedValue('valid_token');
        });

        it('should fetch invoices with organization_id param', async () => {
            mockFetch.mockResolvedValueOnce({
                json: async () => ({
                    code: 0,
                    invoices: [
                        { invoice_id: 'INV1', invoice_number: '1001', customer_name: 'Client A', total: 500 }
                    ]
                })
            });

            const invoices = await provider.getInvoices();

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('organization_id=org_123'),
                expect.objectContaining({
                    headers: expect.objectContaining({ 'Authorization': 'Zoho-oauthtoken valid_token' })
                })
            );

            expect(invoices).toHaveLength(1);
            expect(invoices[0].total).toBe(500);
        });

        it('should throw error if zoho returns non-zero code', async () => {
            mockFetch.mockResolvedValueOnce({
                json: async () => ({ code: 1000, message: 'Invalid Token' })
            });
            await expect(provider.getInvoices()).rejects.toThrow('Zoho API Error 1000');
        });
    });
});
