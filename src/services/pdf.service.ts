import puppeteer, { Browser, PDFOptions } from 'puppeteer';
import { ConvertPdfRequest, ConvertPdfSchema } from '../schemas/pdf.schema';
import { logger } from '../lib/logger';
import { ServiceRepository } from '../repositories/service.repository';
import { AppRepository } from '../repositories/app.repository';
import { LogRepository } from '../repositories/log.repository';
import { UserRepository } from '../repositories/user.repository';
import { SecurityService } from './security.service';
import { AppError } from '../lib/AppError';
import { createQueue, QUEUES } from '../lib/queue';
import { TraceManager } from '../lib/trace';
import { webhookService } from './webhook.service';
import { n8nPayloadFactory } from './n8n/n8n-payload.factory';
import prisma from '../lib/prisma';

const pdfQueue = createQueue(QUEUES.PDF_GENERATION);

export class PdfService {
  private browser: Browser | null = null;
  private serviceRepository: ServiceRepository;
  private appRepository: AppRepository;
  private logRepository: LogRepository;
  private userRepository: UserRepository;

  constructor() {
    this.serviceRepository = new ServiceRepository();
    this.appRepository = new AppRepository();
    this.logRepository = new LogRepository();
    this.userRepository = new UserRepository();
  }

  private async getBrowser() {
    if (!this.browser || !this.browser.isConnected()) {
        if (this.browser) {
            try { await this.browser.close(); } catch (e) {}
        }

      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage', // Important for Docker
          '--disable-gpu'
        ]
      });
    }
    return this.browser;
  }

  /**
   * Async: Enqueue PDF Request
   */
  public async processPdfRequest(userId: string, appId: string, body: any, ipAddress: string, userAgent?: string, userEmail?: string) {
    return pdfQueue.add('internal-pdf', {
      type: 'internal',
      userId,
      appId,
      userEmail,
      payload: body,
      ipAddress,
      userAgent
    });
  }

  /**
   * Sync: Process PDF Request (Worker Only)
   */
  public async processPdfRequestSync(userId: string, appId: string, body: any, ipAddress: string, userAgent?: string): Promise<Buffer> {
    console.group('📄 [PdfService.processPdfRequestSync] START');
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('👤 User ID:', userId);
    console.log('📱 App ID:', appId);
    console.log('🌐 IP Address:', ipAddress);
    console.log('📦 Body Keys:', Object.keys(body));
    console.log('📦 Body.html Length:', body.html?.length || 0);
    console.log('� HTML Preview (first 500 chars):', body.html?.substring(0, 500) || '(no html)');
    console.log('�📦 Body.url:', body.url || '(none)');
    
    const startTime = Date.now();

    // Validate Request
    const { url, html, format, landscape, fullPage, removeSelectors, margin, printBackground } = body;
    const payload = {
      source: {
        type: url ? 'url' : 'html',
        content: url || html
      },
      options: {
        format: format || 'A4',
        landscape: landscape === 'true' || landscape === true,
        printBackground: printBackground !== false, // Default true, but respect explicit false
        fullPage: fullPage === 'true' || fullPage === true,
        removeSelectors,
        margin: margin || undefined, // Pass margin if provided
        waitForNetworkIdle: body.waitForNetworkIdle // [FIX] Ensure this is passed
      }
    };
    logger.debug({ options: payload.options, sourceType: payload.source.type }, '[Step 1] Request Payload Prepared');
    
    const validatedRequest = ConvertPdfSchema.parse(payload);
    logger.debug('[Step 2] Schema Validation Passed');

    if (validatedRequest.source.type === 'url') {
      await SecurityService.validateUrl(validatedRequest.source.content);
    }

    // Fetch Service
    logger.debug('🔍 [Step 3] Fetching service: html-to-pdf...');
    const service = await this.serviceRepository.findBySlug('html-to-pdf');
    if (!service) {
      logger.error('❌ Service not found!');
      throw new AppError('Service not found', 500);
    }
    logger.debug(`✅ [Step 3] Service found: ${service.id}`);

    // Determine App (STRICT MODE: Must provide appId)
    if (!appId) {
        throw new AppError('App Context (appId) is required for billing.', 400); 
    }

    logger.debug('🔍 [Step 4] Checking app authorization...');
    const connectedApp = await this.appRepository.findAppService(appId, service.id);
    if (!connectedApp || connectedApp.app.userId !== userId || !connectedApp.isEnabled) {
        logger.warn({ connectedApp: !!connectedApp, ownerMatch: connectedApp?.app.userId === userId, isEnabled: connectedApp?.isEnabled }, '❌ App not authorized');
        throw new AppError('Selected App is not authorized for this service.', 403);
    }
    logger.debug(`✅ [Step 4] App authorized: ${connectedApp.appId}`);

    // Generate PDF
    logger.info('🚀 [Step 5] Calling generatePdf()...');
    const pdfBuffer = await this.generatePdf(validatedRequest);
    logger.info(`✅ [Step 5] PDF Generated! Buffer Size: ${pdfBuffer.length} bytes`);

    // Determine cost
    let cost = service.pricePerRequest;
    
    // Check if the user has the feature enabled (making it $0 covered usage)
    const user = await this.userRepository.findByIdWithRelations(userId);
    const hasFeature = user?.subscription?.plan?.planFeatures?.some(pf => pf.feature.key === 'pdf_conversion' && pf.isEnabled);
    if (hasFeature) {
        cost = 0;
    }

    // Log Usage (Standardized SAE)
    const duration = Date.now() - startTime;
    const traceContext = TraceManager.getContext();
    
    await this.logRepository.createUsageLog({
      userId: traceContext?.userId || userId,
      appId: traceContext?.appId || connectedApp.appId,
      serviceId: service.id,
      action: 'convert_pdf_sync',
      resourceType: 'pdf',
      status: 'success',
      statusCode: 200,
      duration: duration,
      cost: cost,
      ipAddress: ipAddress,
      userAgent: userAgent
    }).catch(e => logger.error('[PdfService] Log Error:', e));

    // [FIX] Restore Webhook Trigger (Standardized)
    logger.debug('📡 [Step 7] Sending standardized webhook trigger...');
    const userWithBusiness = await prisma.user.findUnique({ where: { id: userId }, include: { business: true } });
    const n8nContext = {
        serviceId: service.id,
        serviceTenantId: userWithBusiness?.business?.id || 'unknown',
        appId: connectedApp.appId,
        requestId: traceContext?.traceId || `pdf_${Date.now()}`
    };

    const envelope = n8nPayloadFactory.createEventPayload('generation_completed', {
        requestId: traceContext?.traceId,
        userId: userId,
        appId: connectedApp.appId,
        cost: cost,
        duration: duration,
        status: 'success'
    }, userId, n8nContext);

    webhookService.sendTrigger('html-to-pdf', 'generation_completed', envelope);

    logger.info(`✅ [PdfService.processPdfRequestSync] COMPLETE - Duration: ${duration}ms`);
    return pdfBuffer;
  }

  /**
   * Async: Enqueue Public PDF Request
   */
  public async processPublicPdfRequest(app: any, service: any, body: any, file: Express.Multer.File | undefined, ipAddress: string, userAgent?: string) {
    return pdfQueue.add('public-pdf', {
      type: 'public',
      payload: {
        app,
        service,
        body,
        // Note: For now we're putting 'file' content into body.html or url if needed, 
        // or handling it via payload logic. Ideally upload to storage.
        // Assuming 'body' has necessary info or 'file' is handled before here.
      },
      userId: app.userId, // For tracking
      ipAddress,
      userAgent
    });
  }

  /**
   * Sync: Process Public PDF Request (Worker Only)
   */
  public async processPublicPdfRequestSync(app: any, service: any, body: any, file: Express.Multer.File | undefined, ipAddress: string, userAgent?: string): Promise<Buffer> {
    const startTime = Date.now();

    // Prepare Payload
    let content = body.url || body.html;
    let type = body.url ? 'url' : 'html';

    if (file) {
      content = file.buffer.toString('utf-8'); // Assuming HTML file
      type = 'html';
    }

    const payload = {
      source: { type, content },
      options: {
        format: body.format || 'A4',
        landscape: body.landscape === 'true' || body.landscape === true,
        printBackground: true,
        fullPage: body.fullPage === 'true' || body.fullPage === true,
        removeSelectors: body.removeSelectors
      }
    };

    const validatedRequest = ConvertPdfSchema.parse(payload);

    if (validatedRequest.source.type === 'url') {
      await SecurityService.validateUrl(validatedRequest.source.content);
    }

    // Generate PDF
    const pdfBuffer = await this.generatePdf(validatedRequest);

    // Log Usage (Standardized SAE)
    const duration = Date.now() - startTime;
    const traceContext = TraceManager.getContext();
    
    await this.logRepository.createUsageLog({
      userId: traceContext?.userId || app.userId,
      appId: traceContext?.appId || app.id,
      serviceId: service.id,
      action: 'convert_pdf_public',
      resourceType: 'pdf',
      status: 'success',
      statusCode: 200,
      duration: duration,
      cost: service.pricePerRequest,
      ipAddress: ipAddress,
      userAgent: userAgent
    }).catch(e => logger.error('[PdfService] Public Log Error:', e));

    // [FIX] Restore Webhook Trigger (Public Standardized)
    const n8nContextPublic = {
        serviceId: service.id,
        serviceTenantId: 'public-usage',
        appId: app.id,
        requestId: traceContext?.traceId || `pdf_pub_${Date.now()}`
    };

    const envelopePublic = n8nPayloadFactory.createEventPayload('generation_completed', {
        requestId: traceContext?.traceId,
        userId: app.userId,
        appId: app.id,
        cost: service.pricePerRequest,
        duration: duration,
        status: 'success'
    }, app.userId, n8nContextPublic);

    webhookService.sendTrigger('html-to-pdf', 'generation_completed', envelopePublic);

    return pdfBuffer;
  }

  public async generatePdf(request: ConvertPdfRequest): Promise<Buffer> {
    logger.debug({ 
        sourceType: request.source.type, 
        contentLen: request.source.content?.length,
        options: request.options 
    }, '🖨️ [PdfService.generatePdf] START');

    // console.log('📄 HTML Preview (first 500 chars):', request.source.content?.substring(0, 500) || '(no content)');
    
    logger.debug('🌐 [Puppeteer] Getting browser instance...');
    const browser = await this.getBrowser();
    
    const page = await browser.newPage();
    logger.debug('✅ [Puppeteer] Page created');

    try {
      // Set timeout
      page.setDefaultNavigationTimeout(request.options?.timeout || 30000);
      logger.debug(`⏱️ [Puppeteer] Navigation timeout set: ${request.options?.timeout || 30000}`);

      // Set Auth
      if (request.auth) {
        await page.authenticate(request.auth as any);
      }

      // Set Cookies
      if (request.cookies && request.cookies.length > 0) {
        await page.setCookie(...(request.cookies as any[]));
      }

      // [FIX] Use domcontentloaded for faster/safer rendering of strings
      const waitUntil = request.options?.waitForNetworkIdle !== undefined 
          ? (request.options.waitForNetworkIdle ? 'networkidle0' : 'domcontentloaded')
          : 'domcontentloaded';
      
      const width = request.options?.format === 'A4' ? 794 : 1280;
      const height = request.options?.format === 'A4' ? 1123 : 800;
      await page.setViewport({ width, height });

      if (request.source.type === 'url') {
        await page.goto(request.source.content, { waitUntil });
      } else {
        // [FIX] Use setContent instead of Data URI navigation
        // Data URI was causing body content to be empty in some cases due to encoding issues
        logger.debug(`[Puppeteer] Using setContent (HTML Length: ${request.source.content.length})...`);
        
        await page.setContent(request.source.content, { 
            waitUntil: 'domcontentloaded',
            timeout: 30000 
        });
        
        // Wait for any external resources (like Tailwind CDN) to load
        if (request.options?.waitForNetworkIdle) {
            logger.debug('[Puppeteer] Waiting for network idle...');
            await page.waitForNetworkIdle({ idleTime: 500, timeout: 15000 }).catch(() => {
                logger.warn('[Puppeteer] Network idle timeout - continuing anyway');
            });
        }
        
        logger.debug('✅ page.setContent() executed.');
      }

      // [DEBUG] Emulate screen media type to ensure styles look like the preview
      await page.emulateMediaType('screen');

      // [DEBUG] Capture Browser Console & Errors
      page.on('console', msg => logger.trace(`🔹 [Browser Console]: ${msg.text()}`));
      page.on('pageerror', err => logger.error(`❌ [Browser Error]: ${err}`));
      page.on('requestfailed', req => logger.trace(`❌ [Browser Request Failed]: ${req.url()} - ${req.failure()?.errorText}`));

      // [FIX] Inject Force-Visibility Styles for Print
      // This ensures that even if local CSS has 'visibility: hidden', we override it for the PDF container
      await page.addStyleTag({
          content: `
              @media print {
                  body { visibility: visible !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                  .print-container, .print-container * { visibility: visible !important; opacity: 1 !important; }
                  /* Ensure background usage */
                  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
              }
          `
      });

      // [AUDIT:PUPPETEER] Verify Internal Content
      const internalContent = await page.evaluate(() => {
          return {
              length: document.body.innerHTML.length,
              outerLength: document.documentElement.outerHTML.length,
              outerPreview: document.documentElement.outerHTML.substring(0, 500),
              bg: window.getComputedStyle(document.body).backgroundColor,
              childCount: document.body.children.length,
              title: document.title,
              hasPrintContainer: !!document.querySelector('.print-container')
          };
      });
      
      logger.debug(`🔍 [AUDIT] Rendered Page Stats: ${JSON.stringify(internalContent)}`);
      
      // [DEBUG] Capture Screenshot
      try {
          const screenshotPath = `debug_pdf_${Date.now()}.png`;
          // await page.screenshot({ path: screenshotPath, fullPage: true }); // Disabled for prod
          // logger.debug(`📸 [AUDIT] Saved screenshot to ${screenshotPath}`);
      } catch (err) {
          logger.error({ err: err as any }, 'Screenshot failed');
      }
      
      if (internalContent.length === 0) {
          logger.error('❌ [AUDIT] CRITICAL: Page is blank after setContent!');
      }

      // Remove unwanted elements
      if (request.options?.removeSelectors) {
        await page.evaluate((selectors) => {
          const sels = selectors.split(',').map(s => s.trim()).filter(s => s);
          sels.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => (el as HTMLElement).style.display = 'none');
          });
        }, request.options.removeSelectors);
      }

      // Full Page Scrolling to trigger lazy loading
      if (request.options?.fullPage) {
        await page.evaluate(async () => {
          await new Promise<void>((resolve) => {
            let totalHeight = 0;
            const distance = 100;
            const timer = setInterval(() => {
              const scrollHeight = document.body.scrollHeight;
              window.scrollBy(0, distance);
              totalHeight += distance;

              if (totalHeight >= scrollHeight) {
                clearInterval(timer);
                resolve();
              }
            }, 100);
          });
        });
        // Brief pause for any final renders
        await new Promise(r => setTimeout(r, 500));
      }

      const pdfOptions: PDFOptions = {
        format: request.options?.format as any,
        landscape: request.options?.landscape,
        printBackground: request.options?.printBackground,
        scale: request.options?.scale,
        margin: request.options?.margin,
        displayHeaderFooter: request.options?.displayHeaderFooter,
        headerTemplate: request.options?.headerTemplate,
        footerTemplate: request.options?.footerTemplate,
      };

      logger.debug(`🖨️ [Puppeteer] Generating PDF with options: ${JSON.stringify(pdfOptions)}`);
      const pdfBuffer = await page.pdf(pdfOptions);
      logger.info(`✅ [Puppeteer] PDF generated! Buffer size: ${pdfBuffer.length} bytes`);
      return Buffer.from(pdfBuffer);
    } finally {
      logger.debug('🧹 [Puppeteer] Closing page...');
      await page.close();
    }
  }

  public async generateScreenshot(source: { type: 'url' | 'html', content: string }, options: { format?: string, fullPage?: boolean, removeSelectors?: string } = {}): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      // Default to A4 aspect ratio for previews if no viewport is set
      const width = options.format === 'A4' ? 794 : 1280;
      const height = options.format === 'A4' ? 1123 : 800;
      
      await page.setViewport({ width, height });

      if (source.type === 'url') {
        await page.goto(source.content, { waitUntil: 'networkidle2', timeout: 30000 });
      } else {
        await page.setContent(source.content, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        await page.addStyleTag({
          content: `
            body { 
              background-color: white !important; 
              margin: 0 !important; 
              padding: 0 !important;
              min-height: 100vh !important;
              display: flex;
              flex-direction: column;
            }
          `
        });
      }

      // Remove unwanted elements
      if (options.removeSelectors) {
        await page.evaluate((selectors) => {
          const sels = selectors.split(',').map(s => s.trim()).filter(s => s);
          sels.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => (el as HTMLElement).style.display = 'none');
          });
        }, options.removeSelectors);
      }

      // Full Page Scrolling to trigger lazy loading
      if (options.fullPage) {
        await page.evaluate(async () => {
          await new Promise<void>((resolve) => {
            let totalHeight = 0;
            const distance = 100;
            const timer = setInterval(() => {
              const scrollHeight = document.body.scrollHeight;
              window.scrollBy(0, distance);
              totalHeight += distance;

              if (totalHeight >= scrollHeight) {
                clearInterval(timer);
                resolve();
              }
            }, 100);
          });
        });
        // Brief pause for any final renders
        await new Promise(r => setTimeout(r, 500));
      }

      // Take a screenshot
      const screenshot = await page.screenshot({
        type: 'jpeg',
        quality: 90,
        fullPage: options.fullPage || false
      });

      return Buffer.from(screenshot);
    } finally {
      await page.close();
    }
  }

  public async logPreviewUsage(userId: string, appId: string | undefined, serviceSlug: string, ipAddress: string, userAgent?: string) {
    const service = await this.serviceRepository.findBySlug(serviceSlug);
    if (!service) return;

    await this.logRepository.createUsageLog({
      userId,
      appId,
      serviceId: service.id,
      action: 'preview_generation',
      resourceType: 'preview',
      status: 'success',
      statusCode: 200,
      duration: 0,
      cost: service.pricePerRequest, // User requested billable, using full price
      ipAddress,
      userAgent
    }).catch(e => logger.error({ err: e as any }, '[PdfService] Preview Log Error'));
  }

  /**
   * Convenience wrapper for worker: Generate PDF from URL
   */
  public async generatePdfFromUrl(url: string, options?: any): Promise<Buffer> {
    return this.generatePdf({
      source: { type: 'url', content: url },
      options: options || {}
    });
  }

  /**
   * Convenience wrapper for worker: Generate PDF from HTML
   */
  public async generatePdfFromHtml(html: string, options?: any): Promise<Buffer> {
    return this.generatePdf({
      source: { type: 'html', content: html },
      options: options || {}
    });
  }

  /**
   * Alias for generatePdfFromHtml — used by TransactionalController and WorkflowService
   * for snapshot-based PDF generation where no extra options are needed.
   */
  public async generateFromHtml(html: string): Promise<Buffer> {
    return this.generatePdfFromHtml(html);
  }
}

export const pdfService = new PdfService();
