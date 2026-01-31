import { Response } from 'express';
import { ServiceAccessContext } from '../types/service-context';
import { AppError } from '../lib/AppError';

/**
 * Base Service Controller
 * Implements the Template Method Pattern for Service Controllers.
 * Enforces strict type safety for View Rendering using ServiceAccessContext.
 */
export abstract class BaseServiceController {
    
    /**
     * Standardized Render Method
     * automatically injects the 'locked' state and context into the view.
     */
    protected static renderServiceView(res: Response, viewPath: string, context: Partial<ServiceAccessContext> & { title: string, [key: string]: any }) {
        // 1. Extract Locking State from locals (set by Global Guard Middleware)
        const accessDenied = res.locals.accessDenied || false;
        const accessReason = res.locals.accessReason || 'none';
        
        // 2. Prepare View Data
        const viewData = {
            ...context,
            // Standard Security Context
            accessDenied,
            accessReason,
            // Full Context for Client-Side Safeguards
            serviceContext: res.locals.serviceContext,
            // Ensure User is passed if not already
            user: context.user || res.locals.user, 
        };

        // 3. Render
        res.render(viewPath, viewData);
    }

    /**
     * Standardized JSON Response for API Actions
     */
    protected static sendSuccess(res: Response, data: any, message?: string) {
        res.json({
            success: true,
            message,
            data
        });
    }

    protected static sendError(res: Response, error: Error | AppError) {
        const statusCode = (error as AppError).statusCode || 500;
        const message = error.message || 'Internal Service Error';
        
        res.status(statusCode).json({
            success: false,
            error: message,
            code: (error as any).code || 'INTERNAL_ERROR'
        });
    }
}
