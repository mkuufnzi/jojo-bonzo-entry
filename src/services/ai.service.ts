import axios from 'axios';
import { ServiceManifest } from '../types/service-manifest';
import { AppError } from '../lib/AppError';
import { LogRepository } from '../repositories/log.repository';
import { ServiceRepository } from '../repositories/service.repository';
import { TraceManager } from '../lib/trace';
import { webhookService } from './webhook.service';
import { logger } from '../lib/logger';
import { ServiceSlugs } from '../types/service.types';

interface AiFile {
  name: string;
  type: string;
  size: number;
  data: string; // Base64
}

interface AiGenerationOptions {
    context?: string;
    tone?: string;
    theme?: string;
    userEmail?: string;
    files?: AiFile[];
    summary?: string; // For HITL Phase 2
    action?: string; // 'analyze_request' or 'generate_html'
    ipAddress?: string;
    userAgent?: string;
    appId?: string; // Added for attribution
    jobId?: string; // HITL Context
    requestId?: string; // HITL Context
}

interface AiGenerationRequest {
  prompt: string;
  context?: string;
  userId: string;
  userEmail?: string;
  documentType: string;
  tone?: string;
  theme?: string;
  files?: AiFile[];
  summary?: string; 
  action: string;
  appId?: string;
  jobId?: string;
  requestId?: string;
}

interface AiServiceResult {
  html: string;
  downloadLink: string | null;
  clarificationMessage?: string;
  summary?: string; // For HITL Phase 2 analysis
  // HITL Context - passed through from N8N for tracking
  jobId?: string;
  requestId?: string;
  requestAnalysis?: any;
  status?: string;
  // Phase 2 Draft Data
  draft?: any;
}

class AiService {
  private webhookSecret: string;
  private timeout: number;
  private logRepository: LogRepository;
  private serviceRepository: ServiceRepository;

  constructor() {
    this.logRepository = new LogRepository();
    this.serviceRepository = new ServiceRepository();
    
    this.webhookSecret = process.env.AI_WEBHOOK_SECRET || '';
    this.timeout = parseInt(process.env.AI_GENERATION_TIMEOUT || '180000', 10);
  }

