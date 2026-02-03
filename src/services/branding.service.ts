import prisma from '../lib/prisma';
import { logger } from '../lib/logger';

export class BrandingService {
  
  async getProfile(userId: string) {
    const user = await (prisma as any).user.findUnique({ where: { id: userId }, select: { businessId: true } });
    if (!user?.businessId) return null;

    // Return default or first
    return await (prisma as any).brandingProfile.findFirst({
      where: { businessId: user.businessId, isDefault: true }
    }) || await (prisma as any).brandingProfile.findFirst({
      where: { businessId: user.businessId }
    });
  }

  async updateProfile(userId: string, data: any) {
    const user = await (prisma as any).user.findUnique({ where: { id: userId }, select: { businessId: true } });
    if (!user?.businessId) throw new Error('User does not belong to a business');
    const businessId = user.businessId;

    const existing = await (prisma as any).brandingProfile.findFirst({
      where: { businessId, isDefault: true }
    });
    
    // Clean up incoming data to ensure proper JSON types
    const components = data.components || {};

    if (existing) {
      return await (prisma as any).brandingProfile.update({
        where: { id: existing.id },
        data: {
          brandColors: data.brandColors,
          fontSettings: data.fontSettings,
          logoUrl: data.logoUrl || existing.logoUrl,
          upsellConfig: data.upsellConfig,
          supportConfig: data.supportConfig,
          templates: data.templates,
          components: components, // New Field
          activeTemplateId: data.activeTemplateId // New Field
        }
      });
    }

    // Create new
    return await (prisma as any).brandingProfile.create({
      data: {
        businessId,
        name: 'Default Brand',
        isDefault: true,
        brandColors: data.brandColors,
        fontSettings: data.fontSettings,
        logoUrl: data.logoUrl,
        upsellConfig: data.upsellConfig || {},
        supportConfig: data.supportConfig || {},
        components: components,
        activeTemplateId: data.activeTemplateId || 'smart_invoice_v1'
      }
    });
  }
  async generatePreview(profileId: string, documentType: string = 'invoice', templateId: string = '') {
    // 1. Fetch Profile & Business
    const profile = await (prisma as any).brandingProfile.findUnique({ where: { id: profileId } });
    if (!profile) throw new Error('Profile not found');

    const business = await (prisma as any).business.findUnique({
        where: { id: profile.businessId }
    });

    logger.info({ profileId, documentType }, '🖌️ [BrandingService] Generating Preview...');

    // 2. Data Preparation (Variables) - Moved to top to avoid ReferenceError
    const mockData = this.getMockData(documentType);
    
    const colors = (profile.brandColors as any) || { primary: '#000000', secondary: '#ffffff' };
    const font = (profile.fontSettings as any)?.heading || 'sans-serif';
    const profileName = profile.name || 'Your Company'; 
    const businessName = business?.name || profileName;
    const upsell = (profile.upsellConfig as any) || {};
    const support = (profile.supportConfig as any) || {};
    const logoUrl = profile.logoUrl;

     // Address Formatting
    const addressHtml = business?.address ? 
        `${business.address}<br>${business.city || ''}, ${business.state || ''} ${business.zip || ''}` : 
        '123 Business Rd, Tech City';

    const contactHtml = [
        business?.phone ? `P: ${business.phone}` : '',
        business?.website ? `W: ${business.website}` : '',
        support.email ? `E: ${support.email}` : ''
    ].filter(Boolean).join(' | ');

    // 3. Template Selection Logic
    // If templateId starts with "custom:", fetch from UserTemplate
    let templateHtml = '';
    
    if (templateId && templateId.startsWith('custom:')) {
        const customId = templateId.replace('custom:', '');
        const userTemplate = await (prisma as any).userTemplate.findUnique({ where: { id: customId } });
        if (userTemplate) {
            templateHtml = userTemplate.htmlContent;
        }
    } 

    if (!templateHtml) {
        // Fallback to Standard Templates
        const templates: Record<string, Function> = {
            'invoice': () => this.getStandardInvoiceTemplate(businessName, logoUrl),
            'receipt': () => this.getStandardReceiptTemplate(businessName, logoUrl),
            'estimate': () => this.getStandardEstimateTemplate(businessName, logoUrl, colors)
        };
        // Simplified for this view: use standard if no custom found
        templateHtml = templates[documentType] ? templates[documentType]() : templates['invoice']();
    }

    // 4.5 Pre-render Items Table (for injection)
    const itemsTableHtml = this.renderStandardTable(mockData, colors);

    // 4.6 SMART ENRICHMENT (New)
    // If Upsell Module is Active, call AI to generate dynamic content
    let smartContent: any = {};
    if (upsell.active) {
         try {
             // We pass the mock data (items, customer) to the AI to get relevant upsells
             // In a real flow, this would be the actual Invoice Data
             // For PREVIEW, we used the mock data.
             
             // Check if we have a mocked response or need to call real AI?
             // Calling real AI on every preview render might be slow/costly.
             // For MVP, lets call it if it's not cached? 
             // actually, for "Preview", maybe we just show a static placeholder unless requested?
             // User said: "demonstrate methods to call api endpoints"
             // Let's call it! But maybe we wrap it in a try/catch and fallback quickly.
             
             // Lazy load/Dependency injection issue? 
             // We can import aiService directly as it is a singleton.
             const { aiService } = require('./ai.service');
             
             // We use a simplified context for the preview
             smartContent = await aiService.enrichDocumentData({
                 customer: mockData.customer,
                 items: mockData.items,
                 docType: documentType
             }, profileId); // Using profileId as dummy userId for now

         } catch (e) {
             console.error('Smart Enrichment Warning:', e);
             // Fallback to static upsell config if AI fails
             smartContent = {
                 personal_message: "Thank you for your business!",
                 upsell_block: [
                     { title: "Premium Service", price: "$99/mo" }
                 ]
             };
         }
    }

    // Prepare Smart Strings
    const personalMessageHtml = smartContent.personal_message 
        ? `<div class="personal-message" style="margin-top: 20px; padding: 15px; background: #f0fdf4; border-left: 4px solid #4ade80; color: #166534; font-style: italic;">"${smartContent.personal_message}"</div>` 
        : '';

    let upsellHtml = '';
    if (smartContent.upsell_block && Array.isArray(smartContent.upsell_block)) {
        upsellHtml = `
            <div class="upsell-section" style="margin-top: 40px; border-top: 1px dashed #ddd; padding-top: 20px;">
                <h4 style="margin-bottom: 15px; text-transform: uppercase; font-size: 10px; letter-spacing: 1px; color: #888;">Recommended for You</h4>
                <div style="display: flex; gap: 20px;">
                    ${smartContent.upsell_block.map((u: any) => `
                        <div style="flex: 1; padding: 15px; border: 1px solid #eee; border-radius: 8px; background: #fafafa;">
                            <div style="font-weight: bold; color: ${colors.primary}; font-size: 14px;">${u.title}</div>
                            <div style="font-size: 12px; color: #666; margin-top: 5px;">${u.price || 'Contact us'}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }


    // 5. Render (Inject Variables into HTML)
    let rendered = templateHtml
        .replace(/{{businessName}}/g, businessName)
        // ... (other replaces implicitly handled if I don't touch them, but I need to be careful about what I'm replacing)
        // Actually I should just do the scalar replacement block since that's where it broke
        .replace(/{{items_table}}/g, itemsTableHtml)
        .replace(/{{personal_message}}/g, personalMessageHtml) 
        .replace(/{{upsell_section}}/g, upsellHtml)
        .replace(/{{businessName}}/g, businessName) // Redundant but safe
        .replace(/{{logoUrl}}/g, logoUrl ? `<img src="${logoUrl}" style="max-height: 50px;" />` : '')
        .replace(/{{addressHtml}}/g, addressHtml)
        .replace(/{{contactHtml}}/g, contactHtml)
        .replace(/{{primaryColor}}/g, colors.primary)
        .replace(/{{secondaryColor}}/g, colors.secondary)
        .replace(/{{font}}/g, font)
        .replace(/{{customerName}}/g, mockData.customer.name)
        .replace(/{{customerAddress}}/g, mockData.customer.address)
        .replace(/{{docNumber}}/g, mockData.number)
        .replace(/{{date}}/g, mockData.date)
        .replace(/{{dueDate}}/g, mockData.dueDate || '')
        .replace(/{{subtotal}}/g, mockData.subtotal)
        .replace(/{{tax}}/g, mockData.tax)
        .replace(/{{total}}/g, mockData.total)
        .replace(/{{currency}}/g, mockData.currency);
    
    const result = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: ${font}, sans-serif; padding: 40px; color: #333; max-width: 800px; margin: 0 auto; }
          .header { border-bottom: 3px solid ${colors.primary}; padding-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
          .logo { max-height: 50px; margin-right: 15px; }
          .brand-area { display: flex; align-items: center; }
          .company-name { font-size: 24px; font-weight: bold; color: ${colors.primary}; }
          .doc-title { font-size: 32px; color: #555; text-align: right; text-transform: uppercase; letter-spacing: 2px; }
          .meta { margin-top: 30px; display: flex; justify-content: space-between; font-size: 0.9rem; line-height: 1.5; }
          .meta-row { margin-top: 20px; display: flex; justify-content: space-between; border-top: 1px solid #eee; padding-top: 10px; }
          .table { width: 100%; border-collapse: collapse; margin-top: 40px; }
          .table th { background: ${colors.secondary}; color: #333; padding: 10px; text-align: left; border-bottom: 2px solid #ddd; text-transform: uppercase; font-size: 0.8rem; letter-spacing: 1px; }
          .table td { padding: 12px 10px; border-bottom: 1px solid #eee; }
          .total-section { margin-top: 30px; margin-left: auto; width: 300px; }
          .total-row { display: flex; justify-content: space-between; padding: 5px 0; }
          .grand-total { font-size: 20px; font-weight: bold; color: ${colors.primary}; border-top: 2px solid #333; padding-top: 10px; margin-top: 10px; }
          .footer { margin-top: 50px; border-top: 1px solid #eee; padding-top: 20px; font-size: 12px; color: #777; text-align: center; }
          .upsell { background: #f9f9f9; border: 1px dashed ${colors.primary}; padding: 15px; margin-top: 40px; text-align: center; border-radius: 8px; }
        </style>
      </head>
      <body>
        ${rendered}
        ${!templateHtml.includes('{{items_table}}') && !templateId.startsWith('custom:') ? itemsTableHtml : ''}
         <div class="footer">
            ${contactHtml} <br>
            Thank you for your business!
        </div>
      </body>
      </html>
    `;
    
    logger.info({ size: result.length, documentType }, '✅ [BrandingService] Preview Generated Successfully');
    return result;
  }

  // New Helper Methods for Controller
  async getUserTemplate(id: string) {
      return await (prisma as any).userTemplate.findUnique({ where: { id } });
  }

  /**
   * Clones a standard template into a customized UserTemplate.
   * This is the entry point for "Document Specific" configurations.
   */
  async cloneTemplate(userId: string, sourceId: string, name?: string) {
      const user = await (prisma as any).user.findUnique({ where: { id: userId }, select: { businessId: true } });
      if (!user?.businessId) throw new Error('User does not belong to a business');
      
      // 1. Get Source Manifest
      // We need to access the registry. For now, we'll lazily require it to avoid circular deps if any, 
      // or improved dependency injection later.
      const { templateRegistry } = require('./template-registry.service');
      const manifest = templateRegistry.getById(sourceId);
      
      if (!manifest) {
          throw new Error(`Template ${sourceId} not found`);
      }

      // 2. Prepare Config Defaults from Manifest
      const initialComponents: any = {};
      if (manifest.features) {
          manifest.features.forEach((f: any) => {
              initialComponents[f.id] = { enabled: f.defaultEnabled ?? true };
          });
      }

      // 3. Create UserTemplate
      return await (prisma as any).userTemplate.create({
          data: {
              businessId: user.businessId,
              name: name || `${manifest.name} (Custom)`,
              documentType: manifest.type,
              baseTemplateId: sourceId,
              source: 'system', // 'system' means it relies on the filesystem view, but has DB config
              config: {
                  components: initialComponents,
                  theme: {} // Can store specific theme overrides here later
              },
              isDefault: false
          }
      });
  }

  async updateUserTemplate(id: string, data: any) {
      // Logic generic enough for both html updates and config updates
      return await (prisma as any).userTemplate.update({
          where: { id },
          data
      });
  }

  // Helpers for Standard Templates
  private getStandardInvoiceTemplate(name: string, logo: string | null) {
      return `
            <div class="header">
                 <div class="brand-area">
                    ${logo ? `<img src="${logo}" class="logo" alt="Logo">` : ''}
                    <div class="company-name">${name}</div>
                 </div>
                <div class="doc-title">INVOICE</div>
            </div>
            <div class="meta">
                <div>
                     <strong>Bill To:</strong><br>
                     {{customerName}}<br>
                     {{customerAddress}}
                </div>
                <div style="text-align: right;">
                     <strong>${name}</strong><br>
                     {{addressHtml}}
                </div>
            </div>
            <div class="meta-row">
                 <span><strong>Invoice #:</strong> {{docNumber}}</span>
                 <span><strong>Date:</strong> {{date}}</span>
                 <span><strong>Due:</strong> {{dueDate}}</span>
            </div>
      `;
  }

  private getStandardReceiptTemplate(name: string, logo: string | null) {
      return `
            <div class="header" style="text-align: center; display: block;">
                ${logo ? `<img src="${logo}" class="logo" style="margin: 0 auto 10px;" alt="Logo">` : ''}
                <div class="company-name">${name}</div>
                <div class="doc-title" style="font-size: 18px; color: #777; margin-top: 5px;">RECEIPT</div>
            </div>
            <div class="meta" style="justify-content: center; text-align: center; margin-top: 20px;">
                <div>
                    {{addressHtml}}<br>
                    {{contactHtml}}
                </div>
            </div>
             <div class="meta-row" style="background: #f0f0f0; padding: 10px; margin-top: 20px; text-align: center;">
                 <strong>Receipt #:</strong> {{docNumber}} • <strong>Date:</strong> {{date}}
            </div>
      `;
  }

  private getStandardEstimateTemplate(name: string, logo: string | null, colors: any) {
      return `
             <div class="header">
                 <div class="brand-area">
                    ${logo ? `<img src="${logo}" class="logo" alt="Logo">` : ''}
                    <div class="company-name">${name}</div>
                 </div>
                <div class="doc-title" style="color: ${colors.secondary}">ESTIMATE</div>
            </div>
             <div class="meta">
                <div>
                     <strong>Prepared For:</strong><br>
                     {{customerName}}
                </div>
                <div style="text-align: right;">
                     <strong>Valid Until:</strong> {{dueDate}}
                </div>
            </div>
      `;
  }
  
  private renderStandardTable(data: any, colors: any) {
        return `
        <table class="table">
            <thead>
                <tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
            </thead>
            <tbody>
                ${data.items.map((item: any) => `
                    <tr>
                        <td>${item.description}</td>
                        <td>${item.quantity}</td>
                        <td>${item.rate}</td>
                        <td>${item.amount}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>

        <div class="total-section">
            <div class="total-row"><span>Subtotal:</span> <span>${data.subtotal}</span></div>
            <div class="total-row"><span>Tax (10%):</span> <span>${data.tax}</span></div>
            <div class="total-row grand-total"><span>Total:</span> <span>${data.currency} ${data.total}</span></div>
        </div>
        `;
  }

  getMockData(type: string): any {
      const common = {
          date: new Date().toLocaleDateString(),
          customer: { name: 'Acme Corp', email: 'billing@acme.com', address: '123 Client Rd' },
          currency: 'USD'
      };
      
      if (type === 'receipt') {
          return { 
              ...common, 
              number: 'RCPT-9988', 
              items: [{ description: 'Monthly Subscription', quantity: 1, rate: 49, amount: 49 }], 
              subtotal: 49, tax: 0, total: 49,
              dueDate: '' // safely defaulting
          };
      }
      if (type === 'estimate') {
           return { ...common, number: 'EST-1001', dueDate: 'Valid for 30 days', items: [{ description: 'Web Development', quantity: 10, rate: 100, amount: 1000 }], subtotal: 1000, tax: 100, total: 1100 };
      }
      
      // Invoice Default
      return { 
          ...common, 
          number: 'INV-00123', 
          dueDate: new Date(Date.now() + 86400000 * 14).toLocaleDateString(),
          items: [
            { description: 'Professional Services', quantity: 10, rate: 150, amount: 1500 },
            { description: 'Software License', quantity: 1, rate: 500, amount: 500 }
        ],
        subtotal: 2000, tax: 200, total: 2200 
      };
  }

  validateConfig(data: any) {
      // Basic validation
      if (data.upsellConfig?.enabled && !data.upsellConfig.coupon) {
          // Warning only or allow empty for now
          // throw new Error('Coupon code is required when upsell is enabled');
      }
      return true;
  }

  /**
   * Extracts brand identity from an uploaded PDF.
   * Currently mocks the AI process or calls n8n if configured.
   */
  async extractFromPdf(userId: string, file: Express.Multer.File) {
      const { storageService } = require('./storage.service'); // Lazy load to avoid circles
      
      // 1. Save file to permanent storage
      const fileUrl = await storageService.saveFile(userId, file.buffer, file.originalname, 'brand-extraction');
      
      // 2. Prepare for Analysis
      // In a real scenario, we would send 'fileUrl' (if public S3) or base64 to n8n/Textract.
      // For now, we return a mock response to simulate the AI engine's output.
      
      // Simulating processing delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Mocked "Extracted" Data
      const extractedBrand = {
          success: true,
          fileUrl,
          analysis: {
              colors: {
                  primary: '#1e3a8a', // Mock Blue
                  secondary: '#64748b', // Mock Slate
                  accent: '#3b82f6'
              },
              fonts: {
                  heading: 'Inter',
                  body: 'Roboto'
              },
              logo_position: 'top-left',
              layout_style: 'modern-clean'
          },
          preview_html: await this.generatePreview(userId) // Re-using existing preview for now
      };

      return extractedBrand;
  }
}

export const brandingService = new BrandingService();
