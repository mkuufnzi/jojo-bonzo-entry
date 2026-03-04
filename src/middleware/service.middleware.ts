import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from './auth.middleware';

export const injectServices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const services = await prisma.service.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
    });

    const processedServices = services.map(service => ({
        ...service,
        isImplemented: ['html-to-pdf', 'ai-doc-generator', 'transactional-branding'].includes(service.slug), // Keep this as it's UI implemented status
        isPro: !!(service as any).requiredFeatureKey
    })).sort((a, b) => {
        // Sort by implemented status (true first)
        if (a.isImplemented && !b.isImplemented) return -1;
        if (!a.isImplemented && b.isImplemented) return 1;
        // Then by name
        return a.name.localeCompare(b.name);
    });

    res.locals.availableServices = processedServices;
  } catch (error) {
    console.error('Failed to fetch services:', error);
    res.locals.availableServices = [];
  }
  next();
};

/**
 * Global API Guard: Ensures the user/app has a valid subscription status (active/canceling)
 * before any request is processed.
 */
export const requireSubscriptionValid = async (req: Request, res: Response, next: NextFunction) => {
    const user = res.locals.user || (req as any).user;
    
    if (!user) {
        return next(); // apiKeyAuth error will handle this if missing, or it's a public route
    }

    const subscription = user.subscription;
    const validStatuses = ['active', 'canceling'];

    if (!subscription || !validStatuses.includes(subscription.status)) {
        const status = subscription?.status || 'none';
        const errorMsg = `Subscription error: Status is ${status.replace('_', ' ')}. Please resolve your billing status.`;
        
        if (req.xhr || req.headers.accept?.includes('json') || req.path.startsWith('/api')) {
            return res.status(403).json({ 
                error: errorMsg, 
                status: status,
                code: 'SUBSCRIPTION_REQUIRED' 
            });
        }
        return res.redirect('/billing?error=payment_required');
    }

    next();
};

