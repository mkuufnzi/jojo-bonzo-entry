/**
 * Unit Tests: UnifiedDataService
 *
 * Mocks Prisma, DataSyncService, and NormalizationEngine.
 * Tests syncBusinessData, getUnifiedInvoices, getUnifiedCustomers.
 */

// ─── Mock declarations (must be before all imports) ───────────────────────────

const mockIntegrationFindFirst = jest.fn() as any;
const mockSyncJobCreate        = jest.fn() as any;
const mockSyncJobUpdate        = jest.fn() as any;
const mockExternalDocFindMany  = jest.fn() as any;
const mockExternalDocUpdate    = jest.fn() as any;
const mockCustomerUpsert       = jest.fn() as any;
const mockCustomerFindUnique   = jest.fn() as any;
const mockCustomerFindMany     = jest.fn() as any;
const mockInvoiceUpsert        = jest.fn() as any;
const mockInvoiceFindMany      = jest.fn() as any;
const mockProductUpsert        = jest.fn() as any;

jest.mock('../../lib/prisma', () => ({
    default: {
        integration:       { findFirst: mockIntegrationFindFirst },
        unifiedSyncJob:    { create: mockSyncJobCreate, update: mockSyncJobUpdate },
        externalDocument:  { findMany: mockExternalDocFindMany, update: mockExternalDocUpdate },
        unifiedCustomer:   { upsert: mockCustomerUpsert, findUnique: mockCustomerFindUnique, findMany: mockCustomerFindMany },
        unifiedInvoice:    { upsert: mockInvoiceUpsert, findMany: mockInvoiceFindMany },
        unifiedProduct:    { upsert: mockProductUpsert },
    },
    __esModule: true,
}));

const mockSyncBusiness = jest.fn() as jest.Mock<any, any[]>;
jest.mock('../../services/data-sync.service', () => ({
    DataSyncService: jest.fn().mockImplementation(() => ({ syncBusiness: mockSyncBusiness })),
}));

const mockNormalizeCustomer = jest.fn() as jest.Mock<any, any[]>;
const mockNormalizeInvoice  = jest.fn() as jest.Mock<any, any[]>;
jest.mock('./normalization.engine', () => ({
    NormalizationEngine: {
        normalizeCustomer: mockNormalizeCustomer,
        normalizeInvoice:  mockNormalizeInvoice,
        normalizeProduct: jest.fn().mockReturnValue({ externalId: 'p1', name: 'Product', sku: null, description: null, price: 0, currency: 'USD', metadata: null }),
        normalizeOrder:   jest.fn().mockReturnValue({ externalId: 'o1', customerId: null, amount: 0, status: 'PENDING', orderDate: new Date(), orderNumber: 'ORD-1', metadata: null }),
        normalizePayment: jest.fn().mockReturnValue({ externalId: 'pay1', customerId: null, amount: 0, method: 'card', status: 'PAID', paymentDate: new Date(), metadata: null }),
        normalizeShippingNote: jest.fn().mockReturnValue({ externalId: 'sh1', orderId: null, trackingId: null, carrier: null, status: null, shippedDate: null, metadata: null }),
        normalizeEstimate: jest.fn().mockReturnValue({ externalId: 'est1', customerId: null, estimateNum: null, amount: 0, status: 'PENDING', estimateDate: null, expiryDate: null, metadata: null }),
    },
}));

