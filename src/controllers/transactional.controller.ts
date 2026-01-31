import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { serviceRegistry } from '../services/service-registry.service';
import { getRedisClient } from '../lib/redis';
import { logger } from '../lib/logger';

export class TransactionalController {
    /**
     * Generate Branded Document [POST /api/v1/transactional/generate/:type]
     * 
     * Enterprise Features:
     * - Idempotency (via Redis & Headers)
     * - Strict Validation
     * - Centralized Error Handling
     */
    static async generateDocument(req: Request, res: Response) {
        const authReq = req as AuthRequest;
        const { type } = req.params;
        const payload = req.body;
        const idempotencyKey = req.header('Idempotency-Key');

        try {
            // 1. [Security] Validate Context
            if (!authReq.currentApp) {
               return res.status(401).json({ error: 'Valid API Key required in Authorization header' });
            }

            // 2. [Enterprise] Idempotency Check
            if (idempotencyKey) {
                const redis = getRedisClient();
                const cacheKey = `idempotency:${authReq.currentApp.id}:${idempotencyKey}`;
                
                if (redis) {
                    const cachedResponse = await redis.get(cacheKey);
                    if (cachedResponse) {
                        logger.info(`🔄 [Transactional] Idempotency Hit: ${idempotencyKey}`);
                        // Return cached PDF metadata or status
                        // For MVP: Return 409 Conflict if processing, or 200 if done (would need to store result)
                        // For now, we'll return a 409 to say "We saw this already"
                        return res.status(409).json({ 
                            error: 'Idempotency Conflict', 
                            message: 'This request was already processed.',
                            original_request_id: idempotencyKey 
                        });
                    }

                    // Lock for 5 minutes
                    await redis.set(cacheKey, 'processing', 'EX', 300);
                }
            }

            // 3. Delegate to Design Engine
            // We use the 'transactional-core' slug which maps to Design Engine
            const provider = serviceRegistry.getProvider('transactional-core');

            if (!provider) {
                return res.status(503).json({ error: 'Generation service unavailable' });
            }

            // 4. [Execution] Execute 'generate' action
            const result = await provider.executeAction('generate', {
                type,
                ...payload
            }, {
                id: authReq.user?.id, 
                email: authReq.user?.email || 'api-user@floovioo.com',
                name: authReq.user?.name || 'API User',
                appId: authReq.currentApp?.id, // [New] Pass App ID for Service Tenant Lookup
                requestId: idempotencyKey || `req_${Date.now()}` // Pass ID key as Request ID
            });

            // 5. [Response] Handle PDF Stream
            if (result.type === 'pdf' || (result.contentType === 'application/pdf')) {
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="${type}_${Date.now()}.pdf"`);
                if (result.filename) {
                     res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
                }
                
                // If data is buffer/base64
                if (Buffer.isBuffer(result.data)) return res.send(result.data);
                if (typeof result.data === 'string') return res.send(Buffer.from(result.data, 'base64'));
            }

            return res.json(result);

        } catch (error: any) {
             // [Enterprise] Rollback Idempotency on Error
             if (idempotencyKey) {
                 const redis = getRedisClient();
                 if (redis) await redis.del(`idempotency:${authReq.currentApp?.id}:${idempotencyKey}`);
             }

            logger.error({ err: error }, '❌ [Transactional] Generation Fail');
            return res.status(500).json({ 
                success: false, 
                error: error.message || 'Transactional generation failed' 
            });
        }
    }
}
