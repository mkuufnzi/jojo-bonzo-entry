
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
        const { id } = req.params;
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

        const mockData = {
            themeData: { primary: '#0ea5e9', secondary: '#0284c7', accent: '#38bdf8', text: '#0f172a', light: '#f0f9ff', muted: '#94a3b8', pattern: 'radial-gradient(circle, transparent 20%, #f0f9ff 20%, #f0f9ff 80%, transparent 80%, transparent) 0% 0% / 20px 20px' },
            config: { title: `Preview: ${manifest.name}` },
            components: componentConfig, // Injected from Manifest
            company_name: "Acme Corp", // Header Req
            document_number: "INV-2024-001", // Header Req
            issue_date: "2024-02-04", // Header Req
            due_date: "2024-03-04", // Header Req
            model: {
                items: [
                    { id: 1, name: "Premium Widget A", sku: "WID-001", qty: 2, price: 50.00, img: "📦", category: "Hardware" },
                    { id: 2, name: "Service Plan B", sku: "SVC-002", qty: 1, price: 150.00, img: "🔧", category: "Services" }
                ],
                subtotal: 250.00,
                tax: 20.00,
                total: 270.00,
                recommendations: [
                    { id: 101, name: "Maintenance Kit", price: 29.99, img: "🧰" },
                    { id: 102, name: "Extended Warranty", price: 49.99, img: "🛡️" }
                ],
                reviews: [
                    { id: 1, question: "How was the service?", type: "rating" },
                    { id: 2, question: "Upload Photo", type: "upload" }
                ]
            }
        };
        
        const viewPath = templateService.getViewPath(id);
        
        res.render(viewPath, {
            branding: mockData,
            theme: mockData.themeData, // Explicitly pass theme for EJS includes if needed
            title: manifest.name
            // nonce is handled by res.locals
        });
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
