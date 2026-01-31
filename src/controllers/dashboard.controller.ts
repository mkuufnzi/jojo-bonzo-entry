import { Request, Response } from 'express';
import { UsageService } from '../services/usage.service';
import prisma from '../lib/prisma';
import { AppsController } from './apps.controller'; 
import { PaymentController } from './payment.controller';
import { ProfileController } from './profile.controller';
import { AppService } from '../services/app.service';

const usageService = new UsageService();

export class DashboardController {
    static async index(req: Request, res: Response) {
        try {
            const userId = (req.session as any).userId;
            const stats = await usageService.getDashboardStats(userId);
            const user = stats.user;

            // Fetch Subscription & Quota data
            const monthlyUsage = await usageService.getMonthlyUsage(userId);
            const planLimit = (user as any).subscription?.plan?.documentLimit || 0;

            // Fetch Real Service Health
            const serviceStatuses = await usageService.getServicesHealth(userId);
            
            res.render('dashboard/hub', {
                user,
                title: 'Dashboard',
                activeService: 'hub',
                logsCount: stats.logsCount,
                successCount: stats.successCount,
                usageByApp: stats.usageByApp,
                recentLogs: (user as any).logs || [],
                monthlyUsage,
                planLimit,
                serviceStatuses,
                nonce: res.locals.nonce
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Internal Server Error');
        }
    }

    static async apps(req: Request, res: Response) {
        const userId = (req.session as any).userId;
        console.log(`[Dashboard] Loading Apps for user ${userId}`);

        try {
            const appService = new AppService();
            const { user, services } = await appService.getUserAppsOverview(userId);

            console.log(`[Dashboard] Found ${services.length} active services.`);

            res.render('dashboard/apps', { 
                user, 
                title: 'Apps & API Keys', 
                activeService: 'apps', // For sidebar highlighting
                services,
                nonce: res.locals.nonce
            });
        } catch (error) {
            console.error('[Dashboard] Error loading apps:', error);
            res.redirect('/dashboard');
        }
    }

    static async dashboardTransactional(req: Request, res: Response) {
        const userId = (req.session as any).userId;
        const { user } = await usageService.getDashboardStats(userId);
        
        // [LAZY PROVISIONING] Ensure all core services are linked to user's apps
        try {
            const { AppService } = await import('../services/app.service');
            const appService = new AppService();
            await appService.ensureAllServicesLinked(userId);
        } catch (e) {
            console.error('[DashboardController] Failed to auto-link services:', e);
        }
        // Fetch Business Context for Onboarding Status & Analytics
        const business = await prisma.business.findFirst({
            where: { users: { some: { id: userId } } },
            include: {
                integrations: {
                    where: { status: 'connected' },
                    select: { provider: true, status: true }
                },
                brandingProfiles: { where: { isDefault: true } },
                /*
                businessMetrics: {
                    orderBy: { timestamp: 'desc' },
                    take: 1
                }
                */
            } as any
        });

        // Fetch Real Metrics or default to empty
        const metrics = null; // business?.businessMetrics?.[0] || null;

        // Fetch Real Stats for Transactional Category
        const stats = await usageService.getCategoryStats(userId, ['html-to-pdf', 'docx-to-pdf', 'invoice-generator']);
        
        // Dynamic Connectivity Check
        const { integrationService } = await import('../services/integration.service');
        const connectivity = await integrationService.verifyConnectivity(userId);
        
        const recentLogs = await usageService.getServiceLogs(userId, '', ['pdf', 'invoice', 'GENERATE_DOC'], 10); 
        
        // [READINESS CHECK] Check if critical steps were skipped
        const skippedSteps = (business?.metadata as any)?.skippedSteps || [];
        const isIntegrationSkipped = skippedSteps.includes(2) || skippedSteps.includes('integrations');
        const isBrandingSkipped = skippedSteps.includes(3) || skippedSteps.includes('branding');
        
        const isReady = !!business && business.onboardingStatus === 'COMPLETED' && !isIntegrationSkipped;

        // [REVENUE MACHINE] Fetch Branding History & Recovery Opportunities
        const { dunningService } = await import('../services/dunning.service');
        
        // 1. Fetch Real Blueprints (UserTemplates)
        const activeBlueprints = business ? await prisma.userTemplate.findMany({
            where: { businessId: business.id, status: 'active' },
            orderBy: { updatedAt: 'desc' }
        }) : [];

        // 2. Fetch Processed Documents (Successful Branding Logs)
        const processedLogs = await prisma.usageLog.findMany({
            where: { 
                userId, 
                service: { slug: 'transactional-branding' },
                status: 'success'
            },
            include: { service: true },
            orderBy: { createdAt: 'desc' },
            take: 20
        });

        // 3. Branding History: Join successful logs with ExternalDocuments
        // We'll extract externalId from metadata if it exists
        const processedExternalIds = processedLogs
            .map(log => {
                try {
                    const meta = JSON.parse(log.metadata || '{}');
                    return meta.externalId || meta.id;
                } catch (e) { return null; }
            })
            .filter(Boolean);

        const brandingHistory = isReady ? await prisma.externalDocument.findMany({
            where: { 
                businessId: business.id, 
                externalId: { in: processedExternalIds as string[] }
            },
            orderBy: { syncedAt: 'desc' },
            take: 10
        }) : [];

        // 4. Calculate Real Total Revenue
        // Sum revenue in memory for accurate Json access (Prisma cannot aggregate on Json fields directly)
        const totalRevenue = brandingHistory.reduce((sum, doc) => {
            const amount = (doc.normalized as any)?.amount || 0;
            return sum + amount;
        }, 0);

        const processedCount = processedLogs.length;

        const overdueInvoices = isReady ? await dunningService.getOverdueInvoices(business.id) : [];
    
        res.render('dashboard/services/transactional', {
            user,
            business, 
            metrics, 
            connectivity,
            isReady,
            isIntegrationSkipped,
            isBrandingSkipped,
            brandingHistory,
            overdueInvoices,
            activeBlueprints,
            processedCount,
            totalRevenue,
            title: 'Transactional Branding',
            activeService: 'transactional',
            recentLogs: processedLogs, 
            stats,
            nonce: res.locals.nonce
        });
    }

    static async dashboardRetention(req: Request, res: Response) {
        const userId = (req.session as any).userId;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        res.render('dashboard/services/retention', { 
            user, 
            title: 'Customer Retention', 
            activeService: 'retention',
            nonce: res.locals.nonce
        });
    }

    static async dashboardSales(req: Request, res: Response) {
        const userId = (req.session as any).userId;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        res.render('dashboard/services/sales', { 
            user, 
            title: 'Sales Enablement', 
            activeService: 'sales',
            nonce: res.locals.nonce
        });
    }

    static async dashboardContent(req: Request, res: Response) {
        const userId = (req.session as any).userId;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        res.render('dashboard/services/content', { 
            user, 
            title: 'Content Engine', 
            activeService: 'content',
            nonce: res.locals.nonce
        });
    }

    static async showTool(req: Request, res: Response) {
        const { slug } = req.params;
        const userId = (req.session as any).userId;

        try {
            const service = await prisma.service.findUnique({
                where: { slug }
            });

            const user = await prisma.user.findUnique({ where: { id: userId } });

            if (!service) {
                return res.redirect('/dashboard');
            }

            // List of tools that are fully implemented
            const implementedTools = ['html-to-pdf'];

            if (implementedTools.includes(slug)) {
                // Render the actual tool in dashboard context
                // For now, we might re-use the landing tool view or a specific dashboard tool view
                // But the user asked for "coming soon" logic specifically.
                // Let's assume implemented tools have their own routes or views.
                // For this task, I'll focus on the "coming soon" part.
                return res.render('landing/tool', {
                    service,
                    user: true, // It's a logged in user
                    guestApiKey: '', // Not needed for auth user usually, or fetch their app key
                    services: await prisma.service.findMany({ where: { isActive: true } })
                });
            }

            // Not implemented -> Dashboard Coming Soon
            return res.render('dashboard/coming-soon', {
                service,
                user,
                title: 'Coming Soon',
                activeService: 'hub',
                nonce: res.locals.nonce
            });

        } catch (error) {
            console.error(error);
            res.redirect('/dashboard');
        }
    }


    static async billing(req: Request, res: Response) {
        // Reuse logic from PaymentController.index but render dashboard view
        const userId = (req.session as any).userId;
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { subscription: { include: { plan: true } } }
        });

        // We might need to fetch invoices etc. 
        // For now, let's assume we can pass similar data.
        // Ideally we should import the service logic.
        
        res.render('dashboard/billing', { 
            user, 
            title: 'Billing', 
            activeService: 'billing',
             // Mock data or fetch real data - check PaymentController
            invoices: [],
            paymentMethods: [],
            nonce: res.locals.nonce
        });
    }