export const requireServiceAccess = (serviceSlug?: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const authReq = req as AuthRequest;
        const user = res.locals.user || (req as any).user;
        const currentSlug = serviceSlug || req.params.slug || (req as any).service?.slug;

        // 1. Identification & Initial Guard
        if (!user && !authReq.currentApp) {
             if (req.xhr || req.headers.accept?.includes('json')) {
                return res.status(401).json({ error: 'Identification required. Please provide a valid API Key or Session.' });
             }
             return res.redirect('/auth/login');
        }

        const effectiveUser = user;
        const isGuest = !effectiveUser && !!authReq.currentApp && authReq.currentApp.id.includes('guest');

        try {
            // 2. Resolve Service Details
            const service = (req as any).service || await prisma.service.findUnique({ where: { slug: currentSlug } });
            if (!service) {
                 return res.status(404).json({ error: `Service '${currentSlug}' not found or incorrectly configured. Access Denied.` });
            }
            (req as any).service = service;

            // 2.5 Implementation Check (PRIORITY: Show Coming Soon if not implemented)
            const implementedSlugs = ['html-to-pdf', 'ai-doc-generator', 'transactional-branding', 'floovioo_transactional_debt-collection'];
            const isImplemented = implementedSlugs.includes(currentSlug);
            
            if (!isImplemented && req.method === 'GET') {
                console.log(`[ServiceAccess] Tool ${currentSlug} is not implemented. Redirecting to Coming Soon.`);
                // We don't block here, let the controller handle it if it's a GET request
                // but we need to make sure the next gates don't block it.
                // Alternatively, just render here.
                return res.render('services/coming-soon', {
                    user: user || (req as any).user,
                    service: { ...service, isImplemented: false },
                    title: service.name,
                    path: `/services/${currentSlug}`,
                    stats: { totalRequests: 0, successRate: 0, avgDuration: 0, totalCost: 0, remainingQuota: -1, isLimited: false }
                });
            }

            const featureKey = (service as any).requiredFeatureKey;
            const isRestricted = !!featureKey || currentSlug.includes('ai') || currentSlug.includes('pdf');

            // 3. Restriction Logic: Guests can only access NON-RESTRICTED tools
            if (isGuest && isRestricted) {
                 return res.status(403).json({ 
                     error: 'Guest access is not permitted for this service. Please create an account or provide a Pro API Key.',
                     code: 'GUEST_DENIED'
                 });
            }

            // 4. Subscription & Plan Gate (For Registered Users)
            if (!isGuest) {
                const subscription = effectiveUser?.subscription;
                const validStatuses = ['active', 'canceling'];
                
                if (!subscription || !subscription.plan || !validStatuses.includes(subscription.status)) {
                    const errorMsg = subscription && !validStatuses.includes(subscription.status) 
                        ? `Your subscription is ${subscription.status.replace('_', ' ')}. Please resolve your billing status to continue.`
                        : 'An active subscription is required to use this service.';
                    
                    if (req.xhr || req.headers.accept?.includes('json')) {
                        return res.status(403).json({ error: errorMsg, status: subscription?.status || 'none', code: 'SUBSCRIPTION_LOCKED' });
                    }
                    return res.redirect('/billing?error=payment_required');
                }

                // 5. App-Service Linkage Gate (Specific to API requests OR Contextual Web Requests)
                // If this is a Web Request (Session), we usually don't have currentApp set yet.
                // We must check if the request specifies an App Context (appId in body/query) and resolve it.
                
                if (!authReq.currentApp && (req.body.appId || req.query.appId)) {
                    const targetAppId = req.body.appId || req.query.appId;
                    try {
                         const app = await prisma.app.findFirst({
                            where: { id: targetAppId, userId: effectiveUser.id }, // Strict Ownership
                            include: { services: { include: { service: true } } }
                         });

                         if (app) {
                             if (!app.isActive) { // Check App Status
                                 return res.status(403).json({ error: 'Selected App is disabled. Please enable it in Settings.' });
                             }
                             
                             authReq.currentApp = {
                                 id: app.id,
                                 name: app.name,
                                 apiKey: app.apiKey,
                                 services: app.services.filter(s => s.isEnabled).map(s => s.service.slug)
                             };
                         } else {
                             // Invalid App ID provided
                             return res.status(403).json({ error: 'Invalid or Unauthorized App ID.' });
                         }
                    } catch (e) {
                        console.error('[ServiceAccess] App Resolution Failed:', e);
                    }
                }

                // Now enforce the check if we have an App Context
                if (authReq.currentApp && !authReq.currentApp.id.includes('guest')) {
                    if (!authReq.currentApp.services.includes(currentSlug)) {
                        const errorMsg = `Access Denied: Service '${currentSlug}' is not enabled for App '${authReq.currentApp.name}'.`;
                        console.warn(`[ServiceAccess] App Linkage Blocked: User=${effectiveUser?.email}, App=${authReq.currentApp.name}, Service=${currentSlug}`);
                        
                        // For GET requests, show the premium upgrade/enable page
                        if (req.method === 'GET') {
                             // [SOFT LOCK] Allow UI to load, but flag as denied so frontend Blocker takes over
                             res.locals.accessDenied = true;
                             res.locals.accessReason = 'service_disabled';
                             return next(); 
                        }

                        return res.status(403).json({ 
                            error: errorMsg 
                        });
                    }
                }


                    // 6. User-specific Feature & Quota Check
                // 6. User-specific Feature & Quota Check
                // OPTIMIZATION: Delegated to QuotaService for single-source-of-truth
                if (isRestricted) {
                    // [STRICT ACCESS CONTROL] "Fate of the World" Enforcement
                    // All Restricted Services (AI, PDF) MUST be accessed via an App.
                    // If no App Context was resolved (via API Key or Body/Query), Block it.
                    if (!authReq.currentApp) {
                        const failMsg = 'Access Denied: This service requires a valid App Context. Please provide X-API-Key or appId.';
                        if (req.xhr || req.headers.accept?.includes('json')) {
                            return res.status(403).json({ error: failMsg, code: 'APP_CONTEXT_REQUIRED' });
                        }
                        // For Web GET, redirect to onboarding/apps
                        if (req.method === 'GET') {
                             // [SOFT LOCK] Allow UI to load, but flag as denied
                             res.locals.accessDenied = true;
                             res.locals.accessReason = 'no_app_context'; // UI will check initAppId too
                             return next();
                        }
                    }

                    // Exception: Allow Preview requests and Job Status Polling (non-billable read ops)
                    const isPreview = req.path.endsWith('/preview');
                    const isJobPoll = req.path.includes('/jobs/');
                    
                    if (!isPreview && !isJobPoll) {
                        const { quotaService } = await import('../services/quota.service');
                        
                        try {
                            // This throws if quota is exceeded or feature missing
                            await quotaService.checkQuota(effectiveUser.id, currentSlug);
                        } catch (error: any) {
                             // Handle Quota/Access Errors from Service
                            const isLimitError = error.message.includes('Limit');
                            const errorMsg = error.message;

                            if (req.method === 'GET') {
                                res.locals.limitReached = isLimitError;
                                res.locals.accessDenied = true;
                                res.locals.accessReason = isLimitError ? 'quota_reached' : 'upgrade_required';
                                return next(); // Soft block for UI rendering
                            }

                            return res.status(403).json({ 
                                error: errorMsg, 
                                limitReached: isLimitError,
                                upgradeRequired: !isLimitError 
                            });
                        }
                    }
                }
            }

            // 7. Success
            next();
        } catch (error) {
            console.error('[ServiceAccessMiddleware] Fatal error:', error);
            return res.status(500).json({ error: 'Internal security check failed' });
        }
    };
};
