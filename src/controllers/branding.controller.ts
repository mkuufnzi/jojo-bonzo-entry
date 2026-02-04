import { Request, Response } from 'express';
import { brandingService } from '../services/branding.service';
import { templateRegistry } from '../services/template-registry.service';
import { SmartInvoice } from '../models/smart-documents/smart-invoice.model';
import { smartDocumentService } from '../services/smart-document.service';
import { logger } from '../lib/logger';
import prisma from '../lib/prisma';
import fs from 'fs';
import path from 'path';

export class BrandingController {
  
  static async renderEditor(req: Request, res: Response) {
      try {
          const userId = (req as any).session?.userId;
          if (!userId) return res.redirect('/auth/login');
          
          // Get current profile
          const profile = await brandingService.getProfile(userId);
          
          // Get Requested Template ID from query or default
          // Support both 'template' and 'templateId' params
          const requestedId = (req.query.templateId as string) || (req.query.template as string);
          
          // If no specific template requested, use the active one from profile, or default
          const templateId = requestedId || profile?.activeTemplateId || 'smart_invoice_v1';
                    const manifest = templateRegistry.getById(templateId);

            if (!manifest) {
                logger.warn({ templateId, userId }, 'Template manifest not found');
                return res.status(404).send(`Template not found: ${templateId}`);
            }

            logger.info({ 
                templateId, 
                featureCount: manifest.features?.length, 
                userId 
            }, 'Rendering Brand Editor');

            res.render('dashboard/brand', {
              title: `Configure ${manifest.name}`,
              activeService: 'transactional', // update activeService to match sidebar
              profile: profile || {},
              manifest,
              features: manifest.features, // Pass features for view
              user: res.locals.user,
              nonce: res.locals.nonce
          });
      } catch (error: any) {
          logger.error({ error, userId: (req as any).session?.userId }, 'Error rendering brand editor');
          res.status(500).send('Error loading brand configuration');
      }
  }

  static async updateSettings(req: Request, res: Response) {
      try {
          const userId = (req as any).session?.userId;
          if (!userId) return res.redirect('/auth/login');
          
          await brandingService.updateProfile(userId, req.body);
          
          if (req.xhr || req.headers.accept?.includes('json')) {
              return res.json({ success: true });
          }
          
          res.redirect('/dashboard/brand?success=true');
      } catch (error: any) {
          logger.error({ error, userId: (req as any).session?.userId }, 'Error updating brand settings');
          res.status(500).send('Error updating settings');
      }
  }

  static async saveConfig(req: Request, res: Response) {
      return BrandingController.updateSettings(req, res);
  }

