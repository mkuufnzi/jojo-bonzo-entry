import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

export const validate = (schema: z.ZodSchema<any>, view?: string) => async (req: Request, res: Response, next: NextFunction) => {
    try {
        await schema.parseAsync({
            body: req.body,
            query: req.query,
            params: req.params
        });
        next();
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            const errorDetails = error.errors.map(e => ({
                field: e.path.join('.'),
                message: e.message
            }));

            // Enterprise Logging - Persistent for debugging
            logger.warn({ 
                path: req.originalUrl, 
                method: req.method, 
                errors: errorDetails,
                body: req.body 
            }, '[VALIDATION ERROR]');

            console.warn(`[VALIDATION FAIL] ${req.method} ${req.originalUrl}:`, JSON.stringify(errorDetails, null, 2));

            // Check if request expects HTML (browser) and view is provided
            if (view && (req.headers.accept?.includes('text/html') || req.headers['content-type'] === 'application/x-www-form-urlencoded')) {
                const firstError = error.errors[0]?.message || 'Validation failed';
                return res.render(view, { 
                    error: firstError,
                    ...req.body,
                    returnUrl: req.query.returnUrl || req.body.returnUrl
                });
            }

            // Default to JSON response
             res.status(400).json({
                status: 'error',
                message: 'Validation failed',
                errors: errorDetails
            });
        } else {
             logger.error({ error, path: req.originalUrl }, '[REQUEST ERROR] Unexpected error during validation');
             if (view && (req.headers.accept?.includes('text/html'))) {
                 return res.render(view, { error: 'Invalid request data' });
             }
             res.status(400).json({
                status: 'error',
                message: 'Invalid request data'
            });
        }
    }
};
