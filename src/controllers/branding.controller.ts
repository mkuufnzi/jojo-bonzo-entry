import { Request, Response } from 'express';
import { brandingService } from '../services/branding.service';
import { templateRegistry } from '../services/template-registry.service';
import { SmartInvoice } from '../models/smart-documents/smart-invoice.model';
import { smartDocumentService } from '../services/smart-document.service';
import { logger } from '../lib/logger';
import prisma from '../lib/prisma';
import { SmartInvoiceManifest } from '../templates/smart-invoice-v1/manifest';

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



    static async getPreview(req: Request, res: Response) {
      const isPost = req.method === 'POST';
      const nonce = res.locals.nonce; // Extract nonce from locals
      let html = '';
      
      try {
        if (isPost) {
            // Preview ephemeral/unsaved data (from Request Body)
            // This enables "Live Preview" without saving to DB first
            
            // Construct Theme Data from body
            const themeData: any = {
                name: req.body.theme?.name || 'Preview',
                primary: req.body.brandColors?.primary || '#6366F1',
                secondary: req.body.brandColors?.secondary || '#8B5CF6',
                accent: req.body.brandColors?.accent || '#C4B5FD', // Optional if provided
                light: '#F5F3FF', // Static for now
                text: '#1e293b',
                pattern: '', 
                logo: req.body.logoUrl || '⚡', // Use Emoji if no URL for now, or text
                tagline: req.body.tagline || 'Power your workflow.',
                gradient: `linear-gradient(135deg, ${req.body.brandColors?.primary || '#6366F1'} 0%, ${req.body.brandColors?.secondary || '#8B5CF6'} 100%)`
            };

            const config: any = {
                 upsellEnabled: req.body.upsellConfig?.enabled === 'true' || req.body.upsellConfig?.enabled === true,
                 contentConfig: {} // Add more if needed
            };

            // Get Manifest - Dynamic (Support GET via query params)
            const templateId = req.body.templateId || (req.query.templateId as string) || 'smart_invoice_v1';
            const manifest = templateRegistry.getById(templateId) || templateRegistry.getById('smart_invoice_v1')!;

            // Calculate Components State based on Manifest & Input
            const components: any = {};
                  
            // If body has direct components config (New UI), use it
            if (req.body.components) {
                 // console.log('[DEBUG] getPreview: req.body.components present:', JSON.stringify(req.body.components, null, 2));
                 manifest.features.forEach(f => {
                     // Check if passed in body
                     const passed = req.body.components[f.id];
                     if (passed) {
                         components[f.id] = { enabled: passed.enabled === true || passed.enabled === 'true' };
                     } else {
                         // Default enabled if not explicit
                         components[f.id] = { enabled: f.defaultEnabled ?? true };
                     }
                 });
            } else {
                 // console.log('[DEBUG] getPreview: No req.body.components, using legacy/defaults');
                 // Fallback / Legacy behavior
                 manifest.features.forEach(f => {
                      components[f.id] = { enabled: f.defaultEnabled ?? true };
                      // Override for upsell legacy config if it exists
                      if (f.id === 'product_recommendations' && config.upsellEnabled !== undefined) {
                          components[f.id].enabled = config.upsellEnabled;
                      }
                 });
            }

            // Instantiate SmartInvoice Model with MOCK DATA
            const smartInvoice = new SmartInvoice(
                'PREVIEW-123',
                themeData,
                config,
                [], // Items
                [], // Recs
                [], // Tutorials
                [], // Nurture
                {}
            );

            // Mock Data Injection for Thermal Receipt (if applicable)
            if (manifest.type === 'RECEIPT') {
                 smartInvoice.addItem({ id: 1, name: 'Premium Matcha', sku: 'MAT-001', qty: 1, price: 34.50, img: '', category: 'Bev' });
                 smartInvoice.addItem({ id: 2, name: 'Whisk Set', sku: 'ACC-004', qty: 1, price: 29.99, img: '', category: 'Acc' });
            } else {
                 // Classic Invoice / Smart Invoice Mock Items
                 smartInvoice.addItem({ id: 1, name: 'Premium Matcha Powder', sku: 'MAT-001', qty: 2, price: 34.50, img: '🍵', category: 'Beverages' });
                 smartInvoice.addItem({ id: 2, name: 'Ceremonial Whisk Set', sku: 'ACC-004', qty: 1, price: 29.99, img: '🎋', category: 'Accessories' });
                 smartInvoice.addItem({ id: 3, name: 'Glass Serving Bowl', sku: 'GLS-102', qty: 4, price: 18.00, img: '🥣', category: 'Kitchenware' });
            }

            // Determine View Path from Manifest
            const viewPath = manifest?.viewPath || 'templates/invoice/smart-invoice-v1/index';
            
            html = await new Promise((resolve, reject) => {
                 res.render(viewPath, {
                     branding: { 
                        themeData: smartInvoice.theme,
                        config: smartInvoice.config,
                        components,
                        model: smartInvoice.toJSON().data,
                        manifest // Pass manifest for context if needed
                     },
                     nonce, 
                     layout: false 
                 }, (err, str) => {
                     if (err) reject(err);
                     else resolve(str);
                 });
            });

        } else {
             // GET: Fetch existing details from DB
             const userId = (req as any).session.userId;
             const profile = await brandingService.getProfile(userId);
             
             if (profile) {
                  const metadata: any = profile.metadata || {};
                  const colors: any = profile.brandColors || {};
                  
                  const themeData = {
                      name: profile.name || 'Your Brand',
                      primary: colors.primary || '#6366F1',
                      secondary: colors.secondary || '#8B5CF6',
                      accent: colors.accent || '#C4B5FD',
                      light: '#F5F3FF',
                      text: '#1e293b',
                      pattern: '',
                      logo: profile.logoUrl || '⚡',
                      tagline: 'Power your workflow.',
                      gradient: `linear-gradient(135deg, ${colors.primary || '#6366F1'} 0%, ${colors.secondary || '#8B5CF6'} 100%)`
                  };

                  const config = {
                      upsellEnabled: (profile.upsellConfig as any)?.active || false,
                      contentConfig: metadata.contentConfig || {}
                  };

                  // Calculate Components State based on Manifest & Profile
                  const savedComponents = (profile as any).components || {}; // Access the new JSON field

                  const components: any = {};
                  SmartInvoiceManifest.features.forEach(c => {
                        // 1. Start with Default
                        let isEnabled = c.defaultEnabled ?? true;

                        // 2. Override with Saved State if present
                        if (savedComponents[c.id]) {
                            isEnabled = savedComponents[c.id].enabled;
                        }

                        // 3. (Legacy) partial override for upsell if old config exists & no new component state
                        if (c.id === 'product_recommendations' && config.upsellEnabled !== undefined && !savedComponents[c.id]) {
                             isEnabled = config.upsellEnabled;
                        }

                        components[c.id] = { enabled: isEnabled };
                  });

            // Instantiate SmartInvoice Model to ensure consistent structure
            // In a POST (Preview), we don't save to DB yet, but we use the Model logic
            const smartInvoice = new SmartInvoice(
                'preview-id',
                themeData,
                config,
                [], // No items for basic preview unless mocked
                [], // No recs yet
                [], // No tutorials yet
                [], // No nurture yet
                {}
            );

            // Mock Data for Preview if empty - USER REQUEST: 5 Sample Products
            if (smartInvoice.items.length === 0) {
                 smartInvoice.addItem({ id: 1, name: 'Premium Matcha Powder', sku: 'MAT-001', qty: 2, price: 34.50, img: '🍵', category: 'Beverages' });
                 smartInvoice.addItem({ id: 2, name: 'Ceremonial Whisk Set', sku: 'ACC-004', qty: 1, price: 29.99, img: '🎋', category: 'Accessories' });
                 smartInvoice.addItem({ id: 3, name: 'Glass Serving Bowl', sku: 'GLS-102', qty: 4, price: 18.00, img: '🥣', category: 'Kitchenware' });
                 smartInvoice.addItem({ id: 4, name: 'Organic Almond Milk', sku: 'BVG-202', qty: 6, price: 4.50, img: '🥛', category: 'Dairy' });
                 smartInvoice.addItem({ id: 5, name: 'Subscription Box: Zen', sku: 'SUB-ZEN', qty: 1, price: 45.00, img: '📦', category: 'Subscription' });
            }

            if (smartInvoice.recommendations.length === 0) {
                 smartInvoice.recommendations = [
                    { id: 101, name: "Ceremonial Grade Matcha Kit", price: 54.99, img: "🎌", reason: "Pairs perfectly with your Matcha Powder", match: 94, badge: "Best Match", sales: "+340% this month" },
                    { id: 102, name: "MCT Oil Drops", price: 22.99, img: "💧", reason: "Customers who buy Coconut Oil love this", match: 88, badge: "Trending", sales: "Reorder #1 item" },
                    { id: 103, name: "Organic Honey (Raw)", price: 18.99, img: "🍯", reason: "Enhances your Almond Butter smoothies", match: 81, badge: "New", sales: "4.9 ★ rated" },
                    { id: 104, name: "Bamboo Reusable Cups", price: 16.99, img: "🎋", reason: "Complete your matcha ritual sustainably", match: 76, badge: "Eco Pick", sales: "Save the planet" }
                 ];
            }



            // Determine View Path based on Manifest
            // Priorities: 1. Query Param (Live Preview Selection) 2. DB Metadata (Saved State) 3. Default
            const requestedId = (req.query.templateId as string);
            const savedId = metadata?.id; // From fetched profile
            const targetId = requestedId || savedId || 'smart_invoice_v1';
            
            const pManifest = templateRegistry.getById(targetId);
            const viewPath = pManifest?.viewPath || 'templates/invoice/smart-invoice-v1/index';
            
            // Log for debugging
            logger.info({ targetId, viewPath, requestedId }, 'Preview View Lookup');

            html = await new Promise((resolve, reject) => {
                 res.render(viewPath, {
                     branding: { 
                        themeData: smartInvoice.theme,
                        config: smartInvoice.config,
                        components,
                        // Pass the calculated model data
                        model: smartInvoice.toJSON().data 
                     },
                     nonce, 
                     layout: false 
                 }, (err, str) => {
                     if (err) {
                         console.error('Render Error:', err);
                         reject(err);
                     }
                     else resolve(str);
                 });
            });
             } else {
                 // Return default
                 html = await new Promise((resolve, reject) => {
                    res.render('smart-invoice', {
                        branding: { themeData: {}, config: {} },
                        nonce, // Pass nonce
                        layout: false
                    }, (err, str) => {
                        if (err) reject(err);
                        else resolve(str);
                    });
                 });
             }
        }
        
        res.send(html);

      } catch (error: any) {
          res.status(500).send(`Preview Error: ${error.message}`);
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
      logger.error({ err: error }, 'Brand extraction failed');
      res.status(500).json({ error: error.message });
    }
  }

  static async updateSettings(req: Request, res: Response) {
      const userId = (req as any).session.userId;
      
      try {
          const accept = req.headers.accept || '';
          const isJson = req.xhr || accept.indexOf('json') > -1;
          
          logger.info({ userId, body: req.body, isJson }, 'updateSettings called');

          await brandingService.updateProfile(userId, {
              ...req.body,
              // Explicitly capture components
              components: req.body.components 
          });

          if (isJson) {
              return res.json({ success: true });
          }

          // Redirect back to the requesting template page if possible, or default
          const referer = req.get('Referer') || '/dashboard/brand';
          res.redirect(referer);
      } catch (error: any) {
          logger.error({ error, userId }, 'Failed to update brand settings');
          
          const accept = req.headers.accept || '';
          if (req.xhr || accept.indexOf('json') > -1) {
              return res.status(400).json({ error: error.message });
          }
          
          res.redirect('/dashboard/brand?error=update_failed');
      }
  }

  /**
   * Generates a new Document Template using AI
   */
  static async generateTemplate(req: Request, res: Response) {
      // ... existing code ...
      try {
        const userId = (req as any).user.id;
        const { prompt, type } = req.body;
        // ...
        // (Keeping existing logic, just showing context)
        const { templateGenerator } = require('../services/template-generator.service');
        const template = await templateGenerator.generateTemplate(userId, prompt, type || 'invoice');
        
        res.json({ success: true, templateId: template.id });
      } catch (e: any) {
          res.status(500).json({ error: e.message });
      }
  }

  static async getTemplateSource(req: Request, res: Response) {
      try {
          const { id } = req.params;
          if (id.startsWith('custom:')) {
              const realId = id.replace('custom:', '');
              const t = await brandingService.getUserTemplate(realId);
              return res.json({ source: t?.htmlContent || '' });
          }
          // Handle standard templates? For now return placeholder or read file
          return res.json({ source: '<!-- Standard templates are read-only -->' });
      } catch (error: any) {
          res.status(500).json({ error: error.message });
      }
  }

  static async updateTemplateSource(req: Request, res: Response) {
      try {
          const { id } = req.params;
          const { htmlContent } = req.body;
          
          if (!id.startsWith('custom:')) {
              return res.status(403).json({ error: 'Cannot edit standard templates' });
          }

          const realId = id.replace('custom:', '');
          await brandingService.updateUserTemplate(realId, { htmlContent });
          
          res.json({ success: true });
      } catch (error: any) {
          res.status(500).json({ error: error.message });
      }
  }

  static async saveConfig(req: Request, res: Response) {
      try {
          const userId = (req as any).session.userId;
          const { theme, upsellConfig, contentConfig, brandColors } = req.body; // Expecting resolved colors

          // Basic validation or mapping
          // If brandColors not provided, look up from known themes? 
          // For now, assume frontend sends everything required or we merge in service.
          
          const updateData: any = {
              upsellConfig,
              metadata: { themeName: theme, contentConfig } // Storing content config in metadata (or create new field)
          };

          if (brandColors) {
              updateData.brandColors = brandColors;
          }

          await brandingService.updateProfile(userId, updateData);
          res.json({ success: true });
      } catch (error: any) {
          logger.error({ error: error.message }, 'Failed to save branding config');
          res.status(500).json({ error: error.message });
      }
  }

  static async renderPublicInvoice(req: Request, res: Response) {
      try {
          const { id } = req.params;
          
          // 1. Fetch Invoice/Document (Mock for now or fetch by ID)
          // Ideally fetch 'ProcessedDocument' or 'Invoice'
          // For demo, we might fetch a Template to define the 'look' 
          // and use mock content if no real invoice ID exists.
          
          // Let's fetch the BrandingProfile associated with this invoice (via Business)
          // Assuming ID is a "UserTemplate" ID for demo purposes?
          // Or if ID is a transaction ID, look up business -> branding profile.
          
          // DEMO LOGIC:
          // If ID is 'demo', use the first branding profile found for the session user (if logged in) 
          // or a default.
          
          let themeData = {};
          let config = {};
          
          // Attempt to find profile
          // Since this is public, we need a secure way to know WHICH business.
          // Real Implementation: Invoice ID -> Business ID -> Branding Profile
          
          // HARDCODED DEMO FETCH (Safe for now)
          const profile = await (prisma as any).brandingProfile.findFirst({ where: { isDefault: true }});
          
          if (profile) {
              // Resolve Theme Colors from Profile
              // If profile.brandColors is set, use it.
              // If metadata.themeName is set, we might need a Theme Map (which is in Frontend JS).
              // Ideally the Backend should have known the colors.
              
              // We pass the RAW profile and let the view (Alpine) handle defaults if needed, 
              // BUT Alpine needs the 'theme' object structure (primary, secondary, pattern, etc).
              
              // We construct a "Theme Object" based on the profile
              const metadata: any = profile.metadata || {};
              const colors: any = profile.brandColors || {};
              
              themeData = {
                  name: profile.name,
                  primary: colors.primary || '#6366F1',
                  secondary: colors.secondary || '#8B5CF6',
                  accent: colors.accent || '#C4B5FD',
                  light: '#F5F3FF', // We might need to auto-generate this if not stored
                  text: '#1e293b',
                  pattern: '', // TODO: Store pattern in DB
                  logo: '⚡', // TODO: Store logo icon or URL
                  tagline: 'Power your workflow.',
                  gradient: `linear-gradient(135deg, ${colors.primary || '#6366F1'} 0%, ${colors.secondary || '#8B5CF6'} 100%)`
              };

              config = {
                  upsellEnabled: (profile.upsellConfig as any)?.active || false,
                  contentConfig: metadata.contentConfig || {}
              };
          }

          res.render('smart-invoice', {
              branding: {
                  themeData,
                  config
              },
              nonce: res.locals.nonce
          });

      } catch (error: any) {
          logger.error({ error: error.message }, 'Failed to render public invoice');
          res.status(500).send('Error rendering invoice');
      }
  }
}

export const brandingController = new BrandingController();