    static async getPreview(req: Request, res: Response) {
      const isPost = req.method === 'POST';
      let html = '';
      
      try {
        const userId = (req as any).session?.userId;
        if (!userId) return res.status(401).send('Unauthorized');

        const nonce = (res.locals as any).nonce || '';
        
        // 1. Get Base Data (Either from Body or DB)
        let themeData: any;
        let config: any;
        let components: any;
        let templateId: string;
        let profile: any;

        // Fetch User Profile as base for both GET and POST
        const dbProfile = await brandingService.getProfile(userId);
        
        // Ensure profile has fallbacks for labels used in templates (companyName, tagline)
        profile = {
            ...(dbProfile || {}),
            companyName: dbProfile?.companyName || (res.locals.user?.business?.name) || 'Your Brand',
            tagline: (dbProfile as any)?.tagline || (dbProfile?.fontSettings as any)?.tagline || 'Building the future of commerce.',
            logoUrl: dbProfile?.logoUrl || null
        };

        if (isPost) {
            // Live Preview from UI State
            // Handle JSON strings from form or direct JSON from fetch
            let bodyComponents: any = {};
            let bodyColors: any = {};
            
            try {
                bodyComponents = typeof req.body.components === 'string' ? JSON.parse(req.body.components) : (req.body.components || {});
                bodyColors = typeof req.body.brandColors === 'string' ? JSON.parse(req.body.brandColors) : (req.body.brandColors || {});
            } catch (e) {
                logger.warn({ error: e, body: req.body }, 'Error parsing live preview state');
            }

            themeData = {
                name: req.body.companyName || profile.companyName,
                primary: bodyColors?.primary || (dbProfile?.brandColors as any)?.primary || '#6366F1',
                secondary: bodyColors?.secondary || (dbProfile?.brandColors as any)?.secondary || '#8B5CF6',
                accent: bodyColors?.accent || (dbProfile?.brandColors as any)?.accent || '#C4B5FD',
                light: bodyColors?.light || '#F5F3FF',
                text: bodyColors?.text || '#1e293b',
                pattern: '', 
                logo: req.body.logoUrl || profile.logoUrl || '⚡',
                logoUrl: req.body.logoUrl || profile.logoUrl,
                tagline: req.body.tagline || profile.tagline,
                gradient: `linear-gradient(135deg, ${bodyColors?.primary || '#6366F1'} 0%, ${bodyColors?.secondary || '#8B5CF6'} 100%)`
            };

            config = {
                 upsellEnabled: req.body.upsellConfig?.enabled === 'true' || req.body.upsellConfig?.enabled === true,
                 contentConfig: {}
            };

            templateId = req.body.templateId || (req.query.templateId as string) || 'smart_invoice_v1';
            
            // Map components from parsed body
            components = {};
            const manifest = templateRegistry.getById(templateId) || templateRegistry.getById('smart_invoice_v1')!;
            
            manifest.features.forEach(f => {
                if (f.required) {
                    components[f.id] = { enabled: true };
                } else {
                    const passed = bodyComponents[f.id];
                    if (passed !== undefined) {
                        components[f.id] = { enabled: passed.enabled === true || String(passed.enabled) === 'true' };
                    } else {
                        components[f.id] = { enabled: f.defaultEnabled ?? true };
                    }
                }
            });
        } else {
            // Initial Load / Refresh - Get from Database
            const savedProfileData = dbProfile || { themeData: {}, config: {}, components: {} };
            
            themeData = {
                name: profile.companyName,
                primary: (dbProfile?.brandColors as any)?.primary || '#6366F1',
                secondary: (dbProfile?.brandColors as any)?.secondary || '#8B5CF6',
                accent: (dbProfile?.brandColors as any)?.accent || '#C4B5FD',
                light: '#F5F3FF',
                text: '#1e293b',
                logo: dbProfile?.logoUrl || '⚡',
                logoUrl: profile.logoUrl,
                tagline: profile.tagline,
                gradient: `linear-gradient(135deg, ${(dbProfile?.brandColors as any)?.primary || '#6366F1'} 0%, ${(dbProfile?.brandColors as any)?.secondary || '#8B5CF6'} 100%)`
            };
            config = savedProfileData.config || {};
            templateId = (req.query.templateId as string) || dbProfile?.activeTemplateId || 'smart_invoice_v1';

            const manifest = templateRegistry.getById(templateId) || templateRegistry.getById('smart_invoice_v1')!;
            components = {};
            const savedComponents = savedProfileData.components || {};
            
            manifest.features.forEach(f => {
                if (f.required) {
                    components[f.id] = { enabled: true };
                } else if (savedComponents[f.id] !== undefined) {
                    components[f.id] = { enabled: savedComponents[f.id].enabled === true };
                } else {
                    components[f.id] = { enabled: f.defaultEnabled ?? true };
                }
            });
        }

        // 2. Resolve Manifest & View
        const manifest = templateRegistry.getById(templateId) || templateRegistry.getById('smart_invoice_v1')!;
        const viewPath = manifest.viewPath || 'templates/invoice/smart-invoice-v1/index';
        
        // 3. Prepare Model Data (Mock)
        const smartInvoice = new SmartInvoice(
            'PREVIEW-123',
            themeData,
            config,
            [], [], [], [], {}
        );

        // SYNCED MOCK DATA: One tutorial for EACH line item
        const items = [
            { id: 1, name: 'Premium Matcha Powder', sku: 'MAT-001', qty: 2, price: 34.50, img: '🍵', category: 'Beverages' },
            { id: 2, name: 'Ceremonial Whisk Set', sku: 'ACC-004', qty: 1, price: 29.99, img: '🎋', category: 'Accessories' },
            { id: 3, name: 'Organic Bamboo Scoop', sku: 'ACC-005', qty: 1, price: 12.00, img: '🥄', category: 'Accessories' }
        ];

        items.forEach(item => smartInvoice.addItem(item));
        
        smartInvoice.recommendations = [
            { id: 101, name: "Ceremonial Grade Matcha Kit", price: 54.99, img: "🎌", reason: "Pairs perfectly with your Matcha Powder", match: 94, badge: "Best Match", sales: "+340% this month" },
            { id: 102, name: "MCT Oil Drops", price: 22.99, img: "💧", reason: "Customers who buy Coconut Oil love this", match: 88, badge: "Trending", sales: "Reorder #1 item" }
        ];
        
        smartInvoice.tutorials = [
            { id: 1, title: "Perfect Matcha Latte", duration: "3 min", type: "recipe", thumb: "🍵", steps: ["Heat milk to 80°C", "Whisk 1 tsp matcha with water", "Combine and enjoy"], forProduct: "Matcha Powder" },
            { id: 2, title: "Whisk Maintenance 101", duration: "2 min", type: "guide", thumb: "🎋", steps: ["Rinse with warm water", "Air dry on holder", "Shape tines occasionally"], forProduct: "Whisk Set" },
            { id: 3, title: "The Perfect Scoop", duration: "1 min", type: "video", thumb: "🥄", steps: ["Level off the powder", "Do not compact", "One scoop per cup"], forProduct: "Bamboo Scoop" }
        ];

        smartInvoice.nurtureMessages = [
            { icon: '💎', headline: 'Join the VIP Club', body: 'Unlock free shipping and 20% off future orders.' },
            { icon: '🌟', headline: 'Thank you!', body: 'Your support helps us bring more sustainable products to you.' }
        ];

        // Adding explicit model data common fields
        const modelData = {
           ...smartInvoice.toJSON().data,
           id: 'INV-PREVIEW-001',
           customerName: 'Valued Customer',
           customerEmail: 'customer@example.com',
           customerAddress: '123 Preview Lane, Suite 100'
        };

        // 4. Render
        html = await new Promise((resolve, reject) => {
             res.render(viewPath, {
                 branding: { 
                    theme: themeData,
                    themeData: themeData, // Compat
                    config,
                    components,
                    profile: profile, // Robust profile
                    model: modelData 
                 },
                 nonce
             }, (err, str) => {
                 if (err) {
                     logger.error({ err, viewPath, templateId }, 'EJS Render Error');
                     reject(err);
                 }
                 else resolve(str);
             });
        });
        
        res.send(html);

      } catch (error: any) {
          logger.error({ error, stack: error.stack, templateId: req.query.templateId }, 'Preview Crash Handler');
          res.status(500).send(`Preview Generation Failed: ${error.message}`);
      }

  }

