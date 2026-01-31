
import { Request, Response } from 'express';
import { BrandingService } from '../services/branding.service';
import { brandingService } from '../services/branding.service';
import { logger } from '../lib/logger';

export class BrandingController {
  
  static async renderEditor(req: Request, res: Response) {
      const userId = req.session.userId!;
      
      // Get current profile
      const profile = await brandingService.getProfile(userId);
      
      // If no profile exists yet, create a default one implicitly or handle in view
      // But getProfile returns null if no business, so check that
      if (!profile) {
           // Maybe redirect to onboarding if no business?
           // For now assuming business exists from middleware check
           // If business exists but no profile, service.getProfile returns defaults if create logic triggers or null
           // Actually service.getProfile currently returns default/first. 
           // If null, it means no business linked for user usually.
      }

      res.render('dashboard/brand', {
          title: 'Brand Identity',
          activeService: 'transactional',
          profile: profile || {},
          user: res.locals.user,
          nonce: res.locals.nonce
      });
  }

  static async updateSettings(req: Request, res: Response) {
      const userId = req.session.userId!;
      const data = req.body;
      
      try {
          brandingService.validateConfig(data);
          await brandingService.updateProfile(userId, data);
          
          if (req.xhr || req.headers.accept?.includes('json')) {
              return res.json({ success: true });
          }
          res.redirect('/dashboard/brand?success=Branding updated');
      } catch (error: any) {
          if (req.xhr || req.headers.accept?.includes('json')) {
            return res.status(400).json({ error: error.message });
          }
          res.redirect(`/dashboard/brand?error=${encodeURIComponent(error.message)}`);
      }
  }

  static async getPreview(req: Request, res: Response) {
      const isPost = req.method === 'POST';
      let html = '';
      
      try {
        if (isPost) {
            // Preview ephemeral/unsaved data (Not yet implemented in service fully, service currently fetches by ID)
            // But we can create a temporary profile object or mock logic in service.
            // For MVP, lets just Save then Preview? No, that defeats "preview".
            // Let's modify service.generatePreview to accept overrides OR we do simple construction here.
            // Actually, best pattern: Service accepts (profileId, overrides?)
            // Or simpler: We save the profile first via AJAX on change, then request preview. 
            // "Live Preview" usually implies saving state or sending state to render.
            // Let's assume we Save on 'Apply' and Preview fetches saved.
            // OR: We send the config to `generatePreviewFromConfig`.
            // Let's stick to: Update Profile -> Fetch Preview for now to speed up.
            
            // Wait, standard `generatePreview` fetches from DB.
            // Let's just return the service's generation.
            
            // If the user wants to preview *pending* changes, we'd need to pass the body to the service.
            // Let's update the service signature in next step if needed, but for now assuming we save first.
             const userId = req.session.userId!;
             const profile = await brandingService.getProfile(userId);
             const type = req.query.type as string || 'invoice';
             if (profile) {
                 html = await brandingService.generatePreview(profile.id, type);
             }
        } else {
             // GET: Fetch existing
             const userId = req.session.userId!;
             const profile = await brandingService.getProfile(userId);
             const type = req.query.type as string || 'invoice';
             if (profile) {
                 html = await brandingService.generatePreview(profile.id, type);
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

      const userId = req.session.userId!;
      
      try {
          const result = await brandingService.extractFromPdf(userId, req.file);
          res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Brand extraction failed');
      res.status(500).json({ error: error.message });
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
}

export const brandingController = new BrandingController();
