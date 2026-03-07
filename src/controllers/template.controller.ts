
import { Request, Response } from 'express';
import path from 'path';
import { TemplateService } from '../services/template-service';
import { templateRegistry } from '../services/template-registry.service';
import { brandingService } from '../services/branding.service';

const templateService = new TemplateService(path.join(process.cwd(), 'src/public/templates'));

export class TemplateController {
    
    static async listTemplates(req: Request, res: Response) {
        try {
            const userId = (req as any).session?.userId;
            if (!userId) return res.redirect('/auth/login');
            
            // Get user's branding profile to determine active template
            const profile = await brandingService.getProfile(userId);
            const activeTemplateId = profile?.activeTemplateId || 'smart_invoice_v1';
            
            // Get all templates from registry
            const templates = templateRegistry.getAll();
            
            res.render('dashboard/templates/index', {
                title: 'Template Library',
                activeService: 'transactional',
                user: res.locals.user,
                templates,
                activeTemplateId,
                nonce: res.locals.nonce
            });
        } catch (error: any) {
            console.error('Error listing templates:', error);
            res.status(500).send('Error loading template library');
        }
    }

    static async renderPreview(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const userId = (req as any).session?.userId || res.locals?.user?.id;
            const manifest = await templateService.getTemplate(id);

            if (!manifest) {
                return res.status(404).send('Template not found');
            }

            const validation = templateService.validateTemplate(manifest);
            if (!validation.isValid) {
                 return res.status(500).send(`Template Invalid: ${validation.errors.join(', ')}`);
            }

            // Transform manifest features (boolean) to Component Config (object)
            const componentConfig: Record<string, { enabled: boolean }> = {};
            if (manifest.features) {
                Object.entries(manifest.features).forEach(([key, enabled]) => {
                    componentConfig[key] = { enabled: !!enabled };
                });
            }

            let profileData: any = null;
            let themeData: any = null;
            let invoiceData: any = null;

            if (userId) {
                profileData = await brandingService.getProfile(userId);
                themeData = profileData?.themeSettings || {
                     primary: '#0ea5e9', secondary: '#0284c7', accent: '#38bdf8', text: '#0f172a', light: '#f0f9ff', muted: '#94a3b8' 
                };

                const user = res.locals.user;
                const businessId = user?.businessId || user?.business?.id;
                
                if (businessId) {
                    const { unifiedDataService } = await import('../modules/unified-data/unified-data.service');
                    const recentInvoices = await unifiedDataService.getUnifiedInvoices(businessId, 1, 1);
                    if (recentInvoices && recentInvoices.length > 0) {
                        invoiceData = recentInvoices[0];
                    }
                }
            }

            // Provide fallback layout if no real data found
            const brandingPayload = {
                themeData: themeData || { primary: '#0ea5e9', secondary: '#0284c7', accent: '#38bdf8', text: '#0f172a', light: '#f0f9ff', muted: '#94a3b8' },
                config: { title: `Preview: ${manifest.name}` },
                components: componentConfig,
                company_name: profileData?.brandName || "Your Company",
                document_number: invoiceData?.invoiceNumber || invoiceData?.externalId || "INV-001",
                issue_date: invoiceData?.issuedDate ? new Date(invoiceData.issuedDate).toLocaleDateString() : new Date().toLocaleDateString(),
                due_date: invoiceData?.dueDate ? new Date(invoiceData.dueDate).toLocaleDateString() : new Date().toLocaleDateString(),
                model: {
                    items: invoiceData?.items || [],
                    subtotal: invoiceData?.amount || 0,
                    tax: 0,
                    total: invoiceData?.amount || 0,
                    recommendations: [],
                    reviews: []
                }
            };
            
            const viewPath = templateService.getViewPath(id);
            
            res.render(viewPath, {
                branding: brandingPayload,
                theme: brandingPayload.themeData,
                title: manifest.name
            });
        } catch (error: any) {
            console.error('Error rendering template preview:', error);
            res.status(500).send('Error rendering template preview');
        }
    }

    static async activateTemplate(req: Request, res: Response) {
        try {
            const userId = (req as any).session?.userId;
            if (!userId) return res.redirect('/auth/login');
            
            const { templateId } = req.body;
            if (!templateId) {
                return res.status(400).send('Missing templateId');
            }
            
            // Update user's branding profile with new active template
            await brandingService.updateProfile(userId, { activeTemplateId: templateId });
            
            // Redirect back to templates page
            res.redirect('/dashboard/templates');
        } catch (error: any) {
            console.error('Error activating template:', error);
            res.status(500).send('Error activating template');
        }
    }
}
