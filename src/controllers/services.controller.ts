import { Request, Response } from 'express';
import { AppService } from '../services/app.service';
import { UsageService } from '../services/usage.service';
import { aiService } from '../services/ai.service';
import { quotaService } from '../services/quota.service';
import { serviceRegistry } from '../services/service-registry.service';
import { toolOrchestrator } from '../services/tools/tool.orchestrator';
import prisma from '../lib/prisma';
import { createQueue, QUEUES } from '../lib/queue';
import { getRedisClient } from '../lib/redis';
import { sanitizeConfigForFrontend } from '../utils/config-sanitizer';
import { BaseServiceController } from './base.service.controller';

const appService = new AppService();
const usageService = new UsageService();

export class ServicesController extends BaseServiceController {
    static async index(req: Request, res: Response) {
        const userId = req.session.userId!;

        try {
            const { user: appUser, services } = await appService.getDashboardData(userId);
            const plans = await prisma.plan.findMany({ 
                orderBy: { price: 'asc' } 
            });

            ServicesController.renderServiceView(res, 'services/index', {
                title: 'Services',
                path: '/services',
                services,
                plans,
                user: res.locals.user || appUser
            });
        } catch (error) {
            res.redirect('/auth/login');
        }
    }

    static async showPdfConverter(req: Request, res: Response) {
        return ServicesController.initializeToolHub(req, res, 'html-to-pdf', {
            view: 'services/html-pdf',
            // Include both legacy and orchestrator action names for log visibility
            actions: [
                'convert_pdf', 'convert_pdf_internal', 'preview_pdf_internal', 'convert_pdf_sync', 'convert_pdf_public',
                'html-to-pdf_sync', 'html-to-pdf_completed', 'html-to-pdf_failed', 'preview_generation'
            ]
        });
    }

