import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller';
import { requireAuth } from '../middleware/session.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', PaymentController.index);
router.get('/payment-methods/create', PaymentController.create);
router.post('/payment-methods', PaymentController.store);
router.post('/payment-methods/:id/delete', PaymentController.destroy);
router.post('/payment-methods/:id/default', PaymentController.setDefault);
router.get('/invoices/:id/download', PaymentController.downloadInvoice);

export default router;
