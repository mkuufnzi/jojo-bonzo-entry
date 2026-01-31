import { z } from 'zod';

import { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { AuthService } from '../services/auth.service';
import { deviceService } from '../services/device.service';
import { loginSchema, registerSchema } from '../schemas/auth.schema';
import { getSafeRedirectUrl } from '../utils/security.utils';

const authService = new AuthService();

export class AuthController {
    static loginPage(req: ExpressRequest, res: ExpressResponse) {
        const returnUrl = (req.query.returnUrl as string) || req.body?.returnUrl;
        if (req.session.userId) {
            return res.redirect('/dashboard');
        }
        res.render('login', { error: null, returnUrl });
    }

    static registerPage(req: ExpressRequest, res: ExpressResponse) {
        if (req.session.userId) {
            return res.redirect('/dashboard');
        }
        res.render('register', { error: null, success: null });
    }

    static async login(req: ExpressRequest, res: ExpressResponse) {
        let { email, password, returnUrl } = req.body;
        returnUrl = getSafeRedirectUrl(returnUrl);


        try {

            // Input Validation handled by middleware


            const user = await authService.login(email, password);
            // ... (rest of function)


            if (user.isTwoFactorEnabled) {

                await authService.generateTwoFactorCode(user.id);
                
                // Set partial session for 2FA verification
                req.session.partialAuth = user.id;
                
                // Handle Remember Me for 2FA flow too (store intention?)
                // For now, we only extend session AFTER verification or here if we trust cookie persistence.
                if (req.body['remember-me']) {
                    req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

                }

                req.session.save((err) => {
                    if (err) {
                        console.error('[Auth] Session save error (2FA):', err);
                        return res.render('login', { error: 'Login session error', returnUrl });
                    }
                    res.redirect(`/auth/2fa?returnUrl=${encodeURIComponent(returnUrl || '/dashboard')}`);
                });
                return;
            }

            // Regenerate session to prevent fixation
            req.session.regenerate((err) => {
                if (err) console.error('[Auth] Session regeneration failed:', err);
                
                // Set session
                req.session.userId = user.id;
            
            // Handle Remember Me
            if (req.body['remember-me']) {
                 req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

            }


            
            // Log Device Login (Success)
            deviceService.trackLogin(user.id, req, 'SUCCESS');

            // Explicitly save session to handle store errors
            req.session.save((err) => {
                if (err) {
                    console.error('[Auth] CRITICAL: Session save failed:', err);
                    return res.render('login', { 
                        error: 'Login failed due to a system error. Please try again later.', 
                        returnUrl 
                    });
                }

                if (returnUrl) {
                    return res.redirect(getSafeRedirectUrl(returnUrl));
                }
                res.redirect('/dashboard');
            });
        });
    } catch (error: any) {
            console.error('[Auth] Login error:', error);
            res.render('login', { error: error.message || 'Invalid credentials', returnUrl });
        }
    }

    static async register(req: ExpressRequest, res: ExpressResponse) {
        const { email } = req.body;
        const returnUrl = (req.query?.returnUrl as string) || (req.body?.returnUrl as string);


        try {
            const safeReturnUrl = getSafeRedirectUrl(returnUrl);
            await authService.register(email, safeReturnUrl);
            res.render('register', { error: null, success: 'Account created! Please check your email to verify your account and get your password.' });
        } catch (error: any) {
            console.error(error);
            // Handle specific errors if needed, e.g., "Email already registered"
            res.render('register', { error: error.message || 'An error occurred', success: null });
        }
    }

    static async verify(req: ExpressRequest, res: ExpressResponse) {
        const token = (req.query?.token as string) || (req.body?.token as string);
        const returnUrl = (req.query?.returnUrl as string) || (req.body?.returnUrl as string);



        if (!token || typeof token !== 'string') {
            return res.render('auth/verify-error', { error: 'Invalid verification token' });
        }

        try {
            const user = await authService.verifyEmail(token);

            
            // Auto login after verification
            req.session.userId = user.id;
            
            req.session.save((err) => {
                if (err) console.error('[Auth] verify session save error:', err);
                if (returnUrl) {
                    return res.redirect(getSafeRedirectUrl(returnUrl));
                }
                res.redirect('/dashboard?verified=true');
            });

        } catch (error: any) {
            console.error(error);
            // Render specific verification error page instead of generic login error
            res.render('auth/verify-error', { error: error.message || 'Verification failed. The link may have expired.' });
        }
    }

    static async resendVerification(req: ExpressRequest, res: ExpressResponse) {
        const { email } = req.body;
        
        try {
            await authService.resendVerificationLink(email);
            res.render('register', { 
                error: null, 
                success: 'A new verification link has been sent to your email. Please check your inbox.', 
                returnUrl: req.body.returnUrl || null 
            });
        } catch (error: any) {
            console.error('Resend Verification Error:', error);
            
            if (error.message === 'User already verified') {
                 return res.render('auth/verify-error', { 
                     error: 'Your account is already verified. Please <a href="/auth/login">login</a>.' 
                 });
            }

             res.render('auth/verify-error', { error: 'Failed to resend verification link. Please check the email address or contact support.' });
        }
    }

    static resendVerificationPage(req: ExpressRequest, res: ExpressResponse) {
        res.render('auth/verify-error', { error: null });
    }


    static verifyTwoFactorPage(req: ExpressRequest, res: ExpressResponse) {
        const returnUrl = req.query.returnUrl;
        // Check if we have a partial session
        if (!req.session.partialAuth) {
            return res.redirect('/auth/login');
        }
        res.render('auth/verify-2fa', { error: null, returnUrl });
    }

    static async verifyTwoFactor(req: ExpressRequest, res: ExpressResponse) {
        const { code } = req.body;
        const returnUrl = (req.query?.returnUrl as string) || (req.body?.returnUrl as string);
        const userId = req.session.partialAuth;

        if (!userId) {
            return res.redirect('/auth/login');
        }

        try {
            const isValid = await authService.verifyTwoFactorCode(userId, code);
            if (!isValid) {
                return res.render('auth/verify-2fa', { error: 'Invalid or expired code', returnUrl });
            }

            // Promote session
            req.session.userId = userId;
            delete req.session.partialAuth;
            
            // Log Device Login (Success 2FA)
            deviceService.trackLogin(userId, req, 'SUCCESS', '2FA_VERIFIED');

            req.session.save((err) => {
                if (err) console.error('[Auth] 2FA session promotion error:', err);
                res.redirect(getSafeRedirectUrl(returnUrl) || '/dashboard');
            });
        } catch (error) {
            console.error('[Auth] 2FA Verification Error:', error);
            res.render('auth/verify-2fa', { error: 'An error occurred. Please try again.', returnUrl });
        }
    }

    static async resendTwoFactorCode(req: ExpressRequest, res: ExpressResponse) {
        const userId = req.session.partialAuth;
        const returnUrl = req.query.returnUrl || req.body.returnUrl;

        if (!userId) {
            if (req.xhr || req.accepts('json')) {
                return res.status(401).json({ error: 'Session expired' });
            }
            return res.redirect('/auth/login');
        }

        try {
            await authService.generateTwoFactorCode(userId, 'Resend Request');
            
            if (req.xhr || req.accepts('json')) {
                return res.json({ success: true, message: 'Verification code resent successfully' });
            }

            res.render('auth/verify-2fa', { 
                error: null, 
                success: 'A new verification code has been sent to your email.',
                returnUrl 
            });
        } catch (error) {
             console.error('[Auth] Resend 2FA Error:', error);
             if (req.xhr || req.accepts('json')) {
                return res.status(500).json({ error: 'Failed to resend code' });
            }
            res.render('auth/verify-2fa', { error: 'Failed to resend code. Please try again.', returnUrl });
        }
    }

    static logout(req: ExpressRequest, res: ExpressResponse) {
        req.session.destroy(() => {
            res.redirect('/auth/login');
        });
    }

    static async googleCallback(req: ExpressRequest, res: ExpressResponse) {
        // Passport puts the user in req.user
        const user = req.user; // Typed via Express.Request extension
        
        if (!user) {
            return res.redirect('/auth/login?error=Authentication failed');
        }

        // Set session
        req.session.userId = user.id;

        // We can pass returnUrl in state parameter of OAuth
        // But for now let's just redirect to dashboard
        res.redirect('/dashboard');
    }

    static async facebookCallback(req: ExpressRequest, res: ExpressResponse) {
        const user = req.user;
        
        if (!user) {
            return res.redirect('/auth/login?error=Facebook Authentication failed');
        }

        req.session.userId = user.id;
        res.redirect('/dashboard');
    }

    static forgotPasswordPage(req: ExpressRequest, res: ExpressResponse) {
        res.render('forgot-password', { error: null, success: null });
    }

    static async forgotPassword(req: ExpressRequest, res: ExpressResponse) {
        const { email } = req.body;

        try {
            await authService.resetPasswordForUser(email);
            // Always show success message even if email not found (prevention of enumeration handled in service, but UI should confirm "If account exists...")
            res.render('forgot-password', { error: null, success: 'If an account exists with this email, a new password has been sent to it.' });
        } catch (error: any) {
            console.error('Forgot Password Error:', error);
            res.render('forgot-password', { error: 'An error occurred. Please try again later.', success: null });
        }
    }
}
