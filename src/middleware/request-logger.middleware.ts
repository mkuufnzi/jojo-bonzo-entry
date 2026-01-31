import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { logger } from '../lib/logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    // Hook into the response finish event
    res.on('finish', async () => {
        const duration = Date.now() - start;
        
        try {
            // Extract User ID (from session or attached user object)
            let userId: string | undefined = (req.session as any)?.userId;
            if (!userId && (req as any).user?.id) {
                userId = (req as any).user.id;
            }

            // Extract App ID (from API Key middleware)
            const appId: string | undefined = (req as any).currentApp?.id;

            await prisma.apiRequestLog.create({
                data: {
                    method: req.method,
                    path: req.originalUrl || req.url,
                    statusCode: res.statusCode,
                    duration: duration,
                    ipAddress: req.ip || (req.headers['x-forwarded-for'] as string) || null,
                    userAgent: req.headers['user-agent'] || null,
                    userId: userId || null,
                    appId: appId || null
                }
            });
        } catch (error) {
            // Fail silently to avoid affecting the response, but log to console
            logger.error({ err: error }, 'Request Logging Failed');
        }
    });

    next();
};
