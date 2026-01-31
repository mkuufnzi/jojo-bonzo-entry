
import { PrismaClient } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

// Mock Config
process.env.APP_URL = 'http://localhost:3000';
process.env.SESSION_SECRET = 'test-secret';
process.env.QBO_CLIENT_ID = 'mock-qbo-id';
process.env.QBO_CLIENT_SECRET = 'mock-qbo-secret';
process.env.XERO_CLIENT_ID = 'mock-xero-id';
process.env.XERO_CLIENT_SECRET = 'mock-xero-secret';
process.env.ZOHO_CLIENT_ID = 'mock-zoho-id';
process.env.ZOHO_CLIENT_SECRET = 'mock-zoho-secret';

// Mock Prisma
jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: mockDeep<PrismaClient>(),
}));

beforeAll(() => {
    // Global Setup
    console.log = jest.fn(); // Silence logs during tests
    console.warn = jest.fn();
    console.error = jest.fn();
});

afterAll(() => {
    jest.clearAllMocks();
});
