import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { brandingService } from '../services/branding.service';
import { templateRegistry } from '../services/template-registry.service';
import { SmartInvoice } from '../models/smart-documents/smart-invoice.model';
import { smartDocumentService } from '../services/smart-document.service';
import { logger } from '../lib/logger';
import prisma from '../lib/prisma';

/**
 * BrandingController
 * 
 * Part of the Floovioo Transactional Product Suite.
 * Handles the configuration, preview, and rendering of branded documents (invoices, receipts, etc.).
 * Integrates with TemplateRegistryService for manifest-driven architecture.
 * 
 * Architecture Note:
 * - All template resolution must be dynamic via TemplateRegistry.
 * - Views must be resolved using absolute paths from the manifest.viewPath.
 * - No hardcoded view names (e.g. 'smart-invoice') should be used.
 */
export class BrandingController {
  
  static async renderEditor(req: Request, res: Response) {
      try {
          const userId = (req as any).session?.userId;
          if (!userId) return res.redirect('/auth/login');
          
          // Get current profile
          let profile: any = await brandingService.getProfile(userId);
          
          // Get Requested Template ID from query or default
          // Support both 'template' and 'templateId' params
          const requestedId = (req.query.templateId as string) || (req.query.template as string);
          
          // If no specific template requested, use the active one from profile, or default
          let templateId = requestedId || profile?.activeTemplateId || 'smart_invoice_v1';
          let manifest = templateRegistry.getById(templateId);
          let customConfig: any = null;

          // Handle Custom Templates
          if (typeof templateId === 'string' && templateId.startsWith('custom:')) {
              try {
                  const customId = templateId.replace('custom:', '');
                  const userTemplate = await brandingService.getUserTemplate(customId);
                  
                  if (userTemplate) {
                      // Resolve Manifest from Base Template
                      const baseManifest = templateRegistry.getById(userTemplate.baseTemplateId);
                      if (baseManifest) manifest = baseManifest;
                      
                      // Use Custom Config components
                      if (userTemplate.config && typeof userTemplate.config === 'object') {
                          customConfig = userTemplate.config;
                          // Overlay custom components onto profile for the view to render correctly
                          if (customConfig && customConfig.components) {
                              if (profile) {
                                   profile = { 
                                      ...profile, 
                                      components: { ...profile.components, ...customConfig.components } 
                                   };
                              } else {
                                  // Fallback if profile missing
                                  profile = { components: customConfig.components };
                              }
                          }
                      }
                  } else {
                      logger.warn({ customId }, 'Custom UserTemplate not found in DB');
                  }
              } catch (err) {
                  logger.error({ err, templateId }, 'Error loading custom template');
              }
          }

            if (!manifest) {
                logger.warn({ templateId, userId }, 'Template manifest not found. Falling back to default.');
                // Fallback Logic
                templateId = 'smart_invoice_v1';
                manifest = templateRegistry.getById(templateId);
                
                // If even duplicate is missing (catastrophic), throw 404
                if (!manifest) {
                    return res.status(404).send('Standard templates missing from registry.');
                }
            }

            logger.info({ 
                templateId, 
                featureCount: manifest.features?.length, 
                userId,
                isCustom: !!customConfig
            }, 'Rendering Brand Editor');

            res.render('dashboard/brand', {
              title: `Configure ${manifest.name}`,
              activeService: 'transactional', // update activeService to match sidebar
              profile: profile || {},
              manifest,
              features: manifest.features, // Pass features for view
              templates: templateRegistry.getAll(), // Fix: Pass templates list
              user: res.locals.user,
              nonce: res.locals.nonce
          });
      } catch (error: any) {
          logger.error({ error, userId: (req as any).session?.userId }, 'Error rendering brand editor');
          res.status(500).send('Error loading brand configuration');
      }
  }

  static async uploadLogo(req: Request, res: Response) {
      // Basic mock implementation for now to satisfy route
      // Real implementation would use StorageService
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      res.json({ url: 'https://via.placeholder.com/150' });
  }

