import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

export const validate = (schema: z.ZodSchema<any>, view?: string) => (req: Request, res: Response, next: NextFunction) => {
    try {
        schema.parse({
            body: req.body,
            query: req.query,
            params: req.params
        });
        next();
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            // Check if request expects HTML (browser) and view is provided
            if (view && (req.headers.accept?.includes('text/html') || req.headers['content-type'] === 'application/x-www-form-urlencoded')) {
                const firstError = error.errors[0]?.message || 'Validation failed';
                return res.render(view, { 
                    error: firstError,
                    // Pass body back to refill form if needed
                    ...req.body,
                    // Keep returnUrl if present
                    returnUrl: req.query.returnUrl || req.body.returnUrl
                });
            }

            // Default to JSON response
             res.status(400).json({
                status: 'error',
                message: 'Validation failed',
                errors: error.errors.map(e => ({
                    field: e.path.join('.'),
                    message: e.message
                }))
            });
        } else {
             if (view && (req.headers.accept?.includes('text/html'))) {
                 return res.render(view, { error: 'Invalid request data' });
             }
             res.status(400).json({
                status: 'error',
                message: 'Invalid request data'
            });
        }
        // Don't call next() if we sent a response
    }
};