  async generateHtmlDocument(
    prompt: string,
    userId: string,
    documentType: string,
    options: AiGenerationOptions = {}
  ): Promise<AiServiceResult> {
    try {
      const optionsPayload = {
        ...(options.context && { context: options.context }),
        ...(options.tone && { tone: options.tone }),
        ...(options.theme && { theme: options.theme }),
        ...(options.files && { files: options.files }),
        ...(options.summary && { summary: options.summary }),
        ...(options.appId && { appId: options.appId }),
        ...(options.jobId && { jobId: options.jobId }),
        ...(options.requestId && { requestId: options.requestId })
      };

      // Determine Action (Analyze vs Generate vs Format)
      // Map 'draft' -> 'generate' for N8N backward compatibility/workflow alignment
      // Determine Action (Analyze vs Generate vs Format)
      // [FIX] Map 'draft' -> 'generate' because 'draft' webhook is not configured in DB.
      // User instruction: "stick with /generate"
      let action = options.action || 'generate';
      
      // Dynamic Async Lookup (Service Slug: 'ai-doc-generator')
      const webhookUrl = await webhookService.getEndpoint(ServiceSlugs.AI_DOC_GENERATOR, action);

      const requestPayload: AiGenerationRequest = {
        prompt,
        userId,
        documentType,
        userEmail: options.userEmail,
        action,
        ...optionsPayload
      };
      
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.webhookSecret) {
        headers['X-Webhook-Secret'] = this.webhookSecret;
      }
      

      
      logger.info({ action, webhookUrl, payloadKeys: Object.keys(requestPayload) }, '🤖 [AI Service] Initiating generation');
      logger.debug({ payload: requestPayload }, '📦 [AI Service] Full Payload');

      // DEBUG: Trace where this URL came from
      if (webhookUrl.includes('test-generate')) {
         logger.error({ action, webhookUrl }, '🚨 [CRITICAL] AI Service is using the INVALID test-generate URL!');
      }
      
      const startTime = Date.now();
      const response = await axios.post<any>(
        webhookUrl,
        requestPayload,
        {
          headers,
          timeout: this.timeout,
          validateStatus: (status) => status < 500
        }
      );

      let responseData = response.data;
      logger.info(`🤖 [AI Service] Received response from n8n (Status: ${response.status})`);
      logger.trace({ responseData }, '📦 [AI Service] Raw Response Data');

      // Handle N8N array format
      if (Array.isArray(responseData)) {
        if (responseData.length > 0) {
          responseData = responseData[0];
          logger.debug(`🤖 AI Service: Unwrapped n8n array (keys: ${Object.keys(responseData || {}).join(', ')})`);
        } else {
            // Check if it's strictly empty or if we can handle it
          logger.error('❌ AI Service: n8n returned an empty array []');
          throw new AppError('AI service returned an empty results array', 502);
        }
      } else {
        logger.debug(`🤖 AI Service: n8n returned object (keys: ${Object.keys(responseData || {}).join(', ')})`);
      }

      const rawDataString = JSON.stringify(responseData);
      if (!responseData || rawDataString === '{}' || rawDataString === '[]') {
        logger.error({ rawDataString }, '❌ AI Service: responseData is empty/null after processing');
        throw new AppError('Empty response from AI service', 502);
      }

      // 1. Lenient Extraction
      // [FIX] Added support for 'output' wrapper (N8N v2 structure)
      let extractedHtml = responseData.html 
                          || responseData.output?.html 
                          || responseData.content 
                          || responseData.data?.html 
                          || responseData.body?.html;
      
      // 1.0 Handle 'jobLog' wrapper (New n8n workflow format)
      if (responseData.jobLog) {
          let innerData: any = null;
          
          if (typeof responseData.jobLog === 'object') {
             console.log('🔧 AI Service: Detected jobLog wrapper (Object), unwrapping...');
             innerData = responseData.jobLog;
          } else if (typeof responseData.jobLog === 'string') {
              try {
                  console.log('🔧 AI Service: Detected jobLog wrapper (String), unwrapping...');
                  innerData = JSON.parse(responseData.jobLog);
              } catch (e) {
                  console.error('❌ AI Service: Failed to parse jobLog JSON', e);
              }
          }

          if (innerData) {
               // Merge inner data into responseData so downstream checks work
               responseData = { ...responseData, ...innerData };
               
               // Re-check fields after merge
               extractedHtml = responseData.html || responseData.content || innerData.html;
          }
      }

      // 1.1 Handle double-encoded JSON (n8n sometimes returns stringified JSON)
      if (extractedHtml && typeof extractedHtml === 'string' && extractedHtml.startsWith('{')) {
        try {
          const parsed = JSON.parse(extractedHtml);
          if (parsed.html) {
            logger.debug('🔧 AI Service: Detected double-encoded JSON, extracting HTML from nested object');
            extractedHtml = parsed.html;
          }
        } catch (e) {
          // Not JSON, proceed with original value
          logger.trace('🔧 AI Service: HTML field is a string but not valid JSON, using as-is');
        }
      }
      
      const extractedLink = responseData.downloadLink || responseData.webContentLink || responseData.webViewLink || responseData.data?.downloadLink;
      
      // Check for Draft Data (Phase 2)
      // N8N returns 'json' object or data structure
      let extractedDraft = null;
      if (action === 'generate') { // 'generate' action produces draft
          // Identify draft data - it might be the whole response or a property
          // N8N's ParseGeneratedDraft node returns { json: JSON.parse(...) } set to 'generatedDraft' field in 'draftResponse' set node?
          // Actually, 'draftResponse' set node Line 2191 sets:
          // 'generatedDraft': {{ $('ParseGeneratedDraft').item.json }}
          // And we send back 'allIncomingItems'.
          // So responseData should contain 'generatedDraft'.
           extractedDraft = responseData.generatedDraft || responseData.draft || (responseData.json ? responseData.json : null);
           
           // Fallback: If no specific key found, but we have data and action is 'generate', treat the whole object as the draft
           if (!extractedDraft && responseData && Object.keys(responseData).length > 0) {
               console.log('🔧 AI Service: No specific draft key found, treating entire response as draft.');
               extractedDraft = responseData;
           }
           
           if (extractedDraft) {
               console.log('[AI Service] Extracted Draft Content');
           }
      }

      // Check for Clarification Request / Analysis Summary (Human-in-the-Loop)
      // For the Analysis phase, we expect 'clarificationMessage' or 'summary'
      let clarificationMsg: string | null = null;
      
      // 1.1 Enhanced Review Parsing (Rich HTML for Modal)
      // Check both top-level review and nested requestAnalysis.review
      const reviewData = responseData.review || responseData.requestAnalysis?.review;
      
      if (reviewData) {
          const r = reviewData;
          // Construct rich HTML using Tailwind classes consistent with the frontend
          // Construct rich HTML using Tailwind classes consistent with the frontend
          const analysis = responseData.analysis || responseData.requestAnalysis?.analysis || {};
          
          clarificationMsg = `<div class="space-y-5">
              
              <!-- 1. Execution Brief (The 'How') -->
              ${analysis.execution_brief ? `
              <div class="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100/50">
                  <p class="text-[0.6rem] font-bold text-indigo-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
                    Execution Strategy
                  </p>
                  <p class="text-sm text-slate-800 leading-relaxed font-medium">${analysis.execution_brief}</p>
              </div>` : ''}

              <!-- 2. Main Summary -->
              <div>
                  <p class="text-[0.6rem] font-bold text-slate-400 uppercase tracking-wider mb-1">Project Summary</p>
                  <p class="text-sm text-slate-600 leading-relaxed">${r.summary || 'Please review the plan.'}</p>
              </div>
              
              <!-- 3. Key Findings & Stats Grid -->
              <div class="grid grid-cols-2 gap-4">
                  ${r.what_we_have && Array.isArray(r.what_we_have) && r.what_we_have.length ? `
                  <div class="col-span-2">
                      <p class="text-[0.6rem] font-bold text-slate-400 uppercase tracking-wider mb-2">Coverage</p>
                      <div class="flex flex-wrap gap-2">
                          ${r.what_we_have.map((i: string) => `
                            <span class="inline-flex items-center px-2 py-1 rounded-md text-[0.65rem] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                ${i}
                            </span>`).join('')}
                      </div>
                  </div>` : ''}
              </div>

              <!-- 4. Suggestions -->
              ${r.suggestions && Array.isArray(r.suggestions) && r.suggestions.length ? `
                  <div class="bg-amber-50 p-3 rounded-lg border border-amber-100">
                      <p class="text-[0.6rem] font-bold text-amber-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        Optimizations Detected
                      </p>
                      <ul class="space-y-2">
                          ${r.suggestions.map((i: string) => `
                            <li class="flex items-start gap-2 text-xs text-amber-800 leading-snug">
                                <span class="mt-1 w-1 h-1 rounded-full bg-amber-400 flex-shrink-0"></span>
                                <span>${i}</span>
                            </li>`).join('')}
                      </ul>
                  </div>` : ''}

              <!-- 5. Footer Meta -->
              <div class="flex items-center gap-4 pt-2 border-t border-slate-100">
                  ${r.estimated_pages ? `
                  <div class="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                      Est. ${r.estimated_pages} Pages
                  </div>` : ''}
                  
                  ${analysis.completeness ? `
                  <div class="flex items-center gap-1.5 text-xs text-slate-400 font-medium capitalize">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                      ${analysis.completeness} Info
                  </div>` : ''}
              </div>
          </div>`;
      }

      // 1.2 Fallback to simple strings if Rich HTML not generated
      if (!clarificationMsg) {
         clarificationMsg = responseData.clarificationMessage 
                            || responseData.summary 
                            || responseData.question 
                            || responseData.data?.clarificationMessage
                            || (responseData.requestAnalysis ? 'Analysis complete' : null);
      }

      // Check if we have *something* useful to return
      if (clarificationMsg && !extractedHtml && !extractedDraft && action === 'analyze') {
          logger.info(`🤖 AI Service: Agent returned summary/clarification: "${clarificationMsg.substring(0, 50)}..."`);
          return {
              html: '', // No HTML yet
              downloadLink: null,
              clarificationMessage: clarificationMsg,
              summary: responseData.review?.summary || responseData.summary,
              // CRITICAL: Pass through N8N's job IDs for HITL flow
              jobId: responseData.jobId,
              requestId: responseData.requestId,
              requestAnalysis: responseData.requestAnalysis,
              status: responseData.status
          };
      }

      // 2. Success/Error logic
      // Success if we have HTML OR if we have a Draft in Phase 2
      const isDraftSuccess = (action === 'generate' && extractedDraft);
      
      if (!extractedHtml && !isDraftSuccess && !responseData.success) {
        const errorMsg = responseData.error || responseData.message || 'AI generation failed from provider';
        logger.error({ 
            status: response.status, 
            keys: Object.keys(responseData),
            error: responseData.error || responseData.message,
            responseDataFragment: rawDataString.substring(0, 500)
        }, '❌ AI Provider Error Detail');
        throw new AppError(errorMsg, 400);
      }

      const duration = Date.now() - startTime;
      logger.info(`✅ AI Service: Generation completed in ${duration}ms (Html Len: ${extractedHtml?.length || 0})`);

      if (!extractedHtml && !clarificationMsg && !extractedDraft) {
        logger.error({ keys: Object.keys(responseData) }, '❌ AI Service: Success was true but no HTML/Draft found');
        throw new AppError('No HTML content returned from AI service', 502);
      }

      // 3. Audit Logging
      const traceContext = TraceManager.getContext();
      // Don't log full cost for Analysis steps? Or log as separate resource type?
      // For now, consistent logging.
      const service = await this.serviceRepository.findBySlug(ServiceSlugs.AI_DOC_GENERATOR);
      if (service) {
          this.logRepository.createUsageLog({
              userId: traceContext?.userId || userId,
              appId: traceContext?.appId || options.appId,
              serviceId: service.id,
              action: action === 'analyze' ? 'analyze_ai_request' : 'generate_ai_document',
              resourceType: 'ai_document',
              status: 'success',
              statusCode: 200,
              duration,
              cost: service.pricePerRequest,
              ipAddress: options.ipAddress || 'internal',
              userAgent: options.userAgent || 'AiService (Internal)'
          }).catch(e => logger.error('[AiService] Log Error:', e));
      }

      // 4. Return
      return {
        html: extractedHtml || '',
        downloadLink: extractedLink || null,
        clarificationMessage: clarificationMsg || undefined,
        // Pass through IDs and Draft Data
        jobId: responseData.jobId,
        requestId: responseData.requestId,
        status: responseData.status,
        draft: extractedDraft
      };

    } catch (error: any) {
       if (error instanceof AppError) throw error;
       
       if (axios.isAxiosError(error)) {
         const status = error.response?.status;
         const msg = (error.response?.data as any)?.message || error.message;
         throw new AppError(`AI Service Error: ${msg}`, status && status < 500 ? 400 : 502);
       }

       logger.error({ error }, 'AI Service Critical Error');
       throw new AppError('An unexpected error occurred during AI generation', 500);
    }
  }

  async isConfigured(): Promise<boolean> { 
    try {
        await webhookService.getEndpoint(ServiceSlugs.AI_DOC_GENERATOR);
        return true;
    } catch {
        return false;
    }
  }



  public getManifest(): ServiceManifest {
      return {
          slug: ServiceSlugs.AI_DOC_GENERATOR,
          name: 'AI Document Generator',
          version: '1.0.0',
          description: 'AI-powered document generation suite with Human-in-the-Loop workflow.',
          actions: [
              {
                  key: 'analyze',
                  label: 'Analyze Request',
                  endpoint: '/analyze',
                  method: 'POST',
                  requiredFeature: 'ai_generation',
                  isBillable: false // Analysis is free/low-cost
              },
              {
                  key: 'enrich',
                  label: 'Smart Enrichment',
                  description: 'Generates upsells and personalized messages for transactional docs.',
                  endpoint: '/enrich',
                  method: 'POST',
                  requiredFeature: 'ai_smart_docs',
                  isBillable: true
              },
              {
                  key: 'format',
                  label: 'Format Document',
                  description: 'Phase 3: Applies styling and formats the final HTML output.',
                  endpoint: '/format',
                  method: 'POST',
                  requiredFeature: 'ai_generation',
                  isBillable: true
              }
          ],
          externalCalls: [
              { domain: 'n8n.automation-for-smes.com', purpose: 'AI Workflow Execution (Analysis, Drafting, Enrichment)' }
          ],
          endpoints: [
              { path: `/services/${ServiceSlugs.AI_DOC_GENERATOR}/analyze`, method: 'POST', description: 'Analyze Request (HITL)', billable: false },
              { path: `/services/${ServiceSlugs.AI_DOC_GENERATOR}/generate`, method: 'POST', description: 'Generate Document', billable: true },
              { path: `/services/${ServiceSlugs.AI_DOC_GENERATOR}/enrich`, method: 'POST', description: 'Smart Data Enrichment', billable: true },
              { path: `/services/${ServiceSlugs.AI_DOC_GENERATOR}/jobs/:jobId`, method: 'GET', description: 'Poll Job Status' },
              { path: `/services/${ServiceSlugs.AI_DOC_GENERATOR}/preview`, method: 'POST', description: 'Preview PDF' },
              { path: `/services/${ServiceSlugs.AI_DOC_GENERATOR}/convert`, method: 'POST', description: 'Convert to PDF', billable: true }
          ]
      };
  }

  /**
   * Calls N8N to enrich transactional data (Upsells, Personalization).
   */
  async enrichDocumentData(
      transactionContext: any,
      userId: string
  ): Promise<any> {
      try {
        const webhookUrl = await webhookService.getEndpoint(ServiceSlugs.AI_DOC_GENERATOR, 'enrich');
        
        logger.info({ userId, itemCount: transactionContext.items?.length }, '🧠 [AI Service] Requesting Smart Enrichment');

        const response = await axios.post(webhookUrl, {
            ...transactionContext,
            userId,
            action: 'enrich',
            timestamp: new Date().toISOString()
        });

        // N8N returns { smart_content: { ... }, template_id: ... }
        // We handle leniently
        const data = Array.isArray(response.data) ? response.data[0] : response.data;
        
        // Extract the smart block
        // N8N might return it directly or nested
        const smartContent = data.smart_content || data.enrichment || data;

        logger.info('✅ [AI Service] Enrichment received');
        logger.debug({ smartContent }, '🧠 Smart Content Payload');
        
        return smartContent;

      } catch (error) {
          logger.error({ err: error }, '❌ [AI Service] Enrichment Failed. Returning empty object (Graceful degradation).');
          return {}; // Never fail the document, just skip smart features
      }
  }

  /**
   * Standardized Execution Entry Point for Dynamic Router
   */
  public async executeAction(actionKey: string, payload: any, user: any): Promise<any> {
    // Map standard keys to internal methods if needed, or normalize payload
    // Currently, generateHtmlDocument handles 'action' via options.
    
    // We might need to adapt the payload structure from the generic route
    // to what generateHtmlDocument expects.
    
    // Generic Route Payload: { prompt, context, ... }
    const { prompt, documentType, ...options } = payload;
    
    return this.generateHtmlDocument(
        prompt || '',
        user.id,
        documentType || 'General',
        { 
            ...options,
            action: actionKey,
            userEmail: user.email 
        }
    );
  }
}

export const aiService = new AiService();
