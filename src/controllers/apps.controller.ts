import { Request, Response, NextFunction } from 'express';
import { AppService } from '../services/app.service';
import { AppError } from '../lib/AppError';
import { createAppSchema, regenerateKeySchema, toggleServiceSchema, toggleActiveSchema, deleteAppSchema } from '../schemas/app.schema';

const appService = new AppService();

export class AppsController {
    static async index(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = (req.session as any).userId;
            const { user, services } = await appService.getDashboardData(userId);
            res.render('dashboard/apps', { user, services, title: 'Enterprise Apps', activeService: 'hub', error: null });
        } catch (error) {
            if (error instanceof AppError && error.statusCode === 404) {
                return res.redirect('/auth/login');
            }
            next(error);
        }
    }

    static async store(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = (req.session as any).userId;
            
            const validation = createAppSchema.safeParse(req.body);
            if (!validation.success) {
                // If validation fails, technically we should show error. 
                // For now, let's map it to an error message or throw.
                throw new AppError(validation.error.issues[0].message, 400);
            }

            const { name, services } = validation.data;
            const serviceIds = services ? (Array.isArray(services) ? services : [services]) : [];

            await appService.createApp(userId, name, serviceIds as string[], {
                userId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });

            res.redirect('/apps');
        } catch (error) {
            if (error instanceof AppError && error.message.includes('limit reached')) {
                 try {
                    const userId = (req.session as any).userId;
                    const { user, services } = await appService.getDashboardData(userId);
                    return res.render('apps', { user, services, error: error.message });
                 } catch (e) {
                     return next(e);
                 }
            }
            next(error);
        }
    }

    static async regenerateKey(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = (req.session as any).userId;
            const validation = regenerateKeySchema.safeParse(req.body);
            if (!validation.success) throw new AppError(validation.error.issues[0].message, 400);
            
            const { appId } = validation.data;

            await appService.regenerateApiKey(userId, appId, {
                userId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });

            res.redirect('/apps');
        } catch (error) {
            next(error);
        }
    }
    
    static async destroy(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = (req.session as any).userId;
            const validation = deleteAppSchema.safeParse(req.body);
            if (!validation.success) throw new AppError(validation.error.issues[0].message, 400);
            
            const { appId } = validation.data;

            await appService.deleteApp(userId, appId, {
                userId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });

            res.redirect('/apps');
        } catch (error) {
            next(error);
        }
    }

    static async toggleService(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = (req.session as any).userId;
            
            // Pre-process body for mixed types if needed (though Zod handles some)
            const validation = toggleServiceSchema.safeParse(req.body);
            if (!validation.success) {
                 if (req.xhr || req.headers.accept?.includes('json')) {
                    return res.status(400).json({ error: validation.error.issues[0].message });
                 }
                 throw new AppError(validation.error.issues[0].message, 400);
            }

            const { appId, serviceId, serviceSlug, enabled } = validation.data;
            let targetServiceId = serviceId;
            const isEnabled = enabled;

            // Resolve Service ID from Slug if necessary
            if (!targetServiceId && serviceSlug) {
                const service = await appService.getServiceBySlug(serviceSlug);
                if (service) targetServiceId = service.id;
            }

            if (!targetServiceId) {
                if (req.xhr || req.headers.accept?.includes('json')) {
                    return res.status(400).json({ error: 'Missing service identifier (serviceId or serviceSlug)' });
                }
                throw new AppError('Service identifier missing', 400);
            }

            await appService.toggleService(userId, appId, targetServiceId, isEnabled, {
                userId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });

            if (req.xhr || req.headers.accept?.includes('json')) {
                return res.json({ success: true, enabled: isEnabled });
            }

            res.redirect('/apps');
        } catch (error) {
             if (req.xhr || req.headers.accept?.includes('json')) {
                return res.status((error as any).statusCode || 500).json({ error: (error as any).message || 'Toggle failed' });
            }
            next(error);
        }
    }

    static async toggleActive(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = (req.session as any).userId;
            
            const validation = toggleActiveSchema.safeParse(req.body);
            if (!validation.success) throw new AppError(validation.error.issues[0].message, 400);

            const { appId, isActive } = validation.data;
            const active = isActive;

            await appService.toggleActive(userId, appId, active, {
                userId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });

            res.redirect('/apps');
        } catch (error) {
            next(error);
        }
    }
}