  static async extract(req: Request, res: Response) {
      if (!req.file) {
          return res.status(400).json({ error: 'No file uploaded' });
      }

      const userId = (req as any).session.userId;
      
      try {
          const result = await brandingService.extractFromPdf(userId, req.file);
          res.json(result);
      } catch (error: any) {
          logger.error({ error, userId }, 'Error processing PDF');
          res.status(500).json({ error: 'Extraction failed' });
      }
  }

  static async generateTemplate(req: Request, res: Response) {
      try {
          res.json({ success: true, message: 'Template generation simulation' });
      } catch (error: any) {
          res.status(500).json({ error: error.message });
      }
  }

  static async getTemplateSource(req: Request, res: Response) {
     try {
         const { id } = req.params;
         const manifest = templateRegistry.getById(id);
         if(!manifest) return res.status(404).json({ error: 'Template not found' });
         
         const viewsDir = path.join(process.cwd(), 'src/views');
         const filePath = path.join(viewsDir, manifest.viewPath + '.ejs');
         
         if(fs.existsSync(filePath)) {
             const source = fs.readFileSync(filePath, 'utf-8');
             res.json({ source });
         } else {
             res.status(404).json({ error: 'Source file not found' });
         }
     } catch(e: any) {
         res.status(500).json({ error: e.message });
     }
  }

