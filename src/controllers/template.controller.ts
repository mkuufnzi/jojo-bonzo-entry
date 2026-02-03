import { Request, Response } from 'express';
import { templateRegistry } from '../services/template-registry.service';
import { brandingService } from '../services/branding.service';
import { logger } from '../lib/logger';

export class TemplateController {

    /**
     * Lists all available templates in the registry
     */
    static async listTemplates(req: Request, res: Response) {
        const userId = (req as any).session.userId;
        if (!userId) return res.redirect('/auth/login');

        try {
            // Get user profile to see installed/active templates
            const profile = await brandingService.getProfile(userId);
            const activeTemplateId = profile?.activeTemplateId || 'smart_invoice_v1';

            // Fetch all manifests
            const templates = templateRegistry.getAll();

            res.render('dashboard/templates/index', {
                title: 'Template Library',
                path: '/dashboard/templates',
                user: (req as any).user,
                templates,
                activeService: 'transactional',
                activeTemplateId,
                nonce: res.locals.nonce
            });
        } catch (error) {
            logger.error({ error, userId }, 'Failed to list templates');
            res.status(500).send('Error loading template library');
        }
    }

    /**
     * Activates a specific template for the user's business
     */
    static async activateTemplate(req: Request, res: Response) {
        const userId = (req as any).session.userId;
        const { templateId } = req.body;

        if (!userId) return res.redirect('/auth/login');

        try {
            await brandingService.updateProfile(userId, {
                activeTemplateId: templateId
            });
            
            // Go to configure page for the new template
            res.redirect(`/dashboard/brand?templateId=${templateId}`);
        } catch (error) {
            logger.error({ error, userId }, 'Failed to activate template');
            res.redirect('/dashboard/templates?error=activation_failed');
        }
    }
}
