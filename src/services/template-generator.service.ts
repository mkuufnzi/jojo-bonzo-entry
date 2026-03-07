import prisma from '../lib/prisma';
import { aiService } from './ai.service';
import { logger } from '../lib/logger';

export class TemplateGeneratorService {

    /**
     * Generates a template using the Real n8n AI Service.
     * Uses the 'generate' action with a specialized system prompt.
     */
    async generateTemplate(userId: string, userPrompt: string, type: string) {
        
        logger.info({ userId, type }, '🎨 Initiating AI Template Design');

        // 1. Construct the System Prompt
        // We instruct the AI to act as a Frontend Expert and output ONLY valid HTML/EJS.
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
              - {{logoUrl}} (Use <img> tag, handle empty if needed)
              - {{addressHtml}}
              - {{contactHtml}}
              - {{customerName}}
              - {{customerAddress}}
              - {{docNumber}}
              - {{date}}
              - {{dueDate}}
              - {{items_table}} (This is critical - place this where the list of items should go)
              - {{subtotal}}
              - {{tax}}
              - {{total}}
              - {{currency}}
              - {{primaryColor}} (Use this for main accents)
              - {{secondaryColor}}
            
            4. Do NOT output Markdown. Do NOT output \`\`\`html blocks. Output RAW HTML only.
            5. Ensure the layout is responsive but optimized for PDF generation (A4 width).
        `;

        // 2. Call the AI Service
        // We use the 'generate' action which corresponds to the main generation webhook.
        // We pass the prompt constructed above.
        const result = await aiService.generateHtmlDocument(
            systemPrompt, 
            userId, 
            type, 
            {
                action: 'generate', // Use the 'generate' endpoint
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
                htmlContent: result.html, // The AI's generated HTML
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
    async generateHtml(userId: string, businessId: string, documentType: string, payload: any): Promise<string> {
        const { brandingService } = require('./branding.service');
        const { templateRegistry } = require('./template-registry.service');
        const { resolveLayout } = require('./layout-resolution.service');
        const { RevenueService } = require('../modules/transactional/revenue/revenue.service');
        const { webhookService } = require('./webhook.service');
        const { SmartInvoice } = require('../models/smart-documents/smart-invoice.model');
        const ejs = require('ejs');
        const path = require('path');
        const axios = require('axios');

        const revenueService = new RevenueService();

        logger.info({ businessId, documentType }, '📄 [TemplateGeneratorService] Generating local template HTML');

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
        let layoutOrder: string[] = [];
        let widgetStates: any = {};
        
        if (templateId.startsWith('custom:')) {
            const customId = templateId.replace('custom:', '');
            const userTemplate = await brandingService.getUserTemplate(customId);
            if (userTemplate) templateHtml = userTemplate.htmlContent;
        } else {
            const manifest = templateRegistry.getById(templateId);
            if (!manifest) throw new Error(`Template manifest not found for ${templateId}`);

            const resolved = resolveLayout(manifest, profile.components);
            layoutOrder = resolved.layoutOrder;
            widgetStates = resolved.widgetStates;
            
            const viewPathRelativeToViews = manifest.viewPath || 'templates/invoice/smart-invoice-v1/index';
            absoluteViewPath = path.join(process.cwd(), 'src/views', `${viewPathRelativeToViews}.ejs`);
        }

        // 2. Prepare Base Theme Data (similar to BrandingController.getPreview)
        const dbProfile = profile;
        const business = (dbProfile as any).business || await (prisma as any).business.findUnique({ where: { id: businessId } });
        
        const profileName = profile.name || 'Your Company'; 
        const businessName = business?.name || profileName;
        const brandColors = (dbProfile.brandColors as any) || {};
        
        const themeData = {
            name: businessName,
            primary: brandColors.primary || '#6366F1',
            secondary: brandColors.secondary || '#8B5CF6',
            accent: brandColors.accent || '#C4B5FD',
            light: brandColors.light || '#F5F3FF',
            text: brandColors.text || '#1e293b',
            pattern: '', 
            logo: dbProfile.logoUrl || '⚡',
            logoUrl: dbProfile.logoUrl,
            tagline: dbProfile.tagline || (dbProfile.fontSettings as any)?.tagline || 'Building the future of commerce.',
            gradient: `linear-gradient(135deg, ${brandColors.primary || '#6366F1'} 0%, ${brandColors.secondary || '#8B5CF6'} 100%)`,
            layoutOrder: layoutOrder
        };

        const config = dbProfile.config || {};
        const components = dbProfile.components || {};

        // 3. Transform Payload to Document Model
        const items = payload.items || [];
        const customer = payload.customer || { name: 'Valued Customer', email: '' };
        const amount = payload.amount || payload.total || 0;
        const currency = payload.currency || 'USD';
        
        const smartInvoice = new SmartInvoice(
            payload.entityId || payload.id || `INV-${Date.now()}`,
            themeData,
            config,
            [], [], [], [], {}
        );

        items.forEach((item: any, idx: number) => {
            smartInvoice.addItem({
                id: idx + 1,
                name: item.description || item.name || 'Item',
                sku: item.sku || `SKU-${idx + 1}`,
                qty: item.quantity || 1,
                price: item.unitPrice || item.rate || item.amount || 0,
                img: item.img || '📦',
                category: item.category || 'General'
            });
        });

        // 4. Fetch Smart Enrichment (AI Upsells / Recommendations / Support)
        const upsell = (profile.upsellConfig as any) || {};
        let smartContent: any = {};
        
        if (upsell.active || config.upsellEnabled) {
             const itemNames = items.map((i: any) => i.description || i.name);
             try {
                 smartContent = await revenueService.getEnrichedContext(businessId, itemNames);
             } catch (e) {
                 logger.warn({ err: e }, 'Smart Enrichment failed during local template generation fallback to mock');
                 smartContent = { tutorials: [], recommendations: [] };
             }
        }
        
        try {
            if (!smartContent.recommendations || smartContent.recommendations.length === 0) {
                 const aiUrl = await webhookService.getEndpoint('transactional-branding', 'ai_recommendations');
                 if (aiUrl && aiUrl !== '') {
                      const response = await axios.post(aiUrl, { items: items.map((i:any) => i.name || i.description), businessId });
                      if (response.data && response.data.recommendations) {
                          smartContent.recommendations = response.data.recommendations;
                      }
                 }
            }
        } catch (e: any) {
             logger.debug('Failed external AI webhook call, proceeding with defaults');
        }

        smartInvoice.recommendations = smartContent.recommendations || [];
        smartInvoice.tutorials = smartContent.tutorials || [];
        smartInvoice.nurtureMessages = smartContent.nurtureMessages || [];

        const modelData = {
           ...smartInvoice.toJSON().data,
           id: payload.entityId || payload.id || `INV-${Date.now()}`,
           customerName: customer.name || 'Valued Customer',
           customerEmail: customer.email || '',
           customerAddress: customer.address || 'Address not provided',
           businessName: businessName,
           businessAddress: business?.address || '',
           businessWebsite: business?.website || '',
           businessEmail: (dbProfile.supportConfig as any)?.email || '',
           voiceProfile: dbProfile.voiceProfile || {},
           subtotal: payload.subtotal || amount,
           tax: payload.tax || 0,
           total: amount,
           currency: currency,
           date: payload.date || new Date().toLocaleDateString(),
           dueDate: payload.dueDate || ''
        };

        // 5. Compile HTML
        if (templateHtml) {
             // It's a custom DB template (HTML string)
             // Use simple replace logic identical to preview
               let rendered = templateHtml
                    .replace(/{{businessName}}/g, businessName)
                    .replace(/{{customerName}}/g, modelData.customerName)
                    .replace(/{{docNumber}}/g, modelData.id)
                    .replace(/{{date}}/g, modelData.date)
                    .replace(/{{subtotal}}/g, modelData.subtotal.toString())
                    .replace(/{{tax}}/g, modelData.tax.toString())
                    .replace(/{{total}}/g, modelData.total.toString())
                    .replace(/{{currency}}/g, modelData.currency);
               return rendered;
        }

        // Standard EJS render
        let _layoutPath: string | null = null;
        const renderContext: any = {
            branding: {
                theme: themeData,
                themeData: themeData,
                config,
                components,
                profile: dbProfile,
                model: modelData,
                layoutOrder,
                widgetStates,
                resolvedFrom: 'manifest'
            },
            nonce: 'ssr-nonce',
            document: { id: payload.entityId },
            layout: (layoutName: string) => {
                _layoutPath = layoutName;
            },
            block: (name: string) => ''
        };

        try {
            let bodyHtml = await ejs.renderFile(absoluteViewPath, renderContext);
            
            if (_layoutPath) {
                // Determine absolute path of the layout EJS file
                // layout paths are usually 'layouts/document-master'
                const layoutAbsolutePath = path.join(process.cwd(), 'src/views', `${_layoutPath}.ejs`);
                const layoutContext = { ...renderContext, body: bodyHtml };
                bodyHtml = await ejs.renderFile(layoutAbsolutePath, layoutContext);
            }
            
            logger.info('✅ [TemplateGeneratorService] HTML compiled successfully');
            return bodyHtml;
        } catch (error: any) {
            logger.error({ err: error, path: absoluteViewPath }, '❌ [TemplateGeneratorService] EJS Render Error');
            throw new Error(`Failed to compile EJS template: ${error.message}`);
        }
    }
}




export const templateGenerator = new TemplateGeneratorService();