  static async updateTemplateSource(req: Request, res: Response) {
     try {
         const { id } = req.params;
         const { htmlContent } = req.body;
         const manifest = templateRegistry.getById(id);
         if(!manifest) return res.status(404).json({ error: 'Template not found' });
         
         const viewsDir = path.join(process.cwd(), 'src/views');
         const filePath = path.join(viewsDir, manifest.viewPath + '.ejs');
         
         fs.writeFileSync(filePath, htmlContent);
         res.json({ success: true });
     } catch(e: any) {
         res.status(500).json({ error: e.message });
     }
  }

  static async cloneTemplate(req: Request, res: Response) {
     try {
         const userId = (req as any).session?.userId;
         if (!userId) return res.status(401).json({ error: 'Unauthorized' });
         
         const { templateId, newName } = req.body;
         const manifest = templateRegistry.getById(templateId);
         if(!manifest) return res.status(404).json({ error: 'Template not found' });
         
         // For now, return success stub - full implementation would copy files
         res.json({ 
             success: true, 
             message: `Template ${manifest.name} cloned as ${newName || 'Copy'}`,
             clonedId: `custom_${Date.now()}`
         });
     } catch(e: any) {
         res.status(500).json({ error: e.message });
     }
  }

  static async uploadLogo(req: Request, res: Response) {
     try {
         const userId = (req as any).session?.userId;
         if (!userId) return res.status(401).json({ error: 'Unauthorized' });
         
         if (!req.file) {
             return res.status(400).json({ error: 'No logo file uploaded' });
         }
         
         // Store the logo - for now, return a placeholder URL
         // Full implementation would upload to S3/CloudStorage
         const logoUrl = `/uploads/logos/${Date.now()}_${req.file.originalname}`;
         
         // Update profile with new logo URL
         await brandingService.updateProfile(userId, { logoUrl });
         
         res.json({ success: true, logoUrl });
     } catch(e: any) {
         logger.error({ error: e, userId: (req as any).session?.userId }, 'Error uploading logo');
         res.status(500).json({ error: e.message });
     }
  }

  static async renderPublicInvoice(req: Request, res: Response) {
     try {
         const { id, token } = req.params;
         const documentId = id || token;
         
         if (!documentId) {
             return res.status(400).send('Document ID required');
         }
         
         // Fetch the document from database
         const document = await prisma.smartDocument.findUnique({
             where: { id: documentId },
             include: { 
                 user: true
             }
         });
         
         if (!document) {
             return res.status(404).render('errors/404', { 
                 message: 'Document not found',
                 nonce: res.locals.nonce
             });
         }
         
         // Get branding profile for the document owner
         const profile = await brandingService.getProfile(document.userId);
         const templateId = profile?.activeTemplateId || 'smart_invoice_v1';
         const manifest = templateRegistry.getById(templateId);
         
         if (!manifest || !manifest.viewPath) {
             return res.status(500).send('Template configuration error');
         }
         
         // Render the public invoice view
         res.render(manifest.viewPath, {
             branding: {
                 themeData: document.theme || {},
                 config: document.config || {},
                 components: profile?.components || {},
                 model: document.data
             },
             document,
             nonce: res.locals.nonce,
             layout: false
         });
     } catch(e: any) {
         logger.error({ error: e }, 'Error rendering public invoice');
         res.status(500).send('Error loading document');
     }
  }
}
