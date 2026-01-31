import { Request, Response, NextFunction } from 'express';
import { LogRepository } from '../repositories/log.repository';
import { AuthRequest } from './auth.middleware';

const logRepository = new LogRepository();

export const logUsage = async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    // Capture the original end function to intercept response
    const originalEnd = res.end;
    
    // We need to cast res to any to override end
    (res as any).end = function (chunk: any, encoding: any) {
        try {
            // Restore original end
            (res as any).end = originalEnd;
            
            // Call original end immediately so the user gets their response
            (res as any).end(chunk, encoding);
            
            // Log after response is sent asynchronously
            const duration = Date.now() - startTime;
            
            // Background logging task
            (async () => {
                try {
                    // Get Context from Trace or Request (SAE Standardization)
                    const { TraceManager } = require('../lib/trace');
                    const traceContext = TraceManager.getContext();
                    
                    const authReq = req as AuthRequest;
                    const user = traceContext?.userId ? { id: traceContext.userId } : (authReq.user || res.locals.user || (req as any).user);
                    const currentApp = traceContext?.appId ? { id: traceContext.appId } : (authReq.currentApp || (req as any).currentApp);

                    const currentAppId = currentApp?.id;
                    const userId = user?.id;

                    // Skip logging for paths that shouldn't be tracked for usage
                    const ignoredPaths = ['/health', '/favicon.ico', '/debug/user', '/api/debug'];
                    if (ignoredPaths.some(p => req.path.startsWith(p))) return;

                    // Determine status based on status code
                    const status = res.statusCode >= 200 && res.statusCode < 300 ? 'success' : 'failed';
                    
                    // Determine service and action
                    const service = (req as any).service || res.locals.service;
                    
                    // Log if we have identifying context
                    if (userId || currentAppId) {
                        const isVisit = req.method === 'GET';
                        const actionSlug = service?.slug || req.path.replace(/^\/api\//, '').replace(/\//g, '_');
                        
                        const resourceType = (req as any).resourceType || (isVisit ? 'dashboard_visit' : 'api_call');
                        const actionName = (req as any).action || (isVisit ? `visit_${actionSlug}` : actionSlug);

                        const config = (service as any)?.config || {};
                        
                        // [FIX] Support both legacy flat array and new object array format
                        // New format: paths: [{path: '/convert', billable: true}]
                        // Legacy format: billablePaths: ['/convert']
                        const pathsConfig = config.paths || [];
                        const billablePaths = config.billablePaths || pathsConfig
                            .filter((p: any) => p.billable !== false)
                            .map((p: any) => p.path);
                        
                        const isBillableAction = !isVisit && billablePaths.some((path: string) => req.path.includes(path));
                        
                        let cost = (isBillableAction && status === 'success' && service) ? (service as any).pricePerRequest : 0;
                        
                        // Check for plan allowance
                        if (cost > 0 && user) {
                            const plan = (user as any).subscription?.plan;
                            const featureKey = (service as any).requiredFeatureKey;
                            
                            if (featureKey && plan) {
                                const hasFeature = plan.planFeatures?.some((pf: any) => pf.feature.key === featureKey && pf.isEnabled);
                                if (hasFeature) cost = 0; // Covered by plan
                            }
                        }

                        await logRepository.createUsageLog({
                            userId: userId,
                            appId: currentAppId,
                            serviceId: service?.id,
                            action: actionName,
                            resourceType: resourceType,
                            status: status,
                            statusCode: res.statusCode,
                            duration,
                            cost: cost,
                            ipAddress: req.ip || 'unknown',
                            userAgent: req.headers['user-agent'] || 'unknown',
                            metadata: JSON.stringify({
                                method: req.method,
                                path: req.path,
                                billable: isBillableAction,
                                traceId: res.locals.traceId || (req as any).traceId,
                                accessDenied: res.locals.accessDenied,
                                accessReason: res.locals.accessReason
                            })
                        });
                    }
                } catch (innerError) {
                    console.error('[SAE Audit] Background Logging Error:', innerError);
                }
            })();

        } catch (err) {
            console.error('[SAE Audit] Middleware Crash:', err);
            // Ensure we don't block the actual response
            try {
                if ((res as any).end === originalEnd) {
                    originalEnd.call(res, chunk, encoding);
                }
            } catch (e) {}
        }
    };
    
    next();
};
