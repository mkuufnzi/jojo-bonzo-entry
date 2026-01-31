import { Request, Response, NextFunction } from 'express';
import { FeatureAccessService } from '../services/feature-access.service';

/**
 * Middleware to require a specific feature access
 * @param featureKey - The feature key to check
 */
export const requireFeature = (featureKey: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // User should have been injected by injectUser middleware
      // We use res.locals.user which has the plan features loaded
      const user = res.locals.user;
      
      if (!user) {
        if (req.xhr || req.headers.accept?.includes('json')) {
             return res.status(401).json({ error: 'Unauthorized' });
        }
        return res.redirect('/auth/login');
      }
      
      // Explicitly check feature access using the service
      // This checks both the planFeatures table AND legacy quotas
      let hasAccess = false;
      
      if (featureKey === 'ai_generation') {
        hasAccess = FeatureAccessService.hasAiAccess(user);
      } else if (featureKey === 'pdf_conversion') {
        hasAccess = FeatureAccessService.hasPdfAccess(user);
      } else {
        hasAccess = FeatureAccessService.hasFeature(user, featureKey);
      }
      
      if (hasAccess) {
        return next();
      }
      
      // If no access, determine response type
      if (req.xhr || req.headers.accept?.includes('json')) {
        return res.status(403).json({ 
          error: 'Feature not enabled for your plan',
          requiredFeature: featureKey,
          upgradeRequired: true
        });
      }
      
      // Redirect to upgrade or show error page
      return res.redirect('/billing?upgrade=true&feature=' + featureKey);
      
    } catch (error) {
      console.error(`Error checking feature access for ${featureKey}:`, error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  };
};

/**
 * Middleware to require active subscription for paid features
 * Serves as a catch-all for paid-only routes
 */
export const requirePaidPlan = (req: Request, res: Response, next: NextFunction) => {
    const user = res.locals.user;
    if (!user) return res.redirect('/auth/login');

    if (!user.isPaidUser) {
        if (req.xhr || req.headers.accept?.includes('json')) {
            return res.status(403).json({ error: 'Paid plan required' });
        }
        return res.redirect('/billing?upgrade=true');
    }
    next();
};
