import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';

/**
 * IP Ban Middleware
 * 
 * Checks if the request IP is banned before allowing access.
 * - Supports both permanent and temporary bans (with expiration)
 * - Returns 403 for banned IPs
 */
export const checkIpBan = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const clientIp = req.ip || req.socket.remoteAddress || '';
        
        // Skip check for empty IP (shouldn't happen in production)
        if (!clientIp) {
            return next();
        }
        
        // Check for active ban (graceful if table doesn't exist yet)
        let ban: any = null;
        try {
            ban = await (prisma as any).ipBan?.findFirst?.({
                where: {
                    ipAddress: clientIp,
                    OR: [
                        { expiresAt: null }, // Permanent ban
                        { expiresAt: { gt: new Date() } } // Not yet expired
                    ]
                }
            });
        } catch (e) {
            // Table doesn't exist yet - skip check
        }
        
        if (ban) {
            console.log(`[IP Ban] Blocked request from banned IP: ${clientIp}`);
            
            // For API requests, return JSON
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access denied. Your IP has been banned.',
                    reason: ban.reason || 'Policy violation'
                });
            }
            
            // For browser requests, render ban page
            return res.status(403).render('errors/ip-banned', {
                layout: false,
                reason: ban.reason || 'Policy violation',
                expiresAt: ban.expiresAt
            });
        }
        
        next();
    } catch (error) {
        console.error('[IP Ban] Error checking ban status:', error);
        // Fail open - don't block on errors
        next();
    }
};

/**
 * Get client IP helper
 * Handles proxies and various header formats
 */
export const getClientIp = (req: Request): string => {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        const ips = typeof forwarded === 'string' ? forwarded.split(',') : forwarded;
        return ips[0].trim();
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
};
