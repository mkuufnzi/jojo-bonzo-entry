import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { AuthRequest } from './auth.middleware';
import { getRedisClient } from '../lib/redis';

// Public Rate Limiter
// Limit: 20 requests per hour per IP for public tools
const redisClient = getRedisClient();

// Rate Limiter configuration is handled inside the middleware


export const publicAuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    // Check for Public Token (injected by frontend for guest users)
    const publicToken = req.header('X-Public-Guest-Token');

    // In a real app, 'public-guest' string is too simple. 
    // We should use a signed JWT or similar if we want to secure it further, 
    // but for "Guest" access on landing page, checking the origin (via CORS) + Rate Limit is the main defense.
    // Here we use a shared secret "public-token-secret" that the frontend knows.

    // For this MVP, we'll accept a specific static token or just presence if origin matches.
    // Let's assume the frontend sends 'guest-access-token'

    if (publicToken === 'guest-access-token') {

        // 1. Rate Limiting (Optimized: No DB access)
        // 1. Rate Limiting (Optimized: No DB access)
        if (redisClient) {
            const ip = req.ip || 'unknown';
            const key = `public_limit:${ip}`;

            try {
                const current = await redisClient.incr(key);
                if (current === 1) await redisClient.expire(key, 60 * 60);
                if (current > 20) {
                    res.status(429).json({ error: 'Guest request limit exceeded.' });
                    return;
                }
            } catch (err) {
                // Ignore redis errors for public access
            }
        }

        // 2. Assign Virtual Context
        (req as AuthRequest).user = undefined; // No user
        (req as AuthRequest).currentApp = {
            id: 'public-guest-app',
            name: 'Public Guest App',
            apiKey: 'public-guest-key',
            services: ['html-to-pdf'] // Hardcoded enabled services for public
        };

        // Flag for Quota Middleware to skip DB checks
        (req as any).isPublic = true;

        return next();
    }

    // If not public token, continue to normal auth (or fail if this was the only method expected)
    // If this middleware is used in a chain that *requires* auth, we should fail or let next() handle it.
    // If we put this BEFORE apiKeyAuth, we can fall through.
    next();
};
