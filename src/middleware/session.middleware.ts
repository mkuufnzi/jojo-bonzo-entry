import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { FeatureAccessService } from '../services/feature-access.service';

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const isApiRequest = req.xhr || req.headers.accept?.indexOf('json')! > -1 || req.path.startsWith('/api/') || req.baseUrl.includes('/api/');

  if (!(req.session as any).userId) {
    if (isApiRequest) {
        return res.status(401).json({ success: false, error: 'Session expired. Please log in again.' });
    }
    return res.redirect('/auth/login');
  }

  // 1. Check if user is already populated (by injectUser or Passport)
  if ((req as any).user) {
    if (!res.locals.user) {
        res.locals.user = (req as any).user;
    }
    // Continue
  } else if (res.locals.user) {
      // Already populated
  } else {
      // 2. Populate user from Session ID if not present
      if (!(req.session as any).userId) {
          if (isApiRequest) {
              return res.status(401).json({ success: false, error: 'Session expired. Please log in again.' });
          }
          console.log('[Session] ⚠️ No User ID in session. Redirecting to login.');
          return res.redirect('/auth/login');
      }

      try {
        const { UserRepository } = require('../repositories/user.repository');
        const userRepo = new UserRepository();
        const user = await userRepo.findByIdWithRelations((req.session as any).userId);

        if (!user) {
          console.log('[Session] ❌ User ID found in session but User not found in DB. Destroying session.');
          (req.session as any).destroy(() => {});
          return res.redirect('/auth/login');
        }

        console.log(`[Session] ✅ Restored user session for: ${user.email} (businessId: ${user.businessId})`);
        (req as any).user = user;
        res.locals.user = user;
        console.log(`[Session] Injected into res.locals.user: ${!!res.locals.user}`);
      } catch (error) {
         console.error('[Session] ❌ Error restoring user session:', error);
         return next(error);
      }
  }

  // 3. Common Enrichment (Run for ALL authenticated users)
  try {
    const user = res.locals.user;
    if (user) {
        // Add feature access flags
        (res.locals.user as any).hasAiAccess = FeatureAccessService.hasAiAccess(user);
        (res.locals.user as any).hasPdfAccess = FeatureAccessService.hasPdfAccess(user);
        (res.locals.user as any).isPaidUser = FeatureAccessService.isPaidUser(user);
        (res.locals.user as any).planName = FeatureAccessService.getPlanName(user);
        
        // Admin Check
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
        const isTestUser = user.email === 'bwj.floovioo.test@gmail.com'; 
        // Respect DB flag OR hardcoded email
        (res.locals.user as any).isAdmin = user.isAdmin || user.email === adminEmail || isTestUser;
        
        console.log(`[Session] Enrichment for ${user.email}. isAdmin default: ${user.isAdmin}, Computed: ${(res.locals.user as any).isAdmin}`);

        // CENTRALIZED ROLE PROMOTION
        // If user is marked as Admin but has default USER role, promote to ROOT for this session.
        // This fixes issues where RBAC checks fail because they look for specific admin roles.
        if ((res.locals.user as any).isAdmin && (!user.role || user.role === 'USER')) {
            console.log(`[Session] PROMOTING ${user.email} from '${user.role}' to 'ROOT'`);
            (res.locals.user as any).role = 'ROOT';
             // Also update the object ref if needed
            if ((req as any).user) (req as any).user.role = 'ROOT';
        } else {
             console.log(`[Session] No Promotion. Role is '${user.role}'`);
        }
    }
    next();
  } catch (error) {
    next(error);
  }
};
