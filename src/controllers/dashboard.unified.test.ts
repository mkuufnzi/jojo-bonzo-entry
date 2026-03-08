/**
 * E2E/Integration Tests: Unified Dashboard Controller
 *
 * Tests the three unified dashboard HTTP routes:
 *   GET /dashboard/unified          → dashboardUnified
 *   GET /dashboard/unified/customers → dashboardUnifiedCustomers
 *   GET /dashboard/unified/transactions → dashboardUnifiedTransactions
 */
import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import { jest } from '@jest/globals';

// ─── Mock declarations (must be before all imports) ───────────────────────────

const mockBusinessFindFirst = jest.fn() as any;
const mockInvoiceCount      = jest.fn() as any;
const mockInvoiceFindMany   = jest.fn() as any;
const mockCustomerCount     = jest.fn() as any;
const mockCustomerFindMany  = jest.fn() as any;
const mockOrderCount        = jest.fn() as any;
const mockOrderFindMany     = jest.fn() as any;
const mockPaymentFindMany   = jest.fn() as any;

jest.mock('../../lib/prisma', () => ({
    default: {
        business: { findFirst: mockBusinessFindFirst },
        unifiedInvoice:  { count: mockInvoiceCount, findMany: mockInvoiceFindMany },
        unifiedCustomer: { count: mockCustomerCount, findMany: mockCustomerFindMany },
        unifiedOrder:    { count: mockOrderCount, findMany: mockOrderFindMany },
        unifiedPayment:  { findMany: mockPaymentFindMany },
    },
    __esModule: true,
}));

jest.mock('../../lib/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

const { DashboardController } = require('../../controllers/dashboard.controller');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockedUser = {
    id: 'user-test-001',
    email: 'test@afstools.com',
    businessId: 'biz-test-001',
    role: 'USER',
    isAdmin: false,
};

const mockedBusiness = {
    id: 'biz-test-001',
    integrations: [{ id: 'int-001', provider: 'quickbooks', status: 'connected' }],
};

// ─── Helper: Build App ────────────────────────────────────────────────────────

function buildApp(authenticated: boolean = true, sessionUser = mockedUser) {
    const app = express();

    app.use((req: Request, res: Response, next: NextFunction) => {
        if (authenticated) {
            res.locals.user = sessionUser;
            res.locals.nonce = 'test-nonce';
        }
        next();
    });

    app.set('view engine', 'ejs');
    app.use((req: Request, res: Response, next: NextFunction) => {
        res.render = (view: string, options?: any) => {
            res.json({ view, ...options });
        };
        next();
    });

    app.get('/dashboard/unified', DashboardController.dashboardUnified);
    app.get('/dashboard/unified/customers', DashboardController.dashboardUnifiedCustomers);
    app.get('/dashboard/unified/transactions', DashboardController.dashboardUnifiedTransactions);

    return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /dashboard/unified', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        mockBusinessFindFirst.mockResolvedValue(mockedBusiness);
        mockInvoiceCount.mockResolvedValue(47);
        mockCustomerCount.mockResolvedValue(3);
        mockOrderCount.mockResolvedValue(0);
        mockInvoiceFindMany.mockResolvedValue([
            { id: 'inv-1', invoiceNumber: 'INV-001', amount: 500, status: 'PAID', customer: { name: 'Client A' } },
            { id: 'inv-2', invoiceNumber: 'INV-002', amount: 250, status: 'OVERDUE', customer: { name: 'Client B' } },
        ]);
    });

    it('renders the unified index view with correct stats when business has invoices', async () => {
        const app = buildApp();
        const res = await request(app).get('/dashboard/unified');

        expect(res.status).toBe(200);
        expect(res.body.view).toBe('dashboard/services/unified/index');
        expect(res.body.stats.totalInvoices).toBe(47);
        expect(res.body.stats.totalCustomers).toBe(3);
        expect(res.body.integrations).toHaveLength(1);
        expect(res.body.integrations[0].provider).toBe('quickbooks');
        expect(res.body.recentTransactions).toHaveLength(2);
    });

    it('redirects to /auth/login when no authenticated user in locals', async () => {
        const app = buildApp(false);
        const res = await request(app).get('/dashboard/unified');

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/auth/login');
    });

    it('renders with empty stats when no business is found', async () => {
        mockBusinessFindFirst.mockResolvedValue(null);
        mockInvoiceCount.mockResolvedValue(0);
        mockCustomerCount.mockResolvedValue(0);
        mockOrderCount.mockResolvedValue(0);
        mockInvoiceFindMany.mockResolvedValue([]);

        const app = buildApp();
        const res = await request(app).get('/dashboard/unified');

        expect(res.status).toBe(200);
        expect(res.body.stats?.totalInvoices).toBeUndefined(); // Controller falls through when business=null
        expect(res.body.integrations).toBeUndefined();
    });

    it('skips auto-sync when invoices already exist (count > 0)', async () => {
        const ProviderRegistryMock = { createInstance: jest.fn() as any };
        jest.doMock('../../services/integrations/providers', () => ({ ProviderRegistry: ProviderRegistryMock }));

        const app = buildApp();
        await request(app).get('/dashboard/unified');

        expect(ProviderRegistryMock.createInstance).not.toHaveBeenCalled();
    });

    it('triggers auto-sync when no invoices exist but integrations are active', async () => {
        mockInvoiceCount.mockResolvedValueOnce(0); // 0 invoices triggers sync
        mockInvoiceCount.mockResolvedValueOnce(0); // the subsequent stats check
        mockInvoiceFindMany.mockResolvedValue([]);
        mockCustomerCount.mockResolvedValue(0);
        mockOrderCount.mockResolvedValue(0);

        const mockProvider = {
            initialize: (jest.fn() as any).mockResolvedValue(undefined),
            getContacts: (jest.fn() as any).mockResolvedValue([]),
            getInvoices: (jest.fn() as any).mockResolvedValue([]),
        };
        jest.doMock('../../services/integrations/providers', () => ({
            ProviderRegistry: { createInstance: (jest.fn() as any).mockReturnValue(mockProvider) }
        }));

        const app = buildApp();
        const res = await request(app).get('/dashboard/unified');

        expect(res.status).toBe(200);
        expect(res.body.stats.totalInvoices).toBe(0);
    });

    it('uses user.businessId over users-relation query when businessId is set', async () => {
        const app = buildApp();
        await request(app).get('/dashboard/unified');

        expect(mockBusinessFindFirst).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'biz-test-001' } })
        );
    });

    it('falls back to users-relation query when user has no businessId', async () => {
        const userWithoutBusinessId = { ...mockedUser, businessId: null };
        const app = buildApp(true, userWithoutBusinessId as any);
        await request(app).get('/dashboard/unified');

        expect(mockBusinessFindFirst).toHaveBeenCalledWith(
            expect.objectContaining({ where: { users: { some: { id: 'user-test-001' } } } })
        );
    });
});

