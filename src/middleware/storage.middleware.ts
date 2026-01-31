import { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/AppError';

const DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB Default Safe Limit

export const checkStorageLimit = async (req: Request, res: Response, next: NextFunction) => {
    // Only check methods that send data
    if (['POST', 'PUT', 'PATCH'].indexOf(req.method) === -1) {
        return next();
    }

    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    
    // 1. Get User/Plan Context (Attached by Auth/Subscription middleware)
    const user = (req as any).user || res.locals.user;
    
    if (user) {
        // Assume plan has a limit, or default to 10MB (Free) vs 50MB (Pro)
        // In a real DB schema, we'd fetch user.subscription.plan.maxUploadSize
        const isPro = user.subscription?.plan?.name === 'Pro' || user.subscription?.plan?.price > 0;
        const limit = isPro ? 50 * 1024 * 1024 : 5 * 1024 * 1024; // 5MB Free, 50MB Pro

        if (contentLength > limit) {
             console.warn(`[Storage Guard] Blocked Request: ${contentLength} bytes > Limit ${limit} bytes. User: ${user.id}`);
             return next(new AppError(`Payload too large. Your plan limit is ${limit / (1024*1024)}MB.`, 413));
        }
    } else {
        // Guest / Public Limits (Strict)
        if (contentLength > 5 * 1024 * 1024) {
             console.warn(`[Storage Guard] Blocked Public Request: ${contentLength} bytes`);
             return next(new AppError('Payload too large for guest access.', 413));
        }
    }

    next();
};
