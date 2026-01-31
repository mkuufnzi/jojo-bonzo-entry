
import express from 'express';
import { requireAuth } from '../middleware/session.middleware';
import { injectUser } from '../middleware/user.middleware';

const router = express.Router();

// Dev Dashboard / Playground
router.get('/transactional-playground', requireAuth, injectUser, (req, res) => {
    res.render('dev/playground', {
        title: 'API Playground',
        activeService: 'transactional',
        path: req.path,
        nonce: res.locals.nonce,
        // Mock data if needed or ensure view checks for props
    });
});

export default router;