    static async subscription(req: Request, res: Response) {
         const userId = (req.session as any).userId;
         const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { subscription: { include: { plan: true } } }
        });

        // Fetch usage for "Resource Allocation" display
        const pdfUsage = await usageService.getFeatureUsage(userId, 'pdf_conversion');
        const aiUsage = await usageService.getFeatureUsage(userId, 'ai_generation');
        
        // Fetch recent activity for "Sidebar"
        const dashboardStats = await usageService.getDashboardStats(userId);
        const recentActivity = ((dashboardStats.user as any).logs || []).map((l: any) => ({
            service: l.serviceId || 'System',
            status: l.status,
            time: new Date(l.createdAt).toLocaleDateString()
        }));

        res.render('dashboard/subscription', { 
            user, 
            title: 'Subscription', 
            activeService: 'subscription',
            nonce: res.locals.nonce,
            stats: {
                pdf: { used: pdfUsage, limit: user?.subscription?.plan?.pdfQuota || 1000 },
                ai: { used: aiUsage, limit: user?.subscription?.plan?.aiQuota || 500 } // using aiQuota if available
            },
            analytics: {
                recentActivity
            }
        });
    }

    static async profile(req: Request, res: Response) {
        const userId = (req.session as any).userId;
        const user = await prisma.user.findUnique({ 
            where: { id: userId },
            include: { subscription: { include: { plan: true } } }
         });
         
         // Mock userProfile if missing or fetch from separate table if architecture requires
         // Assuming user model has profile fields or we use a separate profile object
         // For now, passing user as is, view handles locals.userProfile checks
        res.render('dashboard/profile', { 
            user, 
            title: 'Profile', 
            activeService: 'profile',
            userProfile: user, // or fetch profile
            nonce: res.locals.nonce
        });
    }

    static async settings(req: Request, res: Response) {
        const userId = (req.session as any).userId;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        const config = await import('../services/notification.service').then(m => m.notificationService.getSettings(userId));

        res.render('dashboard/settings', { 
            user, 
            title: 'Settings', 
            activeService: 'settings',
            config,
            nonce: res.locals.nonce
        });
    }

    static async dashboardTransactionalTemplates(req: Request, res: Response) {
        const userId = (req.session as any).userId;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        res.render('dashboard/services/templates', { 
            user, 
            title: 'Templates', 
            activeService: 'transactional',
            nonce: res.locals.nonce
        });
    }

    static async dashboardTransactionalApi(req: Request, res: Response) {
        // Just reuse the apps logic or redirect
        return DashboardController.apps(req, res);
    }
}
