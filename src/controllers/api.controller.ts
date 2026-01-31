import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../lib/prisma';
import { UsageService } from '../services/usage.service';

export class ApiController {
    /**
     * Get Current User/App Usage and Quotas
     */
    static async getUsage(req: Request, res: Response) {
        const user = res.locals.user;
        if (!user) return res.status(401).json({ error: 'User context not found' });

        const subscription = user.subscription;
        if (!subscription || !subscription.plan) {
            return res.status(403).json({ error: 'No active subscription found' });
        }

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Fetch precise usage counts using centralized UsageService
        const usageService = new UsageService();
        const aiUsageCount = await usageService.getFeatureUsage(user.id, 'ai_generation', startOfMonth);
        const pdfUsageCount = await usageService.getFeatureUsage(user.id, 'pdf_conversion', startOfMonth);

        const totalUsageCount = await prisma.usageLog.count({
            where: {
                userId: user.id,
                status: 'success',
                createdAt: { gte: startOfMonth },
                cost: { gt: 0 },
                resourceType: { not: 'dashboard_visit' }
            }
        });

        return res.json({
            success: true,
            plan: {
                name: subscription.plan.name,
                status: subscription.status
            },
            usage: {
                ai: {
                    used: aiUsageCount,
                    limit: subscription.plan.aiQuota,
                    remaining: subscription.plan.aiQuota === -1 ? -1 : Math.max(0, subscription.plan.aiQuota - aiUsageCount)
                },
                pdf: {
                    used: pdfUsageCount,
                    limit: subscription.plan.pdfQuota,
                    remaining: subscription.plan.pdfQuota === -1 ? -1 : Math.max(0, subscription.plan.pdfQuota - pdfUsageCount)
                },
                total: {
                    used: totalUsageCount,
                    limit: subscription.plan.requestLimit
                }
            },
            period: {
                start: startOfMonth,
                end: new Date(now.getFullYear(), now.getMonth() + 1, 0)
            }
        });
    }

    /**
     * List Available Services and their requirements
     */
    static async getServices(req: Request, res: Response) {
        try {
            const redis = require('../lib/redis').getRedisClient();
            const CACHE_KEY = 'services:all';

            // Try Cache
            if (redis) {
                const cached = await redis.get(CACHE_KEY);
                if (cached) {
                    return res.json({
                        success: true,
                        services: JSON.parse(cached),
                        source: 'cache'
                    });
                }
            }

            const services = await prisma.service.findMany({
                where: { isActive: true },
                orderBy: { name: 'asc' }
            });

            const processedServices = services.map(s => ({
                id: s.id,
                name: s.name,
                slug: s.slug,
                description: s.description,
                type: (s as any).requiredFeatureKey ? 'Pro' : 'Free',
                pricing: {
                    perRequest: s.pricePerRequest || 0
                }
            }));

            // Set Cache
            if (redis) {
                await redis.set(CACHE_KEY, JSON.stringify(processedServices), 'EX', 3600);
            }

            return res.json({
                success: true,
                services: processedServices,
                source: 'db'
            });
        } catch (error) {
            console.error('getServices Error:', error);
            return res.status(500).json({ error: 'Failed to fetch services' });
        }
    }

    /**
     * Generate Branded Document [POST /generate/:type]
     */
    static async generateDocument(req: Request, res: Response) {
        const authReq = req as AuthRequest;
        const { type } = req.params;
        const payload = req.body;

        try {
            // 1. Validate Context
            if (!authReq.currentApp) {
               return res.status(401).json({ error: 'Valid API Key required in Authorization header' });
            }

            // 2. Delegate to Design Engine (via Service Registry pattern)
            // We use the 'transactional-core' slug which maps to Design Engine
            const { serviceRegistry } = require('../services/service-registry.service');
            const provider = serviceRegistry.getProvider('transactional-core');

            if (!provider) {
                return res.status(503).json({ error: 'Generation service unavailable' });
            }

            // 3. Execute 'generate' action
            const result = await provider.executeAction('generate', {
                type,
                ...payload
            }, {
                id: authReq.user?.id, // User ID linked to the App
                email: 'api-user@floovioo.com',  // Placeholder or fetch real user if needed
                name: 'API User'
            });

            // 4. Handle PDF Response
            if (result.type === 'pdf' || (result.contentType === 'application/pdf')) {
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="${type}_Error_See_Logs.pdf"`); // Placeholder filename
                if (result.filename) {
                     res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
                }
                
                // If data is buffer/base64
                if (Buffer.isBuffer(result.data)) return res.send(result.data);
                if (typeof result.data === 'string') return res.send(Buffer.from(result.data, 'base64'));
            }

            return res.json(result);

        } catch (error: any) {
            console.error('❌ [API Generate] Error:', error.message);
            return res.status(500).json({ 
                success: false, 
                error: error.message || 'Details omitted for security.' 
            });
        }
    }

    /**
     * Get Current Profile (User or App context)
     */
    static async getMe(req: Request, res: Response) {
        const authReq = req as AuthRequest;
        const user = res.locals.user;

        return res.json({
            success: true,
            context: authReq.currentApp ? 'app' : 'user',
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            },
            ...(authReq.currentApp && {
                app: {
                    id: authReq.currentApp.id,
                    name: authReq.currentApp.name,
                    enabledServices: authReq.currentApp.services
                }
            })
        });
    }
}
