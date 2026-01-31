
import { QBOProvider } from '../../services/integrations/providers/qbo.provider';
import { Integration } from '@prisma/client';

// Mock Fetch Global
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('QBOProvider', () => {
    let provider: QBOProvider;
    let mockIntegration: Integration;

    beforeEach(() => {
        provider = new QBOProvider();
        mockIntegration = {
            id: 'int_123',
            businessId: 'biz_123',
            provider: 'quickbooks',
            name: 'QuickBooks Sandbox',
            status: 'connected',
            accessToken: 'mock_access_token',
            refreshToken: 'mock_refresh_token',
            expiresAt: new Date(Date.now() + 3600 * 1000),
            metadata: { realmId: 'realm_123', environment: 'sandbox' },
            settings: {},
            createdAt: new Date(),
            updatedAt: new Date()
        };
        mockFetch.mockClear();
    });

    describe('initialize', () => {
        it('should properly set baseUrl and realmId form metadata', async () => {
            await provider.initialize(mockIntegration);
            // Access private members via any for testing if needed, or rely on behavior
            // We can verify valid connection uses these values
        });

        it('should use sandbox url by default', async () => {
            await provider.initialize(mockIntegration);
            expect((provider as any).baseUrl).toContain('sandbox-quickbooks');
        });
    });

    describe('getContacts', () => {
        beforeEach(async () => {
            await provider.initialize(mockIntegration);
            // Mock TokenManager? provider calls TokenManager.getValidAccessToken
            // We need to mock TokenManager or the provider's ensureValidToken method
            jest.spyOn(provider, 'ensureValidToken').mockResolvedValue('valid_token');
        });

        it('should fetch customers using correct query', async () => {
            // Mock QBO Response
            mockFetch.mockResolvedValueOnce({
                json: async () => ({
                    QueryResponse: {
                        Customer: [
                            { Id: '1', DisplayName: 'Alice', Active: true, MetaData: { CreateTime: '2023-01-01' } },
                            { Id: '2', DisplayName: 'Bob', Active: false }
                        ]
                    }
                })
            });

            const contacts = await provider.getContacts();

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/query?query=select%20*%20from%20Customer%20MAXRESULTS%20100'),
                expect.objectContaining({
                    headers: expect.objectContaining({ 'Authorization': 'Bearer valid_token' })
                })
            );

            expect(contacts).toHaveLength(2);
            expect(contacts[0].contactName).toBe('Alice');
            expect(contacts[0].status).toBe('active');
            expect(contacts[1].contactName).toBe('Bob');
            expect(contacts[1].status).toBe('inactive');
        });

        it('should handle empty response gracefully', async () => {
            mockFetch.mockResolvedValueOnce({
                json: async () => ({ QueryResponse: {} })
            });
            const contacts = await provider.getContacts();
            expect(contacts).toEqual([]);
        });
    });

    describe('getItems', () => {
        beforeEach(async () => {
            await provider.initialize(mockIntegration);
            jest.spyOn(provider, 'ensureValidToken').mockResolvedValue('valid_token');
        });

        it('should fetch items (Inventory/Service) using correct query', async () => {
            mockFetch.mockResolvedValueOnce({
                json: async () => ({
                    QueryResponse: {
                        Item: [
                            { Id: '10', Name: 'Consulting', UnitPrice: 100, Type: 'Service', Active: true },
                            { Id: '11', Name: 'Widget', UnitPrice: 50, Type: 'Inventory', Sku: 'WID-01', Active: true }
                        ]
                    }
                })
            });

            const items = await provider.getItems();

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining("select%20*%20from%20Item%20WHERE%20Type%20IN%20('Inventory'%2C%20'Service')%20MAXRESULTS%20100"),
                expect.anything()
            );

            expect(items).toHaveLength(2);
            expect(items[0].type).toBe('item');
            expect(items[0].total).toBe(100);
            expect(items[1].externalId).toBe('WID-01');
        });
    });
});
