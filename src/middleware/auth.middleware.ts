import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';

export interface AuthRequest extends Omit<Request, 'user' | 'currentApp'> {
  user?: any; 
  currentApp?: {
    id: string;
    name: string;
    apiKey: string;
    services: string[]; // Array of enabled service slugs
  };
}

export const apiKeyAuth = async (req: Request, res: Response, next: NextFunction) => {
  // If user is already authenticated (e.g. via PublicAuthMiddleware), skip API key check
  if ((req as AuthRequest).user || (req as AuthRequest).currentApp || res.locals.user) {
    if (res.locals.user && !(req as AuthRequest).user) {
         (req as AuthRequest).user = res.locals.user;
    }
    return next();
  }

  const apiKeyHeader = req.header('X-API-Key');
  const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;

  if (!apiKey) {
    res.status(401).json({ error: 'Missing X-API-Key header' });
    return;
  }

  try {
    const app = await prisma.app.findUnique({
      where: { apiKey },
      include: {
        user: {
          include: {
            subscription: {
              include: {
                plan: true
              }
            }
          }
        },
        services: {
          include: {
            service: true
          }
        }
      }
    });

    if (!app) {
      res.status(403).json({ error: 'Invalid API Key' });
      return;
    }

    if (!app.isActive) {
      res.status(403).json({ error: 'API Key Revoked. Please restore access in the dashboard.' });
      return;
    }

    if (!app.user.isActive) {
      res.status(403).json({ error: 'Account Suspended. Please contact support.' });
      return;
    }

    // Inject full user into locals so downstream middlewares (like checkQuota and requireServiceAccess) 
    // work consistently for both Web and API routes.
    res.locals.user = app.user;
    (req as any).user = app.user;

    (req as AuthRequest).currentApp = {
      id: app.id,
      name: app.name,
      apiKey: app.apiKey,
      services: app.services.map(s => s.service.slug)
    };

    // --- SAE ENHANCEMENT: Populate Trace Context ---
    const { TraceManager } = require('../lib/trace');
    const traceContext = TraceManager.getContext();
    if (traceContext) {
      traceContext.userId = app.user.id;
      traceContext.appId = app.id;
    }

    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Internal server error during authentication' });
  }
};
