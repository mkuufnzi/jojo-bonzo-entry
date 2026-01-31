import { Job } from 'bullmq';
import { aiService } from '../services/ai.service';
import { AppError } from '../lib/AppError';
import { toolOrchestrator } from '../services/tools/tool.orchestrator';
import { AsyncToolContext } from '../services/tools/tool.interface';

export interface AiJobData {
    action: 'analyze' | 'generate' | 'format';
    userId: string;
    appId: string;
    prompt: string;
    documentType: string;
    jobId?: string; // HITL Context
    requestId?: string; // HITL Context
    traceContext?: AsyncToolContext; // Orchestrator billing context
    options: {
        context?: string;
        tone?: string;
        theme?: string;
        files?: any[];
        userEmail?: string;
        ipAddress: string;
        userAgent?: string;
        summary?: string;
        jobId?: string;
        requestId?: string;
    };
}

/**
 * AI Generation Processor
 * Handles background AI generation tasks (n8n webhooks).
 * 
 * CRITICAL: All job completions MUST call toolOrchestrator.onJobComplete()
 * for centralized billing and usage logging.
 */
export const aiProcessor = async (job: Job<AiJobData>) => {
    const startTime = Date.now();
    const { userId, appId, prompt, documentType, options, jobId, requestId, traceContext } = job.data;
    
    console.log(`[AI Worker] Processing Job ${job.id} for User ${userId}, Action: ${job.data.action}`);
    
    // Prioritize top-level IDs, fallback to options
    const contextJobId = jobId || options.jobId || job.id;
    const contextRequestId = requestId || options.requestId || contextJobId;

    try {
        console.log(`[AI Worker] Calling AI Service Action: ${job.data.action}`);
        console.log(`[AI Worker] Context - JobID: ${contextJobId}, RequestID: ${contextRequestId}`);

        const result = await aiService.generateHtmlDocument(
            prompt,
            userId,
            documentType,
            {
                ...options,
                action: job.data.action,
                appId: appId,
                jobId: String(contextJobId),
                requestId: String(contextRequestId)
            }
        );
        
        console.log(`[AI Worker] Service finished. Result keys: ${Object.keys(result).join(', ')}`);

        // ============================================================
        // CALL ORCHESTRATOR - Centralized Billing
        // ============================================================
        if (traceContext) {
            await toolOrchestrator.onJobComplete(
                traceContext,
                true,
                Date.now() - startTime,
                { action: job.data.action, documentType }
            );
            console.log('✅ [AI Worker] Billing logged via Orchestrator');
        } else {
            console.warn('⚠️ [AI Worker] No traceContext - billing may be missed');
        }

        return {
            success: true,
            data: result
        };

    } catch (error: any) {
        console.error(`[AI Worker] Job ${job.id} Failed:`, error.message);

        // ============================================================
        // CALL ORCHESTRATOR - Log failure with 50% cost
        // ============================================================
        if (traceContext) {
            await toolOrchestrator.onJobComplete(
                traceContext,
                false,
                Date.now() - startTime,
                undefined,
                error.message
            );
            console.log('⚠️ [AI Worker] Failure logged via Orchestrator (50% cost)');
        }

        if (error instanceof AppError) {
            throw error;
        }
        throw new Error(error.message || 'AI Generation Failed');
    }
};