    static async toggleAppAccess(req: Request, res: Response) {
        const userId = req.session.userId!;
        const { slug } = req.params;
        const { appId, enabled } = req.body;
        // Handle both boolean (JSON) and string (Form/Query) inputs
        const isEnabled = String(enabled) === 'true';

        try {
            const service = await appService.getServiceBySlug(slug);
            if (!service) return res.status(404).send('Service not found');

            await appService.toggleService(userId, appId, service.id, isEnabled, {
                userId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });

            // [FIX] Invalidate Session Cache to force AppResolver to hit DB next time
            if (req.currentApp && req.currentApp.id === appId) {
                 delete req.currentApp;
            }
            if (req.session.currentApp && req.session.currentApp.id === appId) {
                 delete req.session.currentApp;
            }
            
            // [CRITICAL] Force session save to persist deletion before response
            if (req.session && req.session.save) {
                await new Promise<void>((resolve, reject) => {
                    req.session.save((err) => {
                        if (err) console.error('[ServicesController] Session save error:', err);
                        resolve();
                    });
                });
            }



            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.json({ 
                    success: true, 
                    enabled: isEnabled,
                    appId: appId,
                    message: `Service ${isEnabled ? 'enabled' : 'disabled'} successfully.`
                });
            }

            res.redirect(`/services/${slug}`);
        } catch (error) {
            console.error(error);
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(500).json({ error: 'Failed to update app access' });
            }
            res.status(500).render('error', { 
                message: 'Failed to update app access',
                status: 500
            });
        }
    }

    static async show(req: Request, res: Response) {
        const { slug } = req.params;
        return ServicesController.initializeToolHub(req, res, slug);
    }

    static async showAiDocGenerator(req: Request, res: Response) {
        return ServicesController.initializeToolHub(req, res, 'ai-doc-generator', {
            view: 'services/ai-doc-generator',
            // Include both legacy and orchestrator action names for log visibility
            actions: [
                'ai_generate_html', 'analyze_ai_request', 'generate_ai_document',
                'ai-doc-generator_completed', 'ai-doc-generator_failed'
            ]
        });
    }

    /**
     * Centralized Initialization Logic for Tool Hubs
     * Handles data fetching, aggregate stats, and authorized apps.
     */
    private static async initializeToolHub(req: Request, res: Response, slug: string, options: { view?: string, actions?: string[] } = {}) {
        const userId = req.session.userId!;
        const user = res.locals.user;

        if (!userId || !user) {
            return res.redirect('/auth/login');
        }

        try {
            const service = await appService.getServiceBySlug(slug);
            if (!service) {
                return res.status(404).render('error', {
                    title: 'Service Not Found',
                    message: `The service '${slug}' could not be found.`,
                    status: 404
                });
            }

            // Pagination for History Logs
            const page = parseInt(req.query.page as string) || 1;
            const limit = 20;
            const skip = (page - 1) * limit;

            // 1. Fetch Core Data
            // [DISCOVERY] Merge Hardcoded Actions with Discovered Manifest Actions
            const manifest = serviceRegistry.getManifest(slug);
            const discoveredActions = manifest?.actions.map(a => a.key) || [];
            const targetActions = Array.from(new Set([...(options.actions || []), ...discoveredActions]));
            
            // [TRANSPARENCY LOG]
            console.log(`[ServicesController] Initializing Tool Hub: ${slug}`);
            console.log(`[ServicesController] Config Loaded:`, JSON.stringify((service as any).config, null, 2));

            
            const [logs, logCount, connectedApps, dailyUsage] = await Promise.all([
                usageService.getServiceLogs(userId, service.id, targetActions, limit, skip),
                usageService.getServiceLogCount(userId, service.id, targetActions),
                appService.getConnectedApps(userId, service.id),
                usageService.getServiceDailyUsage(userId, service.id)
            ]);

            const totalPages = Math.ceil(logCount / limit);

            // 2. Filter Enabled Apps
            const enabledApps = connectedApps.filter(item => item.isEnabled && item.app.isActive);

            // 3. Calculate Aggregate Stats (30 days)
            let totalRequests = 0;
            let totalSuccess = 0;
            let totalDuration = 0;
            let totalCost = 0;

            Object.values(dailyUsage).forEach((day: any) => {
                totalRequests += day.billableCount || 0; // Only count billable requests against global limit
                totalSuccess += day.success;
                totalDuration += day.duration;
                totalCost += day.cost ?? 0;
            });

            // Calculate Remaining Quota for this specific tool
            let remainingQuota = -1; // Default to -1 (Unlimited/Unknown)
            const featureKey = (service as any).requiredFeatureKey;
            const plan = user.subscription?.plan;

            if (plan) {
                if (featureKey === 'ai_generation') {
                    if (plan.aiQuota === -1) remainingQuota = -1;
                    else remainingQuota = Math.max(0, plan.aiQuota - (user.aiUsageCount || 0));
                } else if (featureKey === 'pdf_conversion') {
                    if (plan.pdfQuota === -1) remainingQuota = -1;
                    else remainingQuota = Math.max(0, plan.pdfQuota - (user.pdfUsageCount || 0));
                } else if (plan.requestLimit !== -1) {
                    remainingQuota = Math.max(0, plan.requestLimit - totalRequests);
                }
            }

            const stats = {
                totalRequests,
                successRate: totalRequests > 0 ? Math.round((totalSuccess / totalRequests) * 100) : 0,
                avgDuration: totalRequests > 0 ? Math.round(totalDuration / totalRequests) : 0,
                totalCost: totalCost.toFixed(4),
                remainingQuota,
                isLimited: remainingQuota !== -1
            };

const { ServiceFeature, IMPLEMENTED_SERVICES, RESTRICTED_SERVICES } = await import('../types/features.enum');
            const isImplemented = IMPLEMENTED_SERVICES.includes(service.slug as any);

            // Extract configuration
            const config = (service as any).config || {};
            const supportedDocTypes = config.supportedDocTypes || ['invoice']; // Fallback
            const maxFiles = config.maxFiles || 1;
            
            // Sanitize config for frontend (strips sensitive data like webhook URLs)
            const serviceConfig = sanitizeConfigForFrontend(config);

            // 4. Enforce Access & Quota States on Page Load
            let accessDenied = false;
            let accessReason = '';
            
            // [BLOCKER] No Enabled Apps
            if (enabledApps.length === 0) {
                accessDenied = true;
                // Distinguish between "No apps connected" vs "Apps connected but service disabled"
                accessReason = connectedApps.length === 0 ? 'app_context_required' : 'service_disabled';
            }

            // [BLOCKER] Quota Exhausted
            let limitReached = res.locals.limitReached || req.limitReached || false;
            if (stats.isLimited && stats.remainingQuota === 0) {
                limitReached = true;
            }

            const viewData = {
                title: service.name,
                path: `/services/${slug}`,
                user,
                service: {
                    ...service,
                    isImplemented,
                    isRestricted: !!(service as any).requiredFeatureKey || RESTRICTED_SERVICES.includes(service.slug as any),
                    requiredFeatureKey: (service as any).requiredFeatureKey || undefined
                },
                supportedDocTypes,
                maxFiles,
                serviceConfig, // Sanitized config for frontend consumption
                manifest, // [DISCOVERY] Inject Manifest for Frontend Introspection
                connectedApps,
                enabledApps,
                logs,
                pagination: {
                    page,
                    limit,
                    total: logCount,
                    totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                },
                dailyUsage,
                stats,
                // Pass security flags
                limitReached,
                accessDenied: res.locals.accessDenied || accessDenied,
                accessReason: res.locals.accessReason || accessReason,
                featureMissing: res.locals.featureMissing || req.featureMissing || false,
                warning: res.locals.overageWarning
            };

            // 4. Render with fallback or Coming Soon
            if (!isImplemented) {
                return res.render('services/coming-soon', viewData);
            }

            const targetView = options.view || `services/${slug}`;
            
            // USE BASE RENDERER
            ServicesController.renderServiceView(res, targetView, viewData);
            
            // Legacy callback handling is removed as base render handles it standardly.
            // If specific error handling is needed, it should be in the Base Class.

        } catch (error) {
            console.error(`Tool Init Error (${slug}):`, error);
            res.status(500).render('error', { 
                message: 'Failed to initialize tool workspace',
                error: process.env.NODE_ENV === 'development' ? error : {}
            });
        }
    }

    /**
     * Phase 1: Analyze Request & Propose Plan (Human-in-the-Loop)
     */
    static async analyzeWithAi(req: Request, res: Response) {
        const userId = req.session.userId!;
        const { prompt, context, type, documentType, tone, theme, appId, files } = req.body;
        
        // Support both 'type' and 'documentType'
        const finalDocType = documentType || type || 'General';

        try {
            console.log(`[DEBUG] analyzeWithAi Called. User: ${req.session.userId}, App: ${appId}`);
            // Validation (Common)
            if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
                return res.status(400).json({ error: 'Please provide a prompt.' });
            }
             if (!appId) {
                return res.status(400).json({ error: 'App context is lost. Please refresh.' });
            }

            // [SECURITY FIX] Verify App Ownership & Service Enablement
            const service = await prisma.service.findUnique({ where: { slug: 'ai-doc-generator' } });
            if (!service) throw new Error('Service ai-doc-generator not found');

            const appServiceLink = await prisma.appService.findUnique({
                where: {
                    appId_serviceId: {
                        appId: appId,
                        serviceId: service.id
                    }
                },
                include: { app: true }
            });

            if (!appServiceLink || appServiceLink.app.userId !== userId || !appServiceLink.isEnabled) {
                 return res.status(403).json({ error: 'Selected App is not authorized or service is disabled.' });
            }

            // Quota Check
            const user = res.locals.user;
            await quotaService.checkQuota(userId, 'ai-doc-generator');
            
            if (user.aiLimitReached) {
                return res.status(403).json({ error: 'Quota reached.', upgradeRequired: true });
            }
            // ============================================================
            // ROUTE THROUGH ORCHESTRATOR - Centralized Billing Context
            // ============================================================
            const aiServiceRecord = await prisma.service.findUnique({ where: { slug: 'ai-doc-generator' } });
            const traceContext = {
                userId,
                appId,
                serviceSlug: 'ai-doc-generator',
                serviceName: 'AI Document Generator',
                serviceId: aiServiceRecord?.id || 'unknown',
                pricePerRequest: aiServiceRecord?.pricePerRequest || 0.05,
                ipAddress: req.ip || 'unknown',
                userAgent: req.get('User-Agent') || 'unknown',
                enqueuedAt: new Date().toISOString()
            };

            // Enqueue Job for Analysis with Orchestrator Context
            const aiQueue = createQueue(QUEUES.AI_GENERATION);
            const job = await aiQueue.add('analyze_request', {
                action: 'analyze',
                userId,
                appId,
                prompt: prompt.trim(),
                documentType: finalDocType,
                traceContext, // For centralized billing
                options: { 
                    context: context?.trim(),
                    tone,
                    theme,
                    files,
                    userEmail: user.email,
                    ipAddress: req.ip || 'unknown',
                    userAgent: req.get('User-Agent') || 'unknown'
                }
            });

            return res.status(202).json({ 
                message: 'Analysis started', 
                jobId: job.id,
                status: 'pending' 
            });

        } catch (error: any) {
             console.error('❌ [AI Analysis] Error:', error);
             console.error('❌ [AI Analysis] Stack:', error.stack);
             res.status(error.statusCode || 500).json({ success: false, error: 'Analysis failed.' });
        }
    }

    /**
     * Phase 2: Draft Content (HITL)
     * Maps to N8N 'generate' action (legacy naming)
     */
    static async draftWithAi(req: Request, res: Response) {
        const userId = req.session.userId!;
        const { prompt, context, type, documentType, tone, theme, appId, files, summary, jobId, requestId } = req.body;
        
        const finalDocType = documentType || type || 'General';

        try {


            // Validate Context IDs (Critical for HITL)
            if (!jobId || !requestId) {
                return res.status(400).json({ 
                    error: 'Missing Job Context (jobId or requestId). Application state may have been lost.' 
                });
            }

            // Strict Quota Enforcement
            const user = res.locals.user;
            
            // [FIX] Enforce Quota via Redis Service (Increments Usage)
            await quotaService.checkQuota(userId, 'ai-doc-generator');

            if (user.aiLimitReached) {
                return res.status(403).json({ 
                    error: `You have reached your monthly AI Generation limit (${user.aiUsageCount}/${user.subscription?.plan?.aiQuota}). Please upgrade to a Pro plan for more.`,
                    upgradeRequired: true
                });
            }

            // Validate App Access
            if (!appId) {
                return res.status(400).json({ error: 'Please select an App to use for this request.' });
            }

            // ============================================================
            // ROUTE THROUGH ORCHESTRATOR - Centralized Billing Context
            // ============================================================
            const aiServiceRecord = await prisma.service.findUnique({ where: { slug: 'ai-doc-generator' } });
            const traceContext = {
                userId,
                appId,
                serviceSlug: 'ai-doc-generator',
                serviceName: 'AI Document Generator',
                serviceId: aiServiceRecord?.id || 'unknown',
                pricePerRequest: aiServiceRecord?.pricePerRequest || 0.05,
                ipAddress: req.ip || 'unknown',
                userAgent: req.headers['user-agent'] || 'unknown',
                enqueuedAt: new Date().toISOString()
            };

            // Enqueue Job for Drafting with Orchestrator Context
            const aiQueue = createQueue(QUEUES.AI_GENERATION);
            const job = await aiQueue.add('draft_content', {
                action: 'generate',
                userId,
                appId,
                prompt: prompt?.trim() || 'Drafting...',
                documentType: finalDocType,
                jobId, 
                requestId,
                traceContext, // For centralized billing
                options: { 
                    context: context?.trim(),
                    tone,
                    theme,
                    files,
                    summary, 
                }
            });

        } catch (error: any) {
            console.error('❌ [AI Drafting] Error:', error.message);
            res.status(error.statusCode || 500).json({
                success: false,
                error: error.message || 'Drafting failed.'
            });
        }
    }

    /**
     * Phase 3: Format HTML (Final Step)
     * Maps to N8N 'format' action
     */
    static async formatWithAi(req: Request, res: Response) {
        const userId = (req.session as any).userId;
        const { jobId, requestId, appId, documentType, options } = req.body; // Expecting simplified payload, mostly IDs

        try {
            // [DEDUPLICATION] Prevent double-submission of format requests
            // Use Redis Atomic Lock (NX) on requestId
            const redis = getRedisClient();
            if (redis && requestId) {
                const lockKey = `lock:format:${requestId}`;
                // Lock for 10 seconds to cover immediate retries
                const acquired = await redis.set(lockKey, 'processing', 'EX', 10, 'NX');
                
                if (!acquired) {
                    console.warn(`⚠️ [Dedup] Blocked duplicate format request for requestId: ${requestId}`);
                    return res.status(429).json({ 
                        success: false, 
                        error: 'Formatting is already in progress. Please wait.' 
                    });
                }
            }


            if (!jobId || !requestId) {
                return res.status(400).json({ error: 'Missing Job Context.' });
            }

            // Strict Quota Enforcement (Format)
            const user = res.locals.user;
            await quotaService.checkQuota(userId, 'ai-doc-generator');

            if (user.aiLimitReached) {
                return res.status(403).json({ 
                    error: `Limit reached.`,
                    upgradeRequired: true
                });
            }
            if (!appId) {
                return res.status(400).json({ error: 'App context is lost. Please refresh.' });
            }

            // [SECURITY FIX] Verify App Ownership & Service Enablement
            const service = await prisma.service.findUnique({ where: { slug: 'ai-doc-generator' } });
            if (!service) throw new Error('Service ai-doc-generator not found');

            const appServiceLink = await prisma.appService.findUnique({
                where: {
                    appId_serviceId: {
                        appId: appId,
                        serviceId: service.id
                    }
                },
                include: { app: true }
            });

            if (!appServiceLink || appServiceLink.app.userId !== userId || !appServiceLink.isEnabled) {
                 return res.status(403).json({ error: 'Selected App is not authorized or service is disabled.' });
            }

            // ============================================================
            // ROUTE THROUGH ORCHESTRATOR - Centralized Billing Context
            // ============================================================
            const traceContext = {
                userId,
                appId,
                serviceSlug: 'ai-doc-generator',
                serviceName: 'AI Document Generator',
                serviceId: service.id,
                pricePerRequest: service.pricePerRequest || 0.05,
                ipAddress: req.ip || 'unknown',
                userAgent: req.headers['user-agent'] || 'unknown',
                enqueuedAt: new Date().toISOString()
            };

            // Enqueue Job for Formatting with Orchestrator Context
            const aiQueue = createQueue(QUEUES.AI_GENERATION);
            const job = await aiQueue.add('format_document', {
                action: 'format',
                userId,
                appId,
                jobId,
                requestId,
                prompt: 'Formatting...',
                documentType: documentType || 'General',
                traceContext, // For centralized billing
                options: {
                    ...(options || {}),
                    jobId,
                    requestId,
                    userEmail: res.locals.user?.email,
                    ipAddress: req.ip || 'unknown'
                }
            });

            return res.status(202).json({
                success: true,
                message: 'Formatting started.',
                status: 'pending',
                jobId: job.id
            });

        } catch (error: any) {
            console.error('❌ [AI Formatting] Error:', error.message);
            res.status(error.statusCode || 500).json({
                success: false,
                error: error.message || 'Formatting failed.'
            });
        }
    }

    /**
     * Get Job Status (Polling) - Checks both AI and PDF queues
     */
    static async getJobStatus(req: Request, res: Response) {
        const jobId = req.params.jobId;
        console.log(`📋 [getJobStatus] Checking job: ${jobId}`);
        
        try {
            // Try AI queue first
            const aiQueue = createQueue(QUEUES.AI_GENERATION);
            let job = await aiQueue.getJob(jobId);
            let queueType = 'ai';
            
            // If not found in AI queue, check PDF queue
            if (!job) {
                const pdfQueue = createQueue(QUEUES.PDF_GENERATION);
                job = await pdfQueue.getJob(jobId);
                queueType = 'pdf';
            }
            
            if (!job) {
                console.log(`❌ [getJobStatus] Job ${jobId} not found in any queue`);
                return res.status(404).json({ error: 'Job not found' });
            }

            const state = await job.getState();
            console.log(`📋 [getJobStatus] Job ${jobId} state: ${state}, queue: ${queueType}`);
            
            if (state === 'completed') {
                const returnValue = job.returnvalue;
                console.log(`📋 [getJobStatus] Job ${jobId} completed. ReturnValue keys:`, Object.keys(returnValue || {}));
                
                // Check if this is a PDF result (has base64 data and contentType)
                if (returnValue?.data && returnValue?.contentType === 'application/pdf') {
                    console.log(`📄 [getJobStatus] Returning PDF binary for job ${jobId}`);
                    const pdfBuffer = Buffer.from(returnValue.data, 'base64');
                    
                    res.set({
                        'Content-Type': 'application/pdf',
                        'Content-Length': pdfBuffer.length.toString(),
                        'Content-Disposition': `attachment; filename="document_${jobId}.pdf"`
                    });
                    return res.send(pdfBuffer);
                }
                
                // Otherwise return as JSON (AI results, etc)
                const result = returnValue?.data ?? returnValue ?? {};
                
                return res.json({
                    status: 'completed',
                    result
                });
            } else if (state === 'failed') {
                const reason = job.failedReason || 'Job Failed';
                console.error(`❌ [Job Poll] Job ${jobId} Failed: ${reason}`);
                // Return 200 with failed status so frontend polling can handle it
                return res.status(200).json({ 
                    status: 'failed', 
                    error: reason 
                });
            }

            // pending, active, waiting
            console.log(`⏳ [getJobStatus] Job ${jobId} still ${state}`);
            return res.json({ status: state });

        } catch (error) {
            console.error('Job check failed:', error);
            return res.status(500).json({ error: 'Failed to check job status' });
        }
    }

    /**
     * Capture a lead from the coming soon page
     */
    static async captureLead(req: Request, res: Response) {
        const { email, serviceSlug, interest } = req.body;
        try {
            if (!email || !email.includes('@')) {
                return res.status(400).json({ error: 'Valid email is required' });
            }

            // Create lead
            await prisma.lead.create({
                data: {
                    email: email.trim().toLowerCase(),
                    source: `coming-soon-${serviceSlug || 'unknown'}`,
                    interest: interest || `Beta Access: ${serviceSlug || 'General'}`
                }
            });

            res.status(200).json({ 
                success: true, 
                message: 'Joined waitlist successfully!' 
            });
        } catch (error) {
            console.error('Lead Capture Error:', error);
            res.status(500).json({ error: 'Failed to join waitlist.' });
        }
    }
        /**
     * Dynamic Service Action Handler
     * Dispatches requests to registered providers based on Service Manifest
     */
    static async handleDynamicAction(req: Request, res: Response) {
        const { slug, action } = req.params;
        const user = res.locals.user;
        
        console.log(`🔍 [ServicesController] Dynamic Action Request: ${slug}/${action} (User: ${user?.id || 'Unknown'})`);

        try {
            // 1. Resolve Provider
            const provider = serviceRegistry.getProvider(slug);
            if (!provider) {
                console.warn(`⚠️ [ServicesController] No provider found for slug: ${slug}`);
                return res.status(404).json({ error: `Service provider '${slug}' not available` });
            }

            // 2. Resolve Manifest & Action Definition
            const manifest = serviceRegistry.getManifest(slug);
            const actionDef = manifest?.actions.find(a => a.key === action);
            
            if (!actionDef) {
                 console.warn(`⚠️ [ServicesController] Action '${action}' not found in manifest for ${slug}. Manifest Slug: ${manifest?.slug}`);
                 return res.status(404).json({ error: `Action '${action}' not supported by ${slug}` });
            }



            // 3. Permission Check (Feature Match)
            if (actionDef.requiredFeature) {
                const { ServiceFeature } = await import('../types/features.enum');
                // Check if user's plan supports this feature logic would go here
                // For now, we enforce via 'isRestricted' flag or specific service logic
                if (actionDef.requiredFeature === ServiceFeature.AI_DOC_GENERATOR && user.aiLimitReached) {
                     return res.status(403).json({ error: 'AI Quota Exceeded' });
                }
            }

            // 4. Execution
            if (typeof provider.executeAction !== 'function') {
                throw new Error(`Provider for ${slug} does not implement executeAction`);
            }

            const result = await provider.executeAction(action, req.body, user);

            // 5. Response
            return res.status(200).json(result);

        } catch (error: any) {
             console.error(`❌ [Dynamic Router] Error executing ${slug}:${action}`, error);
             res.status(error.statusCode || 500).json({ 
                 success: false, 
                 error: error.message || 'Action failed' 
             });
        }
    }
}
