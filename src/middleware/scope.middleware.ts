import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';

export const requireScope = (requiredServiceSlug: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    // If no currentApp (e.g. session auth), skip scope check or handle differently
    // For now, we assume this middleware is used after apiKeyAuth
    if (!req.currentApp) {
        // If authenticated via session (internal usage), we might allow all scopes or check user permissions
        // But since this is for API keys, we'll assume strict check if currentApp is present.
        // If req.user is present but req.currentApp is not, it means session auth.
        if (req.user) {
            return next();
        }
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!req.currentApp.services.includes(requiredServiceSlug)) {
      return res.status(403).json({ 
        error: 'Access denied', 
        message: `This API key does not have access to the '${requiredServiceSlug}' service.` 
      });
    }

    next();
  };
};
