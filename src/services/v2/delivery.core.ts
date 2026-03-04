import { workflowService } from '../workflow.service';
import { DeliveryRequest } from './types';
import { logger } from '../../lib/logger';
import prisma from '../../lib/prisma';
import { getRedisClient } from '../../lib/redis';
import { randomUUID } from 'crypto';

/**
 * Service Configuration
 */
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 100;

interface DispatchResult {
    success: boolean;
    traceId: string;
    attemptCount: number;
    results?: any;
    error?: string;
}

/**
 * Delivery Service (V2) - Enterprise Edition
 * 
 * The Abstraction Layer for "Sending Things" with High Reliability.
 * 
 * Capabilities:
 * - **Reliable Dispatch**: Exponential Backoff & Jitter for retries.
 * - **Rate Limiting**: Protects downstream providers (n8n) from flooding.
 * - **Traceability**: Generates unique TraceIDs for every delivery attempt.
 * - **Provider Fallback**: (Future) Can switch email providers on failure.
 * 
 * @version 2.1.0
 */
export class DeliveryService {
    
    /**
     * Dispatch a payload to the external world.
     * 
     * This method is the single "Exit Gate" for the V2 API.
     * It ensures compliance with rate limits and guarantees delivery effort.
     * 
     * @param request - Configuration options for the delivery.
     * @returns {Promise<DispatchResult>} status of the operation.
     */
    async dispatch(request: DeliveryRequest): Promise<DispatchResult> {
        const traceId = randomUUID();
        const { payload, userId, eventType } = request;
        
        logger.info({ traceId, userId, eventType }, '🚚 [DeliveryService] DispatchRequest Received');

        // 1. Check Rate Limits
        // We enforce limits per User per Minute to prevent abuse.
        const canProceed = await this._checkRateLimit(userId);
        if (!canProceed) {
            logger.warn({ traceId, userId }, '⛔ [DeliveryService] Rate Limit Exceeded');
            throw new Error('Rate Limit Exceeded. Please try again later.');
        }

        // 2. Prepare Execution Logic
        // We wrap the actual call in a closure to pass to the Retry Engine.
        const executeOp = async () => {
            return await this._executeDispatchLogic(request, traceId);
        };

        // 3. Execute with Retries
        // This handles transient network failures (e.g. n8n timeout).
        try {
            const result = await this._executeWithRetry(executeOp, traceId);
            
            logger.info({ 
                traceId, 
                success: true, 
                attempts: result.attempts,
                workflowResults: result.data
            }, '✅ [DeliveryService] Dispatch Successful');
            
            return {
                success: true,
                traceId,
                attemptCount: result.attempts,
                results: result.data
            };

        } catch (finalError: any) {
            logger.error({ traceId, error: finalError.message }, '❌ [DeliveryService] Dispatch Failed after Retries');
            
            // 4. Dead Letter / Failure Handling
            // In a real worker, we would NACK. Here in API, we throw or return failure.
            // We'll log to a hypothetical DLQ table or just return error.
            return {
                success: false,
                traceId,
                attemptCount: MAX_RETRIES,
                error: finalError.message
            };
        }
    }

    // ------------------------------------------------------------------------
    // INTERNAL LOGIC (Protected)
    // ------------------------------------------------------------------------

    /**
     * The core logic that talks to the Workflow Engine.
     * This is what gets retried.
     */
    private async _executeDispatchLogic(request: DeliveryRequest, traceId: string) {
        const { workflowId, userId, eventType, payload } = request;

        // A. Direct Workflow Execution
        if (workflowId) {
             const user = await prisma.user.findUnique({ where: { id: userId }, select: { businessId: true } });
             if (!user?.businessId) throw new Error('User has no business context');

             const wf = await prisma.workflow.findFirst({ where: { id: workflowId, businessId: user.businessId } });
             if (!wf) throw new Error(`Workflow ${workflowId} not found`);

             logger.debug({ traceId, workflowId }, '   Job: Executing Named Workflow');
             return await workflowService.executeAction(wf.id, wf.actionConfig, payload, userId, user.businessId);
        }

        // B. Event Broadcast
        logger.debug({ traceId, eventType }, '   Job: Broadcasting Event');
        
        const syntheticPayload: Record<string, unknown> = {
            ...payload,
            type: eventType || (payload as any).type || 'unknown_event',
            source: 'v2_api',
            _meta: { traceId, timestamp: new Date().toISOString() }
        };

        const results = await workflowService.processWebhook(userId, syntheticPayload);
        
        return {
            dispatched: true,
            workflowCount: results.length,
            results
        };
    }

    /**
     * Retry Engine with Exponential Backoff + Jitter.
     */
    private async _executeWithRetry<T>(operation: () => Promise<T>, traceId: string): Promise<{ data: T, attempts: number }> {
        let lastError: any;
        
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                if (attempt > 1) logger.info({ traceId, attempt }, '   🔄 Pre-Retry: Attempting...');
                
                const data = await operation();
                return { data, attempts: attempt };
            } catch (error: any) {
                lastError = error;
                logger.warn({ traceId, attempt, error: error.message }, '   ⚠️ Transient Failure');

                // If last attempt, don't wait, just fail
                if (attempt === MAX_RETRIES) break;

                // Calculate Delay: Base * 2^(attempt-1) + Jitter
                const backoff = BASE_DELAY_MS * Math.pow(2, attempt - 1);
                const jitter = Math.random() * 100;
                const totalDelay = backoff + jitter;

                await new Promise(resolve => setTimeout(resolve, totalDelay));
            }
        }

        throw lastError;
    }

    /**
     * Rate Limiter (Token Bucket / Counter Window) via Redis.
     */
    private async _checkRateLimit(userId: string): Promise<boolean> {
        const redis = getRedisClient();
        if (!redis) return true; // Fail open if Redis is down

        const key = `ratelimit:v2:${userId}`;
        
        try {
            // Atomic Increment
            const current = await redis.incr(key);
            
            // Set Expiry on first write
            if (current === 1) {
                await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
            }

            if (current > RATE_LIMIT_MAX_REQUESTS) {
                return false;
            }
            return true;
        } catch (e) {
            logger.error({ error: e }, 'Rate Limit Check Failed');
            return true; // Fail open to avoid blocking users due to infra issues
        }
    }
}

export const deliveryService = new DeliveryService();
