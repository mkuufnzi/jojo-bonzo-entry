import { Request, Response, NextFunction } from 'express';
import { pdfService } from '../services/pdf.service';
import { toolOrchestrator } from '../services/tools/tool.orchestrator';
import { BaseServiceController } from './base.service.controller';

/**
 * PdfController
 * All billable PDF operations route through ToolOrchestrator for centralized logging.
 */
export class PdfController extends BaseServiceController {

    /**
     * Submit a PDF generation job (Authenticated - Dashboard Tool)
     * Routes through ToolOrchestrator for centralized billing.
     */
    static async convertSession(req: Request, res: Response, next: NextFunction) {
        console.log('🚀 [PDF Controller] convertSession - REQUEST RECEIVED (via Orchestrator)');
        
        const userId = (req.session as any).userId;

        if (!userId) {
            console.error('❌ [PDF Controller] No userId in session');
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const { url, html, appId, options } = req.body;
        
        // Audit Log
        console.group(`📄 [PDF Controller] Request ${new Date().toISOString()}`);
        console.log('User ID:', userId);
        console.log('App ID:', appId);
        console.log('Input Type:', url ? 'URL' : (html ? 'HTML' : 'File'));
        console.log('HTML Length:', html?.length || 0);
        console.groupEnd();

        if (!url && !html && !req.file) {
            console.error('❌ [PDF Controller] Missing content');
            return res.status(400).json({ 
                error: 'Missing content. Please provide either a "url", "html" string, or a "file".' 
            });
        }
        
        if (!appId) {
            console.error('❌ [PDF Controller] Missing appId');
            return res.status(400).json({ error: 'App context is required.' });
        }

        try {
            // ============================================================
            // ROUTE THROUGH ORCHESTRATOR - Centralized Billing
            // ============================================================
            const { jobId, service } = await toolOrchestrator.submitAsyncJob(
                'html-to-pdf',
                {
                    type: url ? 'url' : 'html',
                    content: url || html,
                    options
                },
                {
                    userId,
                    appId,
                    ipAddress: req.ip || 'unknown',
                    userAgent: req.headers['user-agent']
                }
            );

            console.log(`✅ [PDF Controller] Job enqueued via Orchestrator. Job ID: ${jobId}`);
            
            res.status(202).json({
                status: 'pending',
                jobId,
                service: service.name,
                message: 'PDF generation started. Poll /api/jobs/:id for result.'
            });
        } catch (error: any) {
            console.error('❌ [PDF Controller] PDF Conversion Error:', error);
            PdfController.sendError(res, error);
        }
    }

    /**
     * Submit a Public PDF generation job (API Key Auth)
     * Routes through ToolOrchestrator for centralized billing.
     */
    static async convert(req: Request, res: Response, next: NextFunction) {
        const { url, html, options } = req.body;
        
        if (!url && !html && !req.file) {
            return res.status(400).json({ 
                error: 'Missing content. Please provide either a "url", "html" string, or a "file".' 
            });
        }

        try {
            const app = (req as any).currentApp;
            const user = (req as any).user || res.locals.user;

            if (!app || !user) {
                return res.status(401).json({ error: 'API Key authentication required.' });
            }

            // ============================================================
            // ROUTE THROUGH ORCHESTRATOR - Centralized Billing
            // ============================================================
            const { jobId, service } = await toolOrchestrator.submitAsyncJob(
                'html-to-pdf',
                {
                    type: url ? 'url' : 'html',
                    content: url || html,
                    options
                },
                {
                    userId: user.id,
                    appId: app.id,
                    ipAddress: req.ip || 'unknown',
                    userAgent: req.headers['user-agent']
                }
            );

            res.status(202).json({
                status: 'pending',
                jobId,
                service: service.name,
                message: 'PDF generation started. Poll /api/jobs/:id for result.'
            });
        } catch (error: any) {
            console.error('Public PDF Conversion Error:', error);
            PdfController.sendError(res, error);
        }
    }

    /**
     * Get Job Status & Result
     * Uses Orchestrator's getJobStatus for consistency.
     */
    static async getJobStatus(req: Request, res: Response, next: NextFunction) {
        const jobId = req.params.id;

        try {
            const result = await toolOrchestrator.getJobStatus('html-to-pdf', jobId);

            if (result.status === 'not_found') {
                return res.status(404).json({ error: 'Job not found' });
            }

            if (result.status === 'completed' && result.result?.data) {
                const pdfBuffer = Buffer.from(result.result.data, 'base64');

                res.set({
                    'Content-Type': 'application/pdf',
                    'Content-Length': pdfBuffer.length.toString(),
                    'Content-Disposition': 'attachment; filename="document.pdf"'
                });
                return res.send(pdfBuffer);
            } else if (result.status === 'failed') {
                return res.status(400).json({ status: 'failed', error: result.error });
            }

            // Pending/Active/Waiting
            res.json({ status: result.status });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Generate Preview Screenshot (Billable)
     * Routes through Orchestrator for centralized billing.
     */
    static async previewSession(req: Request, res: Response, next: NextFunction) {
        const { url, html, format, appId, fullPage, removeSelectors } = req.body;
        const userId = (req.session as any).userId;
        const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
        const userAgent = req.headers['user-agent'];

        console.log(`[Preview] Requested. URL: ${!!url}, HTML Length: ${html?.length}, Format: ${format}`);

        if (!url && !html) {
            return res.status(400).json({ error: 'Missing url or html' });
        }

        try {
            // Generate screenshot directly (sync operation)
            const screenshotBuffer = await pdfService.generateScreenshot({
                type: url ? 'url' : 'html',
                content: url || html
            }, { 
                format, 
                fullPage: fullPage === true || fullPage === 'true', 
                removeSelectors 
            });

            // ============================================================
            // LOG VIA ORCHESTRATOR - Centralized Billing for Preview
            // ============================================================
            // For sync operations, use executeTool with a special preview action
            // Or log directly - preview is a quick sync call
            await pdfService.logPreviewUsage(userId, appId, 'html-to-pdf', ipAddress, userAgent);

            res.set({
                'Content-Type': 'image/jpeg',
                'Content-Length': screenshotBuffer.length.toString()
            });
            res.send(screenshotBuffer);
        } catch (error: any) {
            console.error('Preview error:', error);
            res.status(500).json({ error: 'Failed to generate preview', details: error.message });
        }
    }
}
