import { Job } from 'bullmq';
import { pdfService } from '../services/pdf.service';
import { toolOrchestrator } from '../services/tools/tool.orchestrator';
import { AsyncToolContext } from '../services/tools/tool.interface';

/**
 * PDF Generation Worker Processor
 * Handles jobs from the 'pdf-generation' queue.
 * 
 * CRITICAL: All job completions MUST call toolOrchestrator.onJobComplete()
 * for centralized billing and usage logging.
 */
export const pdfProcessor = async (job: Job) => {
    console.group(`📄 [PDF Worker] Job ${job.id} START`);
    console.log('⏰ Timestamp:', new Date().toISOString());

    const startTime = Date.now();
    
    // Extract trace context from job data (set by orchestrator)
    const { payload, traceContext } = job.data as { 
        payload: any; 
        traceContext: AsyncToolContext 
    };

    console.log('👤 User ID:', traceContext?.userId);
    console.log('📱 App ID:', traceContext?.appId);
    console.log('📦 Service:', traceContext?.serviceSlug);
    console.log('📄 Payload Type:', payload?.type);

    try {
        let pdfBuffer: Buffer;

        // Generate PDF using the service
        if (payload.type === 'url') {
            console.log('🔀 [Worker] Generating PDF from URL');
            pdfBuffer = await pdfService.generatePdfFromUrl(payload.content, payload.options);
        } else {
            console.log('🔀 [Worker] Generating PDF from HTML');
            pdfBuffer = await pdfService.generatePdfFromHtml(payload.content, payload.options);
        }

        console.log('✅ [Worker] PDF generated. Buffer size:', pdfBuffer.length);

        // ============================================================
        // CALL ORCHESTRATOR - Centralized Billing
        // ============================================================
        if (traceContext) {
            await toolOrchestrator.onJobComplete(
                traceContext,
                true,
                Date.now() - startTime,
                { pdfSize: pdfBuffer.length }
            );
            console.log('✅ [Worker] Billing logged via Orchestrator');
        }

        // Optional: Send email if userEmail was provided
        if (traceContext?.userId) {
            try {
                const { UserService } = await import('../services/user.service');
                const userService = new UserService();
                const user = await userService.getProfile(traceContext.userId);
                
                if (user?.email) {
                    const { emailService } = await import('../services/email.service');
                    await emailService.sendPdf(user.email, pdfBuffer, 'document.pdf');
                    console.log(`📧 [Worker] Email sent to ${user.email}`);
                }
            } catch (emailError) {
                console.warn('⚠️ [Worker] Email send failed:', emailError);
            }
        }

        console.log('✅ [PDF Worker] Job', job.id, 'COMPLETE');
        console.groupEnd();
        
        return {
            success: true,
            data: pdfBuffer.toString('base64'),
            contentType: 'application/pdf'
        };

    } catch (error: any) {
        console.error(`❌ [PDF Worker] Job ${job.id} FAILED:`, error.message);

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
            console.log('⚠️ [Worker] Failure logged via Orchestrator (50% cost)');
        }

        console.groupEnd();
        throw error; // Rethrow to let BullMQ handle retries
    }
};