jest.mock('../../lib/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { UnifiedDataService } from './unified-data.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const BUSINESS_ID    = 'biz-001';
const INTEGRATION_ID = 'int-001';

const makeDoc = (type: string, data: object = {}) => ({
    id: `doc-${type}`,
    type,
    integrationId: INTEGRATION_ID,
    data,
    integration: { provider: 'quickbooks' },
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UnifiedDataService', () => {
    let service: UnifiedDataService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new UnifiedDataService();
    });

    // ── syncBusinessData ──────────────────────────────────────────────────────

    describe('syncBusinessData()', () => {

        it('aborts early when no integration exists for the business', async () => {
            mockIntegrationFindFirst.mockResolvedValue(null);

            await service.syncBusinessData(BUSINESS_ID);

            expect(mockSyncJobCreate).not.toHaveBeenCalled();
            expect(mockSyncBusiness).not.toHaveBeenCalled();
        });

        it('creates a SyncJob, calls dataSyncService.syncBusiness, and normalizes ExternalDocuments', async () => {
            mockIntegrationFindFirst.mockResolvedValue({ id: INTEGRATION_ID, provider: 'quickbooks' });
            mockSyncJobCreate.mockResolvedValue({ id: 'job-001' });
            mockSyncJobUpdate.mockResolvedValue({});
            mockSyncBusiness.mockResolvedValue(undefined);

            mockExternalDocFindMany.mockResolvedValue([
                makeDoc('customer', { id: 'c1' }),
                makeDoc('invoice',  { id: 'inv1' }),
            ]);

            mockNormalizeCustomer.mockReturnValue({ externalId: 'c1', name: 'Customer One', email: null, phone: null, metadata: null });
            mockNormalizeInvoice.mockReturnValue({ externalId: 'inv1', customerId: 'c1', amount: 100, balance: 0, status: 'PAID', dueDate: null, issuedDate: new Date(), invoiceNumber: 'INV-1', metadata: null });
            mockCustomerUpsert.mockResolvedValue({ id: 'uc-1' });
            mockCustomerFindUnique.mockResolvedValue({ id: 'uc-1' });
            mockInvoiceUpsert.mockResolvedValue({});
            mockExternalDocUpdate.mockResolvedValue({});

            await service.syncBusinessData(BUSINESS_ID);

            expect(mockSyncJobCreate).toHaveBeenCalledTimes(1);
            expect(mockSyncBusiness).toHaveBeenCalledWith(BUSINESS_ID, ['contacts', 'invoices']);
            expect(mockNormalizeCustomer).toHaveBeenCalledWith('quickbooks', { id: 'c1' });
            expect(mockNormalizeInvoice).toHaveBeenCalledWith('quickbooks', { id: 'inv1' });
            expect(mockCustomerUpsert).toHaveBeenCalled();
            expect(mockInvoiceUpsert).toHaveBeenCalled();
            expect(mockSyncJobUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) })
            );
        });

        it('marks SyncJob as FAILED when a critical DB error occurs', async () => {
            mockIntegrationFindFirst.mockResolvedValue({ id: INTEGRATION_ID, provider: 'quickbooks' });
            mockSyncJobCreate.mockResolvedValue({ id: 'job-fail' });
            mockSyncBusiness.mockResolvedValue(undefined);
            mockExternalDocFindMany.mockRejectedValue(new Error('DB failed'));
            mockSyncJobUpdate.mockResolvedValue({});

            await service.syncBusinessData(BUSINESS_ID);

            expect(mockSyncJobUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) })
            );
        });

        it('skips invoice upsert when no internal customer FK can be resolved', async () => {
            mockIntegrationFindFirst.mockResolvedValue({ id: INTEGRATION_ID, provider: 'quickbooks' });
            mockSyncJobCreate.mockResolvedValue({ id: 'job-001' });
            mockSyncJobUpdate.mockResolvedValue({});
            mockSyncBusiness.mockResolvedValue(undefined);

            mockExternalDocFindMany.mockResolvedValue([ makeDoc('invoice', { id: 'inv2' }) ]);
            mockNormalizeInvoice.mockReturnValue({ externalId: 'inv2', customerId: 'ghost-cust', amount: 50, balance: 50, status: 'OPEN', dueDate: null, issuedDate: new Date(), invoiceNumber: 'INV-2', metadata: null });
            mockCustomerFindUnique.mockResolvedValue(null); // FK not found → skip
            mockExternalDocUpdate.mockResolvedValue({});

            await service.syncBusinessData(BUSINESS_ID);

            expect(mockInvoiceUpsert).not.toHaveBeenCalled();
        });
    });

    // ── getUnifiedInvoices ────────────────────────────────────────────────────

    describe('getUnifiedInvoices()', () => {
        it('queries with correct businessId, skip, and take', async () => {
            mockInvoiceFindMany.mockResolvedValue([]);

            await service.getUnifiedInvoices(BUSINESS_ID, 2, 25);

            expect(mockInvoiceFindMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: { businessId: BUSINESS_ID }, skip: 25, take: 25 })
            );
        });
    });

    // ── getUnifiedCustomers ───────────────────────────────────────────────────

    describe('getUnifiedCustomers()', () => {
        it('queries with correct businessId and default pagination', async () => {
            mockCustomerFindMany.mockResolvedValue([]);

            await service.getUnifiedCustomers(BUSINESS_ID, 1, 50);

            expect(mockCustomerFindMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: { businessId: BUSINESS_ID }, skip: 0, take: 50 })
            );
        });
    });
});
