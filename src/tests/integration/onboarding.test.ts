
import { PrismaClient } from '@prisma/client';
import { DeepMockProxy } from 'jest-mock-extended';
import prisma from '../../lib/prisma';
import express from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import { BusinessController } from '../../controllers/business.controller';

// Fix hoisting issue: jest.mock is hoisted above imports.
// We must require 'jest-mock-extended' inside the factory or use a variable designated for module scope if properly typed, 
// but inline require is safest for hoisting.
jest.mock('../../lib/prisma', () => ({
    __esModule: true,
    default: require('jest-mock-extended').mockDeep(),
}));

const mockPrisma = prisma as unknown as DeepMockProxy<PrismaClient>;

import request from 'supertest';

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'test', resave: false, saveUninitialized: true }));

// Mock Auth Middleware
app.use((req, res, next) => {
    req.session.userId = 'user_123';
    // @ts-ignore
    req.user = { id: 'user_123', email: 'test@example.com' };
    next();
});

// Routes
app.post('/onboarding/api/profile', BusinessController.saveProfile);
app.post('/onboarding/api/brand', BusinessController.saveBrandConfig);
app.post('/onboarding/api/complete', BusinessController.submitCompleteOnboarding); 
// Note: saveDocumentConfig was for step 4, but submitCompleteOnboarding is the final aggregator.
// We will test submitCompleteOnboarding for the 'Completion' step.

// Mocking Catalog Route logic for test (since we didn't import IntegrationController)
app.get('/api/integrations/catalog', (req, res) => {
    res.json({ success: true, data: { popular: [], others: [] } }); 
});

describe('Onboarding Flow Integration', () => {
    
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Step 1: Profile Creation', () => {
        it('should create a new business and update user onboarding step', async () => {
            mockPrisma.business.create.mockResolvedValue({ id: 'biz_123', name: 'Test Biz' } as any);
            mockPrisma.user.update.mockResolvedValue({ id: 'user_123', onboardingStep: 2 } as any);

            const res = await request(app)
                .post('/onboarding/api/profile')
                .send({
                    name: 'Test Biz',
                    sector: 'Tech'
                });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(mockPrisma.business.create).toHaveBeenCalled();
        });
    });

    describe('Step 3: Brand Configuration', () => {
        it('should update business branding settings', async () => {
            // Mock finding business for user
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'user_123', businessId: 'biz_123' } as any);
            mockPrisma.business.findUnique.mockResolvedValue({ id: 'biz_123' } as any);
            mockPrisma.brandingProfile.findFirst.mockResolvedValue({ id: 'bp_1' } as any);
            mockPrisma.brandingProfile.update.mockResolvedValue({ id: 'bp_1' } as any);

            const res = await request(app)
                .post('/onboarding/api/brand')
                .send({
                    brandColors: { primary: '#000000', secondary: '#ffffff' },
                    fontSettings: { heading: 'Inter', body: 'Inter' },
                    voiceProfile: { tone: 'professional' }
                });

            expect(res.status).toBe(200);
            expect(mockPrisma.brandingProfile.update).toHaveBeenCalled();
        });
    });

    describe('Step 4: Completion', () => {
        it('should mark onboarding as complete', async () => {
             // Mock user with business included for designEngineService
             mockPrisma.user.findUnique.mockResolvedValue({ 
                 id: 'user_123', 
                 businessId: 'biz_123',
                 business: { 
                     id: 'biz_123', 
                     brandingProfiles: [{ id: 'bp_1', isDefault: true }] 
                 } 
             } as any);

             mockPrisma.business.findUnique.mockResolvedValue({ id: 'biz_123', metadata: {} } as any);
             mockPrisma.business.findFirst.mockResolvedValue({ id: 'biz_123', metadata: {} } as any);
             mockPrisma.business.update.mockResolvedValue({ id: 'biz_123' } as any);
             mockPrisma.business.create.mockResolvedValue({ id: 'biz_123' } as any);
             
             mockPrisma.brandingProfile.findFirst.mockResolvedValue({ id: 'bp_1' } as any);
             mockPrisma.brandingProfile.update.mockResolvedValue({ id: 'bp_1' } as any);
             mockPrisma.brandingProfile.create.mockResolvedValue({ id: 'bp_1' } as any);
             
             mockPrisma.userProfile.update.mockResolvedValue({ id: 'user_123', onboardingCompleted: true } as any);
             
             const res = await request(app)
                .post('/onboarding/api/complete')
                .send({
                    profile: { name: 'Biz', sector: 'Tech' },
                    brand: { colors: {}, fonts: {} },
                    config: { documents: ['invoice'] }
                });
            
            expect(res.status).toBe(200);
            expect(mockPrisma.userProfile.update).toHaveBeenCalledWith(
                expect.objectContaining({
                     where: { userId: 'user_123' },
                     data: { onboardingCompleted: true }
                })
            );
        });
    });

});
