import { Request, Response, NextFunction } from 'express';
import { TraceManager } from '../lib/trace';

export const strictRequestLogger = (req: Request, res: Response, next: NextFunction) => {
    const traceContext = TraceManager.getContext();
    const traceId = traceContext?.traceId || (req as any).traceId || 'no-trace';

    // Mask Sensitive Headers
    const safeHeaders = { ...req.headers };
    if (safeHeaders['authorization']) safeHeaders['authorization'] = '[REDACTED]';
    if (safeHeaders['x-api-key']) safeHeaders['x-api-key'] = '[REDACTED]';
    if (safeHeaders['cookie']) safeHeaders['cookie'] = '[REDACTED]';

    // Log Attempt
    // Log Attempt (Commented out to reduce noise)
    /*
    console.log(JSON.stringify({
        type: 'STRICT_LOG_ATTEMPT',
        timestamp: new Date().toISOString(),
        traceId,
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        headers: safeHeaders,
        // We might not have User/App ID yet if this runs before Auth, 
        // but we capture what we can
        query: req.query
    }));
    */

    next();
};
