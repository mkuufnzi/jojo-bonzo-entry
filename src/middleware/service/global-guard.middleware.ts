import { Request, Response, NextFunction, RequestHandler } from 'express';
import prisma from '../../lib/prisma';
import { AuthRequest } from '../auth.middleware';
import { ServiceAccessContext, LockReason } from '../../types/service-context';
import { resolveApp } from './app-resolver.middleware';
import { ServiceError } from '../../lib/ServiceError';

/**
 * Global Service Guard
 * The "Fate of the World" enforcement layer.
 * Enforces: Subscription -> App Enablement -> Feature Access -> Quota
 */
export const requireServiceAccess = (serviceSlug?: string): RequestHandler => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const authReq = req as AuthRequest;
        let user = res.locals.user || (req as any).user;
        const currentSlug = serviceSlug || req.params.slug || (req as any).service?.slug;

        // 0. Initialize Context
        ensureContext(res);
        const context = res.locals.serviceContext;

        // 1. Identification (Public vs Private)
        if (!user && !authReq.currentApp) {
             if (isApiRequest(req)) {
                return res.status(401).json({ error: 'Identification required.' });
             }
             return res.redirect('/auth/login');
        }

        // 2. Resolve App Context (if not already done)
        if (!context.app) {
            // Manually run resolver if needed, but ideally it runs before.
            // For now, we assume AppResolver runs before OR we call it here?
            // Let's rely on standard middleware chain, but double check.
            if (!context.app && authReq.currentApp) {
                 // port over from session
                 context.app = {
                     id: authReq.currentApp.id,
                     name: authReq.currentApp.name,
                     isActive: true,
                     services: authReq.currentApp.services,
                     apiKey: authReq.currentApp.apiKey
                 };
            }
        }
        // Diagnostic Logging
        console.log(`🛡️ [GlobalGuard] Checking Access: ${currentSlug} (User: ${user?.id || 'Unknown'})`);

        // 3. Service Lookup
        const service = await getService(currentSlug);
        if (!service) {
             return res.status(404).json({ error: 'Service not found.' });
        }
        context.service = service;

        // 2.5 Implementation Check (PRIORITY: Show Coming Soon if not implemented)
        const implementedSlugs = ['html-to-pdf', 'ai-doc-generator', 'transactional-branding'];

        // 4. Subscription Check (Skip for Guests)
        const isGuest = context.app?.id.includes('guest');
        if (!isGuest && user) {
            const sub = user.subscription;
            const valid = ['active', 'canceling'].includes(sub?.status || '');
            
            if (!valid) {
                return applyLock(req, res, next, ServiceError.SubscriptionRequired(sub?.status || 'none'));
            }
        }

        // 5. App Linkage Check (The "Strict App Context" Rule)
        if (service.isRestricted) {
            if (!context.app) {
                 return applyLock(req, res, next, ServiceError.AppContextRequired());
            }
            // Architecture Standard: context.app.services is ALWAYS string[] (slugs)
            if (!context.app.services.includes(currentSlug)) {
                 return applyLock(req, res, next, ServiceError.ServiceDisabled(service.name));
            }
        }


        // 5.5 Feature Access Check (The "Strict Plan" Rule)
        // Enforce that even if the App has the service enabled, the User's Plan must still support it.
        const cachedService = context.service || await getService(currentSlug);
        if (cachedService && cachedService.requiredFeatureKey) {
            const { FeatureAccessService } = await import('../../services/feature-access.service');
            const hasAccess = FeatureAccessService.hasFeature(user, cachedService.requiredFeatureKey);
            
            if (!hasAccess) {
                // Special handling for quota-based features if hasFeature returns false (it mostly checks booleans)
                // Actually hasFeature checks plan enablement. Quota is checked in Step 6.
                // If checking 'ai_generation', we trust hasFeature or fallback to quota > 0 check?
                // FeatureAccessService.hasFeature checks isEnabled flag in PlanFeature.
                return applyLock(req, res, next, ServiceError.FeatureNotIncluded(cachedService.requiredFeatureKey));
            }
        }

        // 6. Quota Check (Delegated)
        if (!isGuest && service.isRestricted) {
             const { quotaService } = await import('../../services/quota.service');
             const { serviceRegistry } = await import('../../services/service-registry.service');
             
             const isApi = isApiRequest(req);
             const isGet = req.method === 'GET';
             
             // [PROD-FIX] Determine if we should enforce quota
             let shouldCheckQuota = true;

             // 1. Always allow API READ operations (Polling, Status, Data)
             if (isApi && isGet) {
                 shouldCheckQuota = false;
             }

             // 2. Check Service Registry for explicitly non-billable paths (e.g., Analysis)
             if (shouldCheckQuota && serviceRegistry.isPathBillable(currentSlug, req.path) === false) {
                 shouldCheckQuota = false;
             }

             if (shouldCheckQuota) {
                 try {
                     await quotaService.checkQuota(user.id, currentSlug);
                 } catch (e: any) {
                     if (e.message.includes('Limit')) {
                         return applyLock(req, res, next, ServiceError.QuotaReached('AI Generation'));
                     }
                     console.error('[GlobalGuard] Quota Check Error:', e);
                 }
             }
        }

        // 7. Success - Pass Context to Controller
        next();
    };
};

// Helper: Get Service
const _serviceCache: Record<string, any> = {};
async function getService(slug: string) {
    if (_serviceCache[slug]) return _serviceCache[slug];
    
    // Lazy load to avoid circular dependency if any, or just keeping it clean
    const { RESTRICTED_SERVICES } = await import('../../types/features.enum');
    
    const s = await prisma.service.findUnique({ where: { slug } });
    if (s) _serviceCache[slug] = {
        id: s.id, 
        slug: s.slug, 
        name: s.name,
        requiredFeatureKey: s.requiredFeatureKey,
        isRestricted: RESTRICTED_SERVICES.includes(s.slug as any) || !!s.requiredFeatureKey
    };
    return _serviceCache[slug];
}

// Helper: Apply Lock (Soft vs Hard)
function applyLock(req: Request, res: Response, next: NextFunction, error: ServiceError) {
    const context = res.locals.serviceContext;
    
    // Soft Lock for GET (View)
    if (req.method === 'GET' && !req.xhr && !req.path.startsWith('/api')) {
        context.lockState = {
            isLocked: true,
            reason: error.reason as LockReason,
            message: error.message,
            softLock: true
        };
        // Expose to legacy locals for EJS
        res.locals.accessDenied = true;
        res.locals.accessReason = error.reason; 
        return next();
    }

    // Hard Block for Actions
    return res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
        locked: true,
        details: error.lockState
    });
}

function ensureContext(res: Response) {
    if (!res.locals.serviceContext) {
        res.locals.serviceContext = { 
            user: res.locals.user,
            lockState: { isLocked: false, reason: 'none', softLock: false } 
        } as ServiceAccessContext;
    }
}

function isApiRequest(req: Request) {
    return req.xhr || req.path.startsWith('/api') || req.headers.accept?.includes('json');
}
