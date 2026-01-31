import { Request, Response, NextFunction } from 'express';
import { v4 as uuid } from 'uuid';
import prisma from '../lib/prisma';
import { logger } from '../lib/logger';

/**
 * Universal Audit Logging Middleware
 * 
 * Automatically logs all API calls to the AuditLog table for:
 * - Compliance and regulatory requirements
 * - Security audit trails
 * - Performance monitoring
 * - Debugging and troubleshooting
 * - Business analytics
 * 
 * Applied globally in index.ts after authentication middleware
 */
export const auditLog = async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const requestId = (req.headers['x-request-id'] as string) || uuid();
  
  // Capture original response methods
  const originalSend = res.send.bind(res);
  const originalJson = res.json.bind(res);
  
  let responseData: any;
  let responseCaptured = false;
  
  // Intercept res.send()
  res.send = function(data: any) {
    if (!responseCaptured) {
      responseData = data;
      responseCaptured = true;
    }
    return originalSend(data);
  };
  
  // Intercept res.json()
  res.json = function(data: any) {
    if (!responseCaptured) {
      responseData = data;
      responseCaptured = true;
    }
    return originalJson(data);
  };
  
  // Log on response finish
  res.on('finish', async () => {
    const duration = Date.now() - startTime;
    const user = res.locals.user || (req as any).user;
    const app = (req as any).currentApp;
    const service = (req as any).service;
    
    // Determine action type
    let actionType = 'api_call';
    if (req.path.includes('/webhooks/')) {
      actionType = 'erp_webhook';
    } else if (req.path.includes('/n8n/')) {
      actionType = 'n8n_response';
    }
    
    // Skip audit logging for high-volume, low-value endpoints
    const skipPaths = [
      '/health',
      '/ping',
      '/favicon.ico',
      '/public/',
      '/static/'
    ];
    
    const shouldSkip = skipPaths.some(path => req.path.includes(path));
    if (shouldSkip) {
      return; // Don't log health checks and static assets
    }
    
    try {
      await prisma.auditLog.create({
        data: {
          id: uuid(),
          timestamp: new Date(),
          
          // Actor
          userId: user?.id,
          appId: app?.id,
          businessId: user?.businessId,
          
          // Action
          actionType,
          serviceId: service?.slug,
          eventType: req.body?.normalizedEventType || req.body?.event_type,
          
          // Request
          requestPayload: {
            method: req.method,
            path: req.path,
            query: req.query,
            headers: {
              'user-agent': req.headers['user-agent'],
              'content-type': req.headers['content-type'],
              'x-forwarded-for': req.headers['x-forwarded-for']
            },
            // Only log body for non-GET requests and limit size
            body: req.method !== 'GET' && req.body ? 
              JSON.stringify(req.body).substring(0, 10000) : undefined
          },
          requestId,
          
          // Response
          responseStatus: res.statusCode,
          responseData: responseCaptured ? 
            (typeof responseData === 'string' ? { data: responseData.substring(0, 1000) } : responseData) 
            : null,
          
          // Performance
          durationMs: duration,
          
          // Result
          success: res.statusCode < 400,
          errorMessage: res.statusCode >= 400 ? responseData?.error || responseData?.message : null
        }
      }).catch(error => {
        // Fail silently - we don't want audit logging failures to break the app
        logger.error({ error, requestId, path: req.path }, 'Failed to create audit log entry');
      });
    } catch (error) {
      logger.error({ error, requestId }, 'Audit log middleware error');
    }
  });
  
  next();
};

/**
 * High-Priority Audit Log (synchronous)
 * 
 * For critical actions that MUST be logged immediately (blocking),
 * use this function directly instead of the middleware.
 * 
 * Example: n8n dispatch, quota enforcement, security events
 */
export const createAuditLog = async (params: {
  userId?: string;
  appId?: string;
  businessId?: string;
  actionType: string;
  serviceId?: string;
  eventType?: string;
  requestPayload?: any;
  requestId?: string;
  responseStatus?: number;
  responseData?: any;
  durationMs?: number;
  success: boolean;
  errorMessage?: string;
}) => {
  try {
    return await prisma.auditLog.create({
      data: {
        id: uuid(),
        timestamp: new Date(),
        ...params
      }
    });
  } catch (error) {
    logger.error({ error, params }, 'Failed to create explicit audit log');
    throw error; // Rethrow for caller to handle
  }
};
