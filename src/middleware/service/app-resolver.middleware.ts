import { Request, Response, NextFunction } from 'express';
import prisma from '../../lib/prisma';
import { AuthRequest } from '../auth.middleware';
import { ServiceAccessContext } from '../../types/service-context';

/**
 * App Resolver Middleware
 * Responsible for identifying which App Logic is being executed.
 * Priority: Header > Query > Body > Session
 */
export const resolveApp = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        const user = res.locals.user || (req as any).user;

        if (!user) {
            // If no user, we can't resolve an app (unless public/guest logic, handled elsewhere)
            return next();
        }

        let appId = req.header('X-App-Id') 
            || (req.query.appId as string) 
            || (req.body && req.body.appId)
            || (authReq.currentApp?.id);

        if (!appId) {
             return next();
        }

        // Optimization: If authReq already has the correct app, use it
        if (authReq.currentApp && authReq.currentApp.id === appId) {
            // Already resolved by session or previous middleware
            // Ensure we strictly type it into our new context
             ensureContext(res);
             res.locals.serviceContext.app = {
                 id: authReq.currentApp.id,
                 name: authReq.currentApp.name,
                 isActive: true, // Session implies active usually, but double check?
                 // STRICT: Ensure services are string[] (slugs)
                 services: (authReq.currentApp.services || []).map((s: any) => 
                    typeof s === 'string' ? s : (s.service?.slug || s.serviceId)
                 ),
                 apiKey: authReq.currentApp.apiKey
             };
             return next();
        }

        // Resolve from DB
        const app = appId 
            ? await prisma.app.findFirst({
                where: { id: appId, userId: user.id },
                include: { services: { include: { service: true } } }
              })
            : await prisma.app.findFirst({
                where: { userId: user.id, isActive: true },
                orderBy: { createdAt: 'asc' },
                include: { services: { include: { service: true } } }
              });

        if (app) {
             ensureContext(res);
             
             // 1. Modern Context (UI)
             res.locals.serviceContext.app = {
                 id: app.id,
                 name: app.name,
                 isActive: app.isActive,
                 services: app.services.filter(s => s.isEnabled).map(s => s.service.slug),
                 apiKey: app.apiKey
             };

             // 2. Legacy Context (Middleware/Controller)
             authReq.currentApp = {
                 id: app.id,
                 name: app.name,
                 apiKey: app.apiKey,
                 services: app.services.filter(s => s.isEnabled).map(s => s.service.slug)
             };
        }

        next();
    } catch (error) {
        console.error('[AppResolver] Failed:', error);
        next(error);
    }
};

function ensureContext(res: Response) {
    if (!res.locals.serviceContext) {
        res.locals.serviceContext = { lockState: { isLocked: false, reason: 'none', softLock: false } } as ServiceAccessContext;
    }
}
