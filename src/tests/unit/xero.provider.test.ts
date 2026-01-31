
import { XeroProvider } from '../../services/integrations/providers/xero.provider';
import { Integration } from '@prisma/client';

// Mock Fetch Global
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('XeroProvider', () => {
    let provider: XeroProvider;
    let mockIntegration: Integration;

    beforeEach(() => {
        provider = new XeroProvider();
        mockIntegration = {
            id: 'xero_int_123',
            businessId: 'biz_123',
            provider: 'xero',
            name: 'Xero Demo',
            status: 'connected',
            accessToken: 'mock_access_token',
            refreshToken: 'mock_refresh_token',
            expiresAt: new Date(Date.now() + 3600 * 1000),
            metadata: { tenantId: 'tenant_123' },
            settings: {},
            createdAt: new Date(),
            updatedAt: new Date()
        };
        mockFetch.mockClear();
    });

    describe('initialize', () => {
        it('should extraction tenantId from metadata', async () => {
            await provider.initialize(mockIntegration);
            expect((provider as any).tenantId).toBe('tenant_123');
        });
    });

    describe('getContacts', () => {
        beforeEach(async () => {
            await provider.initialize(mockIntegration);
            jest.spyOn(provider, 'ensureValidToken').mockResolvedValue('valid_token');
        });

        it('should fetch contacts', async () => {
             mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    Contacts: [
                        { ContactID: 'C1', Name: 'Customer 1', ContactStatus: 'ACTIVE', UpdatedDateUTC: '2023-01-01' },
                        { ContactID: 'C2', Name: 'Supplier 2', ContactStatus: 'ARCHIVED' }
                    ]
                })
            });

            const contacts = await provider.getContacts();
            
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/Contacts'),
                expect.objectContaining({
                    headers: expect.objectContaining({ 
                        'Xero-tenant-id': 'tenant_123',
                        'Authorization': 'Bearer valid_token'
                    })
                })
            );

            expect(contacts).toHaveLength(2);
            expect(contacts[0].contactName).toBe('Customer 1');
            expect(contacts[0].status).toBe('active');
            expect(contacts[1].status).toBe('inactive'); 
        });
    });

    describe('getItems', () => {
         beforeEach(async () => {
            await provider.initialize(mockIntegration);
            jest.spyOn(provider, 'ensureValidToken').mockResolvedValue('valid_token');
        });

        it('should fetch items', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    Items: [
                        { ItemID: 'I1', Code: 'SKU1', Name: 'Item One', SalesDetails: { UnitPrice: 10 } },
                        { ItemID: 'I2', Code: 'SKU2', Name: 'Item Two' }
                    ]
                })
            });

            const items = await provider.getItems();
            expect(items).toHaveLength(2);
            expect(items[0].total).toBe(10);
            expect(items[1].externalId).toBe('SKU2');
        });
    });
});