    static async updateSettings(req: Request, res: Response) {
      try {
          const userId = (req as any).session?.userId;
          if (!userId) return res.redirect('/auth/login');
          
          logger.info({ userId, body: req.body }, '🛠️ [BrandingController] Updating Settings - Payload Received');

          // Check if we are updating a specific Custom UserTemplate
          // The form sends 'activeTemplateId' or we might infer it from 'templates' structure if needed.
          // Ideally, the UI sends `templateId` or `activeTemplateId` in the body.
          // Based on brand.ejs: 'activeTemplateId' is used for profile, BUT verify req.body structure.
          
          // Actually, brand.ejs currently sends: { components: {...}, activeTemplateId: ... }
          // If activeTemplateId is "custom:...", we should update THAT template's config.
          
          const templateId = req.body.activeTemplateId; 
          
           if (typeof templateId === 'string' && templateId.startsWith('custom:')) {
               const customId = templateId.replace('custom:', '');
               
               // Fetch existing to ensure we don't overwrite other config (like theme)
               const existingTemplate = await brandingService.getUserTemplate(customId);
               
               if (existingTemplate) {
                    const currentConfig = (existingTemplate.config as any) || {};
                    const mergedConfig = {
                        ...currentConfig,
                        components: req.body.components // Update components
                    };

                   const updateData = {
                       config: mergedConfig
                   };
                   
                   await brandingService.updateUserTemplate(customId, updateData);
                   
                   // Ensure profile points to this custom template
                   await brandingService.updateProfile(userId, { activeTemplateId: templateId });
               } else {
                   logger.warn({ customId }, 'Attempted to update non-existent UserTemplate');
                   // Fallback: If it doesn't exist, we can't update it. 
                   // Maybe throw error or just update profile? 
                   // Safest to just update profile to avoid breaking flow.
                   await brandingService.updateProfile(userId, { activeTemplateId: templateId });
               }
           } else {
               // Standard Global Profile Update
               await brandingService.updateProfile(userId, req.body);
          }
          
          if (req.xhr || req.headers.accept?.includes('json') || req.query.format === 'json') {
              return res.json({ success: true });
          }
          
          res.redirect('/dashboard/brand?success=true');
      } catch (error: any) {
          logger.error({ error, userId: (req as any).session?.userId }, 'Error updating brand settings');
          res.status(500).send('Error updating settings');
      }
  }

