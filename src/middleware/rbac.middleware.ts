import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { ROLES, ROLE_PERMISSIONS } from '../config/roles';

// Export ROLES for use in routes
export { ROLES, auditLog };

export const injectPermissions = (req: Request, res: Response, next: NextFunction) => {
    if (res.locals.user) {
        let role = res.locals.user.role || ROLES.USER;
        
        // Robustness: Handle whitespace or casing issues if DB has strange values
        if (typeof role === 'string') {
             role = role.trim();
        }

        // Session middleware guarantees role upgrade for legacy admins
        const permissionsList = ROLE_PERMISSIONS[role] || [];
        
        // Convert array to object for O(1) in views: permissions.canEdit = true
        const permissions: Record<string, boolean> = {};
        permissionsList.forEach(p => { permissions[p] = true; });
        
        // Also inject role for easy access
        res.locals.permissions = permissions;
        res.locals.role = role;

        // DEBUG: Trace permissions in console to allow debugging
        console.log(`[RBAC] User: ${res.locals.user.email} | Role: '${role}' | Perms: ${Object.keys(permissions).length}`);
        if (Object.keys(permissions).length === 0 && role !== 'USER') {
             console.log(`[RBAC] ⚠️ Warning: User has role '${role}' but no permissions mapping found!`);
             console.log(`[RBAC] Available Roles: ${Object.keys(ROLE_PERMISSIONS).join(', ')}`);
        }
    } else {
        res.locals.permissions = {};
    }
    next();
};

export const requireRole = (allowedRoles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = res.locals.user;

        // AUTH REDIRECT FIX: Redirect unauthenticated requests to Admin Login
        if (!user) {
            return res.redirect('/admin/login');
        }

        // Check Role
        // Session middleware handles promoting isAdmin=true to ROOT
        let userRole = user.role || ROLES.USER;

        // Check Role
        if (allowedRoles.includes(userRole)) {
            return next();
        }

        // Access Denied
        res.status(403).render('admin/403', { 
            layout: false, 
            message: `Access Denied. Required Role: ${allowedRoles.join(' or ')}` 
        });
    };
};

const auditLog = (action: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const user = res.locals.user;
        if (user) {
            try {
                await prisma.adminLog.create({
                    data: {
                        adminId: user.id,
                        action,
                        target: req.params.id || req.body.email || 'N/A',
                        ip: req.ip || '',
                        details: req.body ? JSON.parse(JSON.stringify(req.body)) : {}
                    }
                });
            } catch (e) {
                console.error('Audit Log Failed:', e);
            }
        }
        next();
    };
};
