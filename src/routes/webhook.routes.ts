import { Router } from 'express';
import express from 'express';
import { WebhookController } from '../controllers/webhook.controller';

const router = Router();
const webhookController = new WebhookController();

// Generic ERP Webhook (Insecure for MVP: expecting :userId in URL)
router.post('/erp/:provider/:userId', (req, res) => webhookController.handleErpWebhook(req, res));

// Stripe requires the raw body to verify the signature
// We use express.raw() here specifically for this route
router.post('/stripe', express.raw({ type: 'application/json' }), (req, res) => webhookController.handleStripeWebhook(req, res));

// ERP Specific (New Standard)
// Support both standard URL and /:id tagged URL (preventing path-to-regexp crash)
// ERP Specific (New Standard)
// Support both standard URL and /:id tagged URL (preventing path-to-regexp crash)
// Inject 'provider' manually into params for the Generic Controller
router.post('/zoho/invoice', (req, res, next) => { (req.params as any).provider = 'zoho'; next(); }, (req, res) => webhookController.handleErpWebhook(req, res));
router.post('/zoho/invoice/:id', (req, res, next) => { (req.params as any).provider = 'zoho'; next(); }, (req, res) => webhookController.handleErpWebhook(req, res));


// QuickBooks Online Webhook
router.post('/quickbooks/notification', (req, res, next) => { (req.params as any).provider = 'quickbooks'; next(); }, (req, res) => webhookController.handleErpWebhook(req, res));

export default router;
