import request from 'supertest';
import express from 'express';
import transactionalRoutes from '../../../src/routes/v2/transactional.routes';
import { transactionalService } from '../../../src/services/v2/transactional.service';

// Mock Service
jest.mock('../../../src/services/v2/transactional.service');

const app = express();
app.use(express.json());
// Mock Middleware Injection
app.use((req, res, next) => {
    (req as any).user = { id: 'user123' };
    next();
});
app.use('/api/v2/transactional', transactionalRoutes);

describe('Transactional Routes V2 E2E', () => {
    
    describe('POST /preview', () => {
        it('should return 400 for invalid body', async () => {
            const res = await request(app)
                .post('/api/v2/transactional/preview')
                .send({ }); // Missing invoiceId
            
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Validation Error');
        });

        it('should return 200 for valid request', async () => {
            (transactionalService.preview as jest.Mock).mockResolvedValue({ html: '<h1>Test</h1>' });

            const res = await request(app)
                .post('/api/v2/transactional/preview')
                .send({ invoiceId: 'inv_123' });
            
            expect(res.status).toBe(200);
            expect(res.body.html).toBe('<h1>Test</h1>');
        });
    });

    describe('POST /send', () => {
         it('should return 400 for invalid channel', async () => {
             const res = await request(app)
                .post('/api/v2/transactional/send')
                .send({ invoiceId: 'inv_123', channel: 'smoke_signals' });
            
             expect(res.status).toBe(400);
         });
    });
});