  static async cloneTemplate(req: Request, res: Response) {
      try {
          const userId = (req as any).session?.userId;
          if (!userId) return res.status(401).json({ error: 'Unauthorized' });

          const { sourceId, name } = req.body; // e.g. sourceId='smart_invoice_v1'
          if (!sourceId) return res.status(400).json({ error: 'Source Template ID required' });

          const newTemplate = await brandingService.cloneTemplate(userId, sourceId, name);
          
          // Return the new custom ID so frontend can redirect or select it
          res.json({ success: true, newId: `custom:${newTemplate.id}`, template: newTemplate });

      } catch (error: any) {
          logger.error({ error, userId: (req as any).session?.userId }, 'Error cloning template');
          res.status(500).json({ error: error.message });
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
                 
                 // Inject Mock Recommendations for Smart Invoice feature demo
                 smartInvoice.recommendations = [
                    { id: 101, name: "Ceremonial Grade Matcha Kit", price: 54.99, img: "🎌", reason: "Pairs perfectly with your Matcha Powder", match: 94, badge: "Best Match", sales: "+340% this month" },
                    { id: 102, name: "MCT Oil Drops", price: 22.99, img: "💧", reason: "Customers who buy Coconut Oil love this", match: 88, badge: "Trending", sales: "Reorder #1 item" },
                    { id: 103, name: "Organic Honey (Raw)", price: 18.99, img: "🍯", reason: "Enhances your Almond Butter smoothies", match: 81, badge: "New", sales: "4.9 ★ rated" },
                    { id: 104, name: "Bamboo Reusable Cups", price: 16.99, img: "🎋", reason: "Complete your matcha ritual sustainably", match: 76, badge: "Eco Pick", sales: "Save the planet" }
                 ];
                 smartInvoice.tutorials = [
                    { id: 1, title: "Perfect Matcha Latte", duration: "3 min", type: "recipe", thumb: "🍵", forProduct: "Matcha Powder", steps: [] },
                    { id: 2, title: "Deep Hair Mask", duration: "5 min", type: "tutorial", thumb: "💆", forProduct: "Coconut Oil", steps: [] }
                 ];
            }

            // Determine View Path based on Manifest
            // Priorities: 1. Query Param (Live Preview Selection) 2. DB Metadata (Saved State) 3. Default
            const requestedId = (req.query.templateId as string);
            const metadata: any = {}; // Define in scope for POST
            const savedId = metadata?.id;
            const targetId = requestedId || savedId || 'smart_invoice_v1';
            
            const pManifest = templateRegistry.getById(targetId);
            const viewPath = pManifest?.viewPath || 'templates/invoice/smart-invoice-v1/index';
            
            // Log for debugging
            logger.info({ targetId, viewPath, requestedId }, 'Preview View Lookup');

            html = await new Promise((resolve, reject) => {
                 res.render(viewPath, {
                     branding: { 
                        theme: smartInvoice.theme, // Expose as theme (Generic)
                        themeData: smartInvoice.theme, // Keep legacy
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
                 // GET Request - Initial Load
                 const userId = (req as any).session?.userId;
                 // 1. Resolve Template ID
                 const templateId = (req.query.templateId as string) || 'smart_invoice_v1';
                 const manifest = templateRegistry.getById(templateId) || templateRegistry.getById('smart_invoice_v1');
                 
                 // 2. Resolve View Path
                 const viewPath = manifest?.viewPath || 'templates/invoice/smart-invoice-v1/index';
                 
                 // 3. Fetch Profile & Resolve Custom Config
                 let profile: any = null;
                 let customConfig: any = null;
                 
                 if (userId) {
                     profile = await brandingService.getProfile(userId);
                     
                     if (templateId.startsWith('custom:')) {
                         const customId = templateId.replace('custom:', '');
                         const userTemplate = await brandingService.getUserTemplate(customId);
                         if (userTemplate && userTemplate.config) {
                             customConfig = userTemplate.config;
                         }
                     }
                 }

                 // Construct Default Defaults
                 const themeData: any = {
                    name: 'Default',
                    primary: '#6366F1',
                    secondary: '#8B5CF6',
                    accent: '#C4B5FD',
                    light: '#F5F3FF',
                    text: '#1e293b', 
                    logo: '⚡',
                    tagline: 'Power your workflow.',
                    gradient: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)'
                 };
                 // Override with profile values if available
                 if (profile && profile.brandColors) {
                     themeData.primary = profile.brandColors.primary || themeData.primary;
                     themeData.secondary = profile.brandColors.secondary || themeData.secondary;
                     // ... map others if needed
                 }

                 // Mock items for initial view
                 const smartInvoice = new SmartInvoice(
                    'PREVIEW-GET', 
                    themeData, 
                    { upsellEnabled: true, contentConfig: {} }, 
                    [], [], [], [], {}
                 );
                 if (manifest?.type === 'RECEIPT') {
                     smartInvoice.addItem({ id: 1, name: 'Premium Matcha', sku: 'MAT-001', qty: 1, price: 34.50, img: '', category: 'Bev' });
                 } else {
                     smartInvoice.addItem({ id: 1, name: 'Premium Matcha Powder', sku: 'MAT-001', qty: 2, price: 34.50, img: '🍵', category: 'Beverages' });
                 }

                 // Fetch Default Features & Merge with Saved Profile OR Custom Config
                 const components: any = {};
                 if (manifest) {
                    manifest.features.forEach(f => {
                         // Default from manifest
                         let enabled = f.defaultEnabled ?? true;
                         
                         // Priority 1: Custom Template Config
                         if (customConfig && customConfig.components && customConfig.components[f.id]) {
                              enabled = customConfig.components[f.id].enabled;
                         } 
                         // Priority 2: Global Profile Override (if not custom)
                         else if (profile && profile.components && profile.components[f.id]) {
                             enabled = profile.components[f.id].enabled;
                         }
                         
                         components[f.id] = { enabled };
                    });
                 }
                 
                 logger.info({ 
                     userId, 
                     viewPath, 
                     components, 
                     profileFeatures: profile?.components,
                     customConfig
                 }, '🛠️ [BrandingController] Preview Render - Final Components State');

                 // 4. Render View
                 html = await new Promise((resolve, reject) => {
                    res.render(viewPath, {
                        branding: { 
                            theme: themeData, // Expose as theme
                            themeData: themeData, 
                            config: {},
                            components,
                            model: smartInvoice.toJSON().data
                        },
                        nonce, 
                        layout: false
                    }, (err, str) => {
                        if (err) {
                             logger.error({ error: err, viewPath }, 'Render Error (GET)');
                             reject(err);
                        }
                        else resolve(str);
                    });
                 });
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
          logger.error({ error, userId }, 'Error processing PDF');
          res.status(500).json({ error: 'Extraction failed' });
      }
  }

  static async renderPublicInvoice(req: Request, res: Response) {
      // Placeholder for public invoice rendering
       try {
          const { id } = req.params;
          // Logic to fetch invoice by ID or Token and render it publicly
          res.send(`Public Invoice: ${id}`);
      } catch (error) {
           res.status(500).send('Error rendering public invoice');
      }
  }

  static async saveConfig(req: Request, res: Response) {
      try {
          const userId = (req as any).session?.userId;
          if (!userId) return res.status(401).json({ error: 'Unauthorized' });

          const { templateId, config, theme } = req.body;

          // Save to profile
          await brandingService.updateProfile(userId, {
              activeTemplateId: templateId,
              theme,
              // We might need to store component config separately or part of a larger object
              // For now, assuming updateProfile handles a merge or we need a specific method
          });
          
          // Also persist specific template config if needed
          // await brandingService.saveTemplateConfig(userId, templateId, config);

          res.json({ success: true });
      } catch (error: any) {
          logger.error({ error, userId: (req as any).session?.userId }, 'Error saving brand config');
          res.status(500).json({ error: 'Failed to save configuration' });
      }
  }

  static async generateTemplate(req: Request, res: Response) {
      try {
           const userId = (req as any).session?.userId;
          if (!userId) return res.status(401).json({ error: 'Unauthorized' });

          const { templateId } = req.body; // Data usually comes from the source editor or a preview action
          // const { data } = req.body; // Unused for now

          // 1. Get Manifest
          const manifest = templateRegistry.getById(templateId);
          if (!manifest) return res.status(404).json({ error: 'Template not found' });

          // 2. Render HTML (Re-use logic or call internal helper)
           // For now, we accept HTML directly if provided, or render it.
           // Ideally, we render from data.
           // impl TBD - simplified response for now to pass compilation
           res.json({ success: true, message: "Template generation logic to be implemented with PdfService" }); 

      } catch (error: any) {
          logger.error({ error }, 'Error generating template');
          res.status(500).json({ error: 'Generation failed' });
      }
  }

  static async getTemplateSource(req: Request, res: Response) {
      try {
          const { id } = req.params;
          const manifest = templateRegistry.getById(id);
          if (!manifest || !manifest.viewPath) return res.status(404).send('Template not found');

          // Resolve absolute path from viewPath
          // viewPath is like "templates/invoice/smart-invoice-v1/index"
          // We need to map this back to the file system.
          // Assuming views dir is standard.
          const viewsDir = path.join(__dirname, '../views');
          const filePath = path.join(viewsDir, manifest.viewPath + '.ejs');

          if (!fs.existsSync(filePath)) return res.status(404).send('Source file not found');

          const content = fs.readFileSync(filePath, 'utf-8');
          res.type('text/plain').send(content);
      } catch (error: any) {
          logger.error({ error }, 'Error getting template source');
          res.status(500).send('Error retrieving source');
      }
  }

  static async updateTemplateSource(req: Request, res: Response) {
      try {
          const { id } = req.params;
          const { content } = req.body;
          
          // Security Check: Only allow if dev mode or similar? 
          // For this tool, we assume it's allowed for the user.
          
          const manifest = templateRegistry.getById(id);
          if (!manifest || !manifest.viewPath) return res.status(404).json({ error: 'Template not found' });

          const viewsDir = path.join(__dirname, '../views');
          const filePath = path.join(viewsDir, manifest.viewPath + '.ejs');

          fs.writeFileSync(filePath, content, 'utf-8');
          
          res.json({ success: true });
      } catch (error: any) {
          logger.error({ error }, 'Error updating template source');
          res.status(500).json({ error: 'Update failed' });
      }
  }
}