describe('GET /dashboard/unified/customers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockBusinessFindFirst.mockResolvedValue({ id: 'biz-test-001' });
    });

    it('renders customers view with customer list', async () => {
        const getUnifiedCustomersMock = (jest.fn() as any).mockResolvedValue([
            { id: 'c1', name: 'Client A', email: 'a@test.com', _count: { invoices: 5 } },
        ]);
        jest.doMock('../unified-data/unified-data.service', () => ({
            unifiedDataService: { getUnifiedCustomers: getUnifiedCustomersMock }
        }));

        const app = buildApp();
        const res = await request(app).get('/dashboard/unified/customers');

        expect(res.status).toBe(200);
        expect(res.body.view).toBe('dashboard/services/unified/customers');
    });

    it('redirects to login if not authenticated', async () => {
        const app = buildApp(false);
        const res = await request(app).get('/dashboard/unified/customers');
        expect(res.status).toBe(302);
    });

    it('returns empty customers if no business found', async () => {
        mockBusinessFindFirst.mockResolvedValue(null);
        const app = buildApp();
        const res = await request(app).get('/dashboard/unified/customers');
        expect(res.status).toBe(200);
        expect(res.body.customers).toHaveLength(0);
    });
});

describe('GET /dashboard/unified/transactions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockBusinessFindFirst.mockResolvedValue({ id: 'biz-test-001' });
    });

    it('renders transactions view with orders, invoices, and payments', async () => {
        const getUnifiedOrdersMock   = (jest.fn() as any).mockResolvedValue([{ id: 'ord-1' }]);
        const getUnifiedInvoicesMock = (jest.fn() as any).mockResolvedValue([{ id: 'inv-1' }]);
        const getUnifiedPaymentsMock = (jest.fn() as any).mockResolvedValue([{ id: 'pay-1' }]);
        jest.doMock('../unified-data/unified-data.service', () => ({
            unifiedDataService: {
                getUnifiedOrders: getUnifiedOrdersMock,
                getUnifiedInvoices: getUnifiedInvoicesMock,
                getUnifiedPayments: getUnifiedPaymentsMock,
            }
        }));

        const app = buildApp();
        const res = await request(app).get('/dashboard/unified/transactions');

        expect(res.status).toBe(200);
        expect(res.body.view).toBe('dashboard/services/unified/transactions');
    });

    it('redirects to login if not authenticated', async () => {
        const app = buildApp(false);
        const res = await request(app).get('/dashboard/unified/transactions');
        expect(res.status).toBe(302);
    });
});
