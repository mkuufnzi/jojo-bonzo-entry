import prisma from '../lib/prisma';
import { aiService } from './ai.service';
import { logger } from '../lib/logger';
import { serviceRegistry } from './service-registry.service';
import { ServiceSlugs } from '../types/service.types';
import { SmartInvoice } from '../models/smart-documents/smart-invoice.model';

export class TemplateGeneratorService {

    /**
     * Generates a template using the Real n8n AI Service.
     * Uses the 'generate' action with a specialized system prompt.
     */
    async generateTemplate(userId: string, userPrompt: string, type: string) {
        
        logger.info({ userId, type }, '🎨 Initiating AI Template Design');

        // 1. Construct the System Prompt
        const systemPrompt = `
           ACT AS: Expert Frontend Developer & UI Designer.
           TASK: Create a single-file HTML/CSS template for a business document.
           DOCUMENT TYPE: ${type.toUpperCase()}
           STYLE: ${userPrompt}
           
           REQUIREMENTS:
           1. Use valid HTML5 and inline CSS (or <style> block). 
           2. Make it look PREMIUM, like a Canva design.
           3. YOU MUST USE THESE PLACEHOLDERS for dynamic data:
              - {{businessName}}
              - {{logoUrl}}
              - {{addressHtml}}
              - {{contactHtml}}
              - {{customerName}}
              - {{customerAddress}}
              - {{docNumber}}
              - {{date}}
              - {{dueDate}}
              - {{items_table}}
              - {{subtotal}}
              - {{tax}}
              - {{total}}
              - {{currency}}
              - {{primaryColor}}
              - {{secondaryColor}}
            
            4. Do NOT output Markdown. Do NOT output \`\`\`html blocks. Output RAW HTML only.
            5. Ensure the layout is responsive but optimized for PDF generation (A4 width).
        `;

        // 2. Call the AI Service
        const result = await aiService.generateHtmlDocument(
            systemPrompt, 
            userId, 
            type, 
            {
                action: 'generate',
                tone: 'professional',
                appId: 'template-generator'
            }
        );

        if (!result.html) {
            throw new Error('AI returned no HTML content');
        }

        // 3. Save to UserTemplate
        const user = await (prisma as any).user.findUnique({ where: { id: userId } });
        if (!user?.businessId) throw new Error('User has no business');

        const saved = await (prisma as any).userTemplate.create({
            data: {
                businessId: user.businessId,
                name: `${userPrompt.substring(0, 20)}... (${type})`,
                documentType: type,
                htmlContent: result.html,
                source: 'ai_generated',
                status: 'active'
            }
        });

        return saved;
    }

