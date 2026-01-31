import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { quotaService } from '../services/quota.service';

export const checkQuota = async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  try {
    const user = (req as any).user || res.locals.user;
    if (!user) {
      return next();
    }

    // Dynamic Service Resolution: 
    // 1. Check if route explicitly attached a service (from requireServiceAccess)
    // 2. Extract from URL params if named ':slug'
    // 3. Extract from Path segments (e.g., /api/pdf/convert -> pdf)
    let serviceSlug = (req as any).service?.slug || req.params.slug;

    if (!serviceSlug) {
        const segments = req.originalUrl.split('/').filter(Boolean);
        // If it's an API route (/api/v1/service/action), usually the 2nd or 3rd segment
        if (segments[0] === 'api') {
            serviceSlug = segments[1]; 
        } else if (segments[0] === 'services' || segments[0] === 'tools') {
            serviceSlug = segments[1];
        }
    }

    // Dynamic Quota Check based on Service Config
    // This allows us to strictly define billable paths in the DB (e.g. paths: [{path:'/convert', billable:true}])
    // and inherently makes all other paths (visits, toggles) FREE.
    const service = (req as any).service;
    const config = (service as any)?.config || {};
    
    // [FIX] Support both legacy flat array and new object array format
    // New format: paths: [{path: '/convert', billable: true}]
    // Legacy format: billablePaths: ['/convert']
    const pathsConfig = config.paths || [];
    const billablePaths = config.billablePaths || pathsConfig
        .filter((p: any) => p.billable !== false)
        .map((p: any) => p.path);
    
    // Check if the current path matches any of the billable paths
    const isBillablePath = billablePaths.some((path: string) => req.path.includes(path));
    
    console.log(`[Billing Flow] Checking Quota for: ${req.method} ${req.path}`);
    console.log(`[Billing Flow] Service: ${serviceSlug}, BillablePaths: ${JSON.stringify(billablePaths)}`);
    console.log(`[Billing Flow] Is Billable Action? ${isBillablePath}`);

    // ENFORCEMENT: Only check quota if we are on a billable path (AND it's a POST)
    // We double-check POST to be safe, but the path list is the primary source of truth.
    if (serviceSlug && isBillablePath && req.method === 'POST') {
        console.log(`[Billing Flow] 🛑 Enforcing Quota Limit (Check-only for Overage)...`);
        await quotaService.checkQuota(user.id, serviceSlug);
        console.log(`[Billing Flow] ✅ Quota/Overage Check Passed.`);
    } else {
        console.log(`[Billing Flow] 🟢 Quota Check Skipped (Non-billable action).`);
    }
    
    next();
  } catch (error) {
    next(error);
  }
};
