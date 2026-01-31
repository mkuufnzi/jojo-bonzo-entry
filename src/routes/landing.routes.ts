import { Router } from 'express';
import { LandingController } from '../controllers/landing.controller';
import { FormController } from '../controllers/form.controller';

const router = Router();

// Auth
router.get('/', LandingController.index);
router.get('/pricing', LandingController.pricing);
router.get('/docs', LandingController.docs);
// Solutions
// Products
// Products (4 Pillars)
router.get('/products/transactional', LandingController.productTransactional); // Renamed from docs
router.get('/products/docs', (req, res) => res.redirect('/products/transactional')); // Back-compat
router.get('/products/retention', LandingController.productRetention);
router.get('/products/sales', LandingController.productSales);
router.get('/products/content', LandingController.productContent);
router.get('/products/workflows', LandingController.productWorkflows);
// Deprecated but keep for redirects if needed
router.get('/solutions/brand-with-jojo', LandingController.brandWithJojo);
router.get('/solutions/automation-for-smes', LandingController.automationForSmes);

// Resources
router.get('/templates', LandingController.templates);
router.get('/blog', LandingController.blog);

// Tools
router.get('/tools', LandingController.tools);
router.get('/tools/:slug', LandingController.showTool);

// Contact
router.get('/contact', LandingController.contactPage);
router.post('/contact', LandingController.contactSubmit);

router.post('/forms/notify', FormController.submitInterest);

// Static Content
router.get('/terms', LandingController.terms);
router.get('/privacy', LandingController.privacy);



export default router;
