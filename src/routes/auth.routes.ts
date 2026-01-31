import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import passport from '../config/passport';
import { config } from '../config/env';
import { strictAuthLimiter } from '../middleware/rateLimit.middleware';
import { validate } from '../middleware/validate.middleware';
import { 
    loginSchema, 
    initialRegisterSchema, 
    forgotPasswordSchema, 
    verify2faSchema, 
    resendVerificationSchema 
} from '../schemas/auth.schema';

const router = Router();

router.get('/login', AuthController.loginPage);
router.post('/login', strictAuthLimiter, validate(loginSchema, 'login'), AuthController.login);
router.get('/register', AuthController.registerPage);
router.post('/register', strictAuthLimiter, validate(initialRegisterSchema, 'register'), AuthController.register);
router.get('/verify', AuthController.verify);
router.get('/resend-verification', AuthController.resendVerificationPage);
router.post('/resend-verification', strictAuthLimiter, validate(resendVerificationSchema, 'auth/verify-error'), AuthController.resendVerification);

router.get('/2fa', AuthController.verifyTwoFactorPage);
router.post('/2fa', strictAuthLimiter, validate(verify2faSchema, 'auth/verify-2fa'), AuthController.verifyTwoFactor);
router.post('/2fa/resend', strictAuthLimiter, AuthController.resendTwoFactorCode);

router.get('/logout', AuthController.logout);
router.get('/forgot-password', AuthController.forgotPasswordPage);
router.post('/forgot-password', strictAuthLimiter, validate(forgotPasswordSchema, 'forgot-password'), AuthController.forgotPassword);


const ensureStrategy = (strategy: string) => (req: any, res: any, next: any) => {
  const configMap: Record<string, any> = {
    google: config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET,
    facebook: config.FACEBOOK_APP_ID && config.FACEBOOK_APP_SECRET,
    linkedin: config.LINKEDIN_KEY && config.LINKEDIN_SECRET,
    twitter: config.X_CLIENT_ID && config.X_CLIENT_SECRET
  };

  if (!configMap[strategy]) {
    const providerName = strategy === 'twitter' ? 'X' : strategy.charAt(0).toUpperCase() + strategy.slice(1);
    return res.render('login', { 
      error: `Login with ${providerName} is currently unavailable. <a href="/contact?message=I+would+like+to+request+enabling+${providerName}+login." class="underline font-semibold hover:text-red-900">Notify administrator</a> to enable this feature.`,
      returnUrl: req.query.returnUrl || req.body?.returnUrl
    });
  }
  next();
};

// Google Auth Routes
router.get('/google', ensureStrategy('google'), passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', 
  passport.authenticate('google', { failureRedirect: '/auth/login?error=Google+Auth+Failed', session: false }),
  AuthController.googleCallback
);

// Facebook Auth Routes
router.get('/facebook', ensureStrategy('facebook'), passport.authenticate('facebook', { scope: ['email'] }));

router.get('/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/auth/login?error=Facebook+Auth+Failed', session: false }),
  AuthController.googleCallback // Reusing the same callback logic as it just sets session from req.user
);

// LinkedIn Auth Routes
router.get('/linkedin', ensureStrategy('linkedin'), passport.authenticate('linkedin'));

router.get('/linkedin/callback',
  passport.authenticate('linkedin', { failureRedirect: '/auth/login?error=LinkedIn+Auth+Failed', session: false }),
  AuthController.googleCallback
);

// X (Twitter) Auth Routes
router.get('/x', ensureStrategy('twitter'), passport.authenticate('twitter', { scope: ['tweet.read', 'users.read', 'offline.access', 'email'] }));

router.get('/x/callback',
  passport.authenticate('twitter', { failureRedirect: '/auth/login?error=X+Auth+Failed', session: false }),
  AuthController.googleCallback
);

export default router;