    /**
     * Generate HTML for a transaction document using local EJS templates
     * and external N8n AI data.
     */
    async generateHtml(userId: string, businessId: string, documentType: string, payload: any, nonce?: string): Promise<string> {
        const { brandingService } = require('./branding.service');
        const { templateRegistry } = require('./template-registry.service');
        const { resolveLayout } = require('./layout-resolution.service');
        const ejs = require('ejs');
        const path = require('path');

        logger.info({ businessId, documentType }, '📄 [TemplateGeneratorService] Generating local template HTML (Unified Path)');

        // 1. Fetch Branding Profile
        const profile = await brandingService.getProfile(userId) || await (prisma as any).brandingProfile.findFirst({
            where: { businessId, isDefault: true },
            include: { business: true }
        });

        if (!profile) {
            throw new Error('Branding profile not found. Cannot generate customized document.');
        }

        const templateId = profile.activeTemplateId || 'smart_invoice_v1';
        
        let templateHtml = '';
        let absoluteViewPath = '';
        let manifest: any = null;
        let layoutOrder: string[] = [];
        let widgetStates: any = {};
        
        if (templateId.startsWith('custom:')) {
            const customId = templateId.replace('custom:', '');
            const userTemplate = await brandingService.getUserTemplate(customId);
            if (userTemplate) templateHtml = userTemplate.htmlContent;
        } else {
            manifest = templateRegistry.getById(templateId);
            if (!manifest) throw new Error(`Template manifest not found for ${templateId}`);

            const resolved = resolveLayout(manifest, profile.components);
            layoutOrder = resolved.layoutOrder;
            widgetStates = resolved.widgetStates;
            
            const viewPathRelativeToViews = manifest.viewPath || 'templates/invoice/smart-invoice-v1/index';
            absoluteViewPath = path.join(process.cwd(), 'src/views', `${viewPathRelativeToViews}.ejs`);
        }

        // 2. Prepare Base Theme Data
        const dbProfile = profile;
        const business = (dbProfile as any).business || await (prisma as any).business.findUnique({ where: { id: businessId } });
        
        const businessName = profile.companyName || business?.name || 'Your Company';
        const brandColors = (dbProfile.brandColors as any) || {};
        
        const themeData = {
            name: businessName,
            primary: brandColors.primary || '#6366F1',
            secondary: brandColors.secondary || '#8B5CF6',
            accent: brandColors.accent || '#C4B5FD',
            light: brandColors.light || '#F5F3FF',
            text: brandColors.text || '#1e293b',
            logoUrl: dbProfile.logoUrl,
            tagline: dbProfile.tagline || (dbProfile.fontSettings as any)?.tagline || 'Building the future of commerce.',
            gradient: `linear-gradient(135deg, ${brandColors.primary || '#6366F1'} 0%, ${brandColors.secondary || '#8B5CF6'} 100%)`,
            layoutOrder: layoutOrder
        };

        const config = (dbProfile.config as any) || {};
        const components = (dbProfile.components as any) || {};

        // 3. GET ENRICHED CONTEXT (Recommendations/Upsells)
        let smartContent: any = payload.smartContent || null;
        logger.info({ hasSmartContent: !!smartContent, smartContentKeys: smartContent ? Object.keys(smartContent) : [] }, '📦 [TemplateGeneratorService] smartContent from payload');
        
        if (!smartContent) {
            try {
                let appId = (payload as any).appId || (dbProfile as any).appId;
                let apiKey = (payload as any).apiKey || (dbProfile as any).apiKey;

                if (!appId || !apiKey) {
                    const defaultApp = await (prisma as any).app.findFirst({
                        where: { userId, name: 'Default App', isActive: true }
                    });
                    if (defaultApp) {
                        appId = defaultApp.id;
                        apiKey = defaultApp.apiKey;
                    }
                }

                if (appId && apiKey) {
                    const recommendationResponse = await serviceRegistry.callInternalService(
                        ServiceSlugs.RECOMMENDATIONS,
                        '/recommendations/document',
                        'POST',
                        {
                            items: (payload.items || []).map((i: any) => i.name || i.description),
                            limit: 3,
                            businessId
                        },
                        {
                            'x-app-id': appId,
                            'x-api-key': apiKey
                        }
                    );

                    if (recommendationResponse.success) {
                        smartContent = { recommendations: recommendationResponse.data };
                    }
                }
            } catch (e: any) {
                logger.warn({ err: e.message }, '⚠️ [TemplateGeneratorService] Could not enrich context');
            }
        }

        // 4. Normalize via SmartInvoice Model
        const docId = payload.documentId || payload.entityId || payload.id || `INV-${Date.now()}`;
        const smartInvoice = SmartInvoice.fromPayload(
            docId,
            themeData as any,
            config,
            { ...payload, smartContent }
        );

        const modelData = smartInvoice.toJSON().data;
        logger.info({ recommendationsCount: modelData.recommendations?.length || 0, tutorialsCount: modelData.tutorials?.length || 0 }, '📦 [TemplateGeneratorService] SmartInvoice modelData built');
        const portal_url = payload.portal_url || '';
        const interactive_link = payload.interactive_link || '';

        // 5. Compile HTML
        if (templateHtml) {
               return templateHtml
                    .replace(/{{businessName}}/g, businessName)
                    .replace(/{{customerName}}/g, payload.customer?.name || 'Customer')
                    .replace(/{{docNumber}}/g, docId)
                    .replace(/{{total}}/g, smartInvoice.total.toFixed(2))
                    .replace(/{{currency}}/g, payload.currency || 'USD');
        }

        const renderContext: any = {
            branding: {
                theme: themeData,
                themeData: themeData,
                config,
                components,
                profile: dbProfile,
                model: {
                    ...modelData,
                    portal_url,
                    interactive_link
                },
                layoutOrder,
                widgetStates,
                documentId: docId,
                generateActionLink: (action: string, params: any = {}) => {
                    const { linkService } = require('./link.service');
                    return linkService.generateActionLink(action, { docId, ...params });
                },
                resolvedFrom: 'manifest'
            },
            invoiceData: payload,
            nonce: nonce || 'ssr-nonce',
            document: { id: docId },
            settings: {
                views: path.join(process.cwd(), 'src/views')
            }
        };

        try {
            const engine = require('ejs-mate');
            const bodyHtml = await new Promise<string>((resolve, reject) => {
                engine(absoluteViewPath, renderContext, (err: any, html: string) => {
                    if (err) return reject(err);
                    resolve(html);
                });
            });
            logger.info('✅ [TemplateGeneratorService] Unified HTML compiled with ejs-mate');
            return bodyHtml;
        } catch (error: any) {
            logger.error({ err: error, path: absoluteViewPath }, '❌ [TemplateGeneratorService] EJS Render Error');
            throw new Error(`Failed to compile EJS template: ${error.message}`);
        }
    }
}

export const templateGenerator = new TemplateGeneratorService();
