import { Router } from 'express';
import { CheckoutController } from '../controllers/checkout.controller';

const router = Router();

// Secure Upsell Checkout (Public Facing)
// Validated via Tokens & Signatures
router.get('/upsell', CheckoutController.handleUpsell);

export default router;
