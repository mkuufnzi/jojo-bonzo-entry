import { Request, Response, NextFunction } from 'express';
import { UsageService } from '../services/usage.service';
import prisma from '../lib/prisma';
import { logger } from '../lib/logger';
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
            const planLimit = (user as any)?.subscription?.plan?.documentLimit || 0;

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

    static async dashboardTransactional(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = (req.session as any).userId;
            const { user } = await usageService.getDashboardStats(userId);
            
            // Inject Transactional Analytics Core
            const { transactionalAnalyticsService } = await import('../services/transactional-analytics.service');
            const [volumeTrend, successRatio, latencyTrend] = await Promise.all([
                transactionalAnalyticsService.getVolumeTrend(userId, 30),
                transactionalAnalyticsService.getSuccessRatio(userId),
                transactionalAnalyticsService.getLatencyTrend(userId, 14)
            ]);
        
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
                // businessMetrics calculation removed as it expects fields that may not exist
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
        const hasStartedOnboarding = !!business && (business.currentOnboardingStep || 0) >= 1;

        // [REVENUE MACHINE] Fetch Branding History & Recovery Opportunities
        const { dunningService } = await import('../services/dunning.service');
        
        // 1. Fetch Real Blueprints (UserTemplates)
        const activeBlueprints = business ? await prisma.userTemplate.findMany({
            where: { businessId: business.id },
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

        console.log(`[Dashboard Debug] Found ${processedLogs.length} processed logs.`);
        console.log(`[Dashboard Debug] Extracted External IDs:`, processedExternalIds);
        
        // 3. Fetch Branded Documents (History)
        // [ARCHITECTURE] We join UsageLogs with ExternalDocuments to get financial data

        const brandingHistory = isReady ? await prisma.externalDocument.findMany({
            where: { 
                businessId: business.id, 
                externalId: { in: processedExternalIds as string[] }
            },
            orderBy: { syncedAt: 'desc' },
            take: 10
        }) : [];

        console.log(`[Dashboard Debug] Branding History Count: ${brandingHistory.length}`);
        if (brandingHistory.length > 0) {
            console.log(`[Dashboard Debug] Sample History Item:`, JSON.stringify(brandingHistory[0].normalized).substring(0, 100));
        }

        // 4. Calculate Real Total Revenue
        console.log(`[Dashboard Debug] Calculating revenue from ${brandingHistory.length} documents.`);
        const totalRevenue = brandingHistory.reduce((sum, doc) => {
            const normalized = doc.normalized as any;
            const amount = normalized?.total || normalized?.amount || 0;
            return sum + Number(amount);
        }, 0);

        console.log(`[Dashboard Debug] Total Revenue Calculated: $${totalRevenue}`);
        console.log(`[Dashboard Debug] Total Processed Count: ${processedLogs.length}`);

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
            transactionalAnalytics: { 
                volumeTrend: volumeTrend || [], 
                successRatio: successRatio || [], 
                latencyTrend: latencyTrend || [] 
            },
            title: 'Transactional Branding',
            activeService: 'transactional',
            recentLogs: processedLogs, 
            stats,
            nonce: res.locals.nonce
        });
        } catch (error) {
            console.error('[DashboardController.dashboardTransactional] Fatal Error:', error);
            // Also log the stack securely
            console.error((error as any).stack);
            next(error);
        }
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

    static async dashboardRetentionTriggers(req: Request, res: Response) {
        let userId = (req.session as any)?.userId;
        let user: any = null;
        if (userId) {
             user = await prisma.user.findUnique({ where: { id: userId } });
        }
        res.render('dashboard/services/retention', { 
            user, 
            title: 'Retention Triggers', 
            activeService: 'retention',
            nonce: res.locals.nonce || ''
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
        // [V2 MIGRATION] This route is still used by legacy links, but UI links now point to /dashboard/brand
        const userId = (req.session as any).userId;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        res.render('dashboard/services/templates', { 
            user, 
            title: 'Templates', 
            activeService: 'transactional',
            nonce: res.locals.nonce
        });
    }

    static async dashboardTransactionalTemplatesLegacy(req: Request, res: Response) {
        const userId = (req.session as any).userId;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        res.render('dashboard/services/templates', { 
            user, 
            title: 'Legacy Templates', 
            activeService: 'transactional',
            nonce: res.locals.nonce
        });
    }

    static async dashboardTransactionalApi(req: Request, res: Response) {
        // Just reuse the apps logic or redirect
        return DashboardController.apps(req, res);
    }

    // --- Unified Data Dashboard ---
    static async dashboardUnified(req: Request, res: Response) {
        console.log(`\n\n[DASHBOARD UNIFIED] Route Hit! Session User:`, res.locals.user?.email, res.locals.user?.id);
        
        try {
            const user = res.locals.user;
            if (!user?.id) {
                console.log(`[DASHBOARD UNIFIED] No User ID, redirecting to login`);
                return res.redirect('/auth/login');
            }

            // Fetch ALL integrations (not filtered by status) so Sources count is accurate
            console.log(`[DASHBOARD UNIFIED] Resolving business context...`);
            const business = await (DashboardController as any).resolveBusinessContext(user, { integrations: true });
            console.log(`[DASHBOARD UNIFIED] Resolved Business:`, business ? business.id : 'NULL');
            
            console.log(`[DASHBOARD UNIFIED] Importing services...`);
            const { unifiedDataService } = await import('../modules/unified-data/unified-data.service');
            const { unifiedAnalyticsService } = await import('../modules/unified-data/unified-analytics.service');
            
            let stats = { totalCustomers: 0, totalOrders: 0, totalInvoices: 0, totalRevenue: 0, outstandingBalance: 0, totalPaid: 0 };
            let recentTransactions: any[] = [];
            let integrations: any[] = business?.integrations || [];
            
            let analyticsTrend: any[] = [];
            let topCustomers: any[] = [];
            let salesBySource: any[] = [];

            if (business) {
                console.log(`[UnifiedDashboard] Resolved businessId=${business.id} for user=${user.email} (user.businessId=${user.businessId})`);
                
                // Core Scalar Stats
                stats = await unifiedDataService.getUnifiedBusinessStats(business.id).catch(e => {
                    console.error('[UnifiedDashboard] Stats Error:', e.message);
                    return { totalInvoices: 0, totalCustomers: 0, totalOrders: 0, totalRevenue: 0, outstandingBalance: 0, totalPaid: 0 };
                }) as any;
                
                recentTransactions = await unifiedDataService.getUnifiedInvoices(business.id, 1, 10).catch(e => {
                    console.error('[UnifiedDashboard] Invoices Error:', e.message);
                    return [];
                });
                
                // Advanced Time-Series Engine Stats
                const revenueTrend = await unifiedAnalyticsService.getRevenueTrend(business.id, 30).catch(e => {
                    console.error('[UnifiedDashboard] Revenue Trend Error:', e.message);
                    return [];
                });
                
                const customers = await unifiedAnalyticsService.getTopCustomers(business.id, 5).catch(e => {
                    console.error('[UnifiedDashboard] Top Customers Error:', e.message);
                    return [];
                });
                
                salesBySource = await unifiedAnalyticsService.getSalesBySource(business.id).catch(e => {
                    console.error('[UnifiedDashboard] Sales By Source Error:', e.message);
                    return [];
                });
                
                analyticsTrend = revenueTrend;
                topCustomers = customers;

                console.log(`[UnifiedDashboard] Analytics Data Success. Trend Length: ${revenueTrend.length}, Top Customers: ${customers.length}, Sources: ${salesBySource.length}`);
            } else {
                console.warn(`[UnifiedDashboard] ⚠️ Business is null for user=${user.email} (user.businessId=${user.businessId})`);
            }


            // Direct assignment to res.locals to ensure ejs-mate preserves it
            res.locals.stats = stats;
            res.locals.recentTransactions = recentTransactions;
            res.locals.integrations = integrations;
            res.locals.analytics = { revenueTrend: analyticsTrend, topCustomers, salesBySource };
            res.locals.salesBySource = salesBySource;

            res.render('dashboard/services/unified/index', { 
                ...res.locals,
                locals: res.locals,
                user, 
                business,
                title: 'Unified Data Hub', 
                activeService: 'unified',
                nonce: res.locals.nonce
            });
        } catch (err: any) {
            logger.error({ err }, '[UnifiedDashboard] Fatal error');
            res.status(500).render('error', { message: 'Failed to load Unified Dashboard', error: err });
        }
    }

    static async dashboardUnifiedSources(req: Request, res: Response) {
        try {
            const user = res.locals.user;
            if (!user?.id) return res.redirect('/auth/login');

            const business = await (DashboardController as any).resolveBusinessContext(user, { 
                integrations: true,
                unifiedSyncJobs: {
                    orderBy: { startedAt: 'desc' },
                    take: 10
                }
            });

            res.render('dashboard/services/unified/sources', {
                ...res.locals,
                locals: res.locals,
                user,
                business,
                title: 'Data Sources & Sync',
                activeService: 'unified',
                integrations: business?.integrations || [],
                syncJobs: (business as any)?.unifiedSyncJobs || [],
                nonce: res.locals.nonce
            });
        } catch (err: any) {
            res.status(500).render('error', { message: 'Failed to load sources', error: err });
        }
    }

    static async syncIntegration(req: Request, res: Response) {
        try {
            const user = res.locals.user;
            const { integrationId } = req.params;
            const businessId = user.businessId || user.business?.id;

            if (!businessId) return res.status(400).json({ error: 'Business context missing' });

            const { unifiedDataService } = await import('../modules/unified-data/unified-data.service');
            const result = await unifiedDataService.syncIntegrationData(businessId, integrationId);

            res.json({ success: true, recordsSynced: result });
        } catch (err: any) {
            console.error('[SyncAPI] Error:', err.message);
            res.status(500).json({ error: err.message });
        }
    }

    static async dashboardUnifiedCustomers(req: Request, res: Response) {
        try {
            const user = res.locals.user;
            if (!user?.id) return res.redirect('/auth/login');

            const business = await (DashboardController as any).resolveBusinessContext(user, {
                integrations: { where: { status: 'connected' } }
            });

            let customers: any[] = [];
            const sourceFilter = req.query.source as string;
            const connectedIntegrations = business?.integrations || [];

            if (business) {
                console.log(`[UnifiedCustomers] ✅ Business: ${business.id} | Source: ${sourceFilter || 'ALL'}`);
                const { unifiedDataService } = await import('../modules/unified-data/unified-data.service');
                customers = await unifiedDataService.getUnifiedCustomers(business.id, 1, 100, { source: sourceFilter });
            }

            // Direct assignment to res.locals to ensure ejs-mate preserves it
            res.locals.unifiedCustomers = customers;
            res.locals.customers = customers;
            res.locals.connectedIntegrations = connectedIntegrations;
            res.locals.sourceFilter = sourceFilter;

            console.log(`[UnifiedCustomers] Rendering with ${customers.length} customers. Locals keys: ${Object.keys(res.locals).join(', ')}`);

            res.render('dashboard/services/unified/customers', { 
                ...res.locals,
                locals: res.locals, // [DIAGNOSTIC] Pass locals explicitly
                user, 
                business,
                title: 'Unified Customers', 
                activeService: 'unified',
                nonce: res.locals.nonce
            });
        } catch (err: any) {
            console.log(`[UnifiedCustomers] ❌ Error: ${err.message}`);
            res.status(500).render('error', { message: 'Failed to load customers', error: err });
        }
    }

    static async dashboardUnifiedTransactions(req: Request, res: Response) {
        try {
            const user = res.locals.user;
            if (!user?.id) return res.redirect('/auth/login');

            const business = await (DashboardController as any).resolveBusinessContext(user, {
                integrations: { where: { status: 'connected' } }
            });

            let orders: any[] = [];
            let invoices: any[] = [];
            let payments: any[] = [];
            let estimates: any[] = [];
            const sourceFilter = req.query.source as string;
            const connectedIntegrations = business?.integrations || [];

            if (business) {
                console.log(`[UnifiedTransactions] ✅ Business: ${business.id} | Source: ${sourceFilter || 'ALL'}`);
                const { unifiedDataService } = await import('../modules/unified-data/unified-data.service');
                orders = await unifiedDataService.getUnifiedOrders(business.id, 1, 50, { source: sourceFilter });
                invoices = await unifiedDataService.getUnifiedInvoices(business.id, 1, 50, { source: sourceFilter });
                payments = await unifiedDataService.getUnifiedPayments(business.id, 1, 50, { source: sourceFilter });
                estimates = await unifiedDataService.getUnifiedEstimates(business.id, 1, 50, { source: sourceFilter });
                console.log(`[UnifiedTransactions] Found: ${orders.length} orders, ${invoices.length} invoices, ${payments.length} payments, ${estimates.length} estimates`);
            } else {
                console.log(`[UnifiedTransactions] ❌ Business: NULL`);
            }

            res.render('dashboard/services/unified/transactions', { 
                user, 
                business,
                title: 'Unified Transactions', 
                activeService: 'unified',
                unifiedOrders: orders,
                unifiedInvoices: invoices,
                unifiedPayments: payments,
                unifiedEstimates: estimates,
                orders,
                invoices,
                payments,
                estimates,
                connectedIntegrations,
                sourceFilter,
                nonce: res.locals.nonce,
                renderTime: new Date().toISOString()
            });
        } catch (err: any) {
            console.log(`[UnifiedTransactions] ❌ Error: ${err.message}`);
            res.status(500).render('error', { message: 'Failed to load transactions', error: err });
        }
    }

    static async dashboardUnifiedInvoices(req: Request, res: Response) {
        console.log(`\n[DASHBOARD INVOICES] ====== ROUTE HIT ======`);
        try {
            const user = res.locals.user;
            console.log(`[DASHBOARD INVOICES] User: ${user?.email}, user.id: ${user?.id}, user.businessId: ${user?.businessId}`);
            if (!user?.id) return res.redirect('/auth/login');
            const business = await (DashboardController as any).resolveBusinessContext(user, {
                integrations: { where: { status: 'connected' } }
            });
            console.log(`[DASHBOARD INVOICES] Business resolved: ${business?.id || 'NULL'}`);
            const sourceFilter = req.query.source as string;
            const connectedIntegrations = business?.integrations || [];

            let invoices: any[] = [];
            if (business) {
                const { unifiedDataService } = await import('../modules/unified-data/unified-data.service');
                invoices = await unifiedDataService.getUnifiedInvoices(business.id, 1, 100, { source: sourceFilter });
                console.log(`[DASHBOARD INVOICES] ✅ Fetched ${invoices.length} invoices for business ${business.id}`);
            } else {
                console.log(`[DASHBOARD INVOICES] ❌ No business context - cannot fetch invoices`);
            }

            console.log(`[DASHBOARD INVOICES] Final Render - Invoices count: ${invoices.length}`);
            
            // Direct assignment to res.locals to ensure ejs-mate preserves it
            res.locals.unifiedInvoices = invoices;
            res.locals.invoices = invoices;
            res.locals.connectedIntegrations = connectedIntegrations;
            res.locals.sourceFilter = sourceFilter;

            console.log(`[DASHBOARD INVOICES] Rendering with ${invoices.length} invoices. Locals keys: ${Object.keys(res.locals).join(', ')}`);

            res.render('dashboard/services/unified/invoices', { 
                ...res.locals,
                locals: res.locals,
                user, 
                business,
                title: 'Unified Invoices', 
                activeService: 'unified',
                nonce: res.locals.nonce,
                renderTime: new Date().toISOString()
            });
        } catch (err: any) {
            console.error(`[DASHBOARD INVOICES] ❌ FATAL ERROR:`, err.message, err.stack);
            res.status(500).render('error', { message: 'Failed to load invoices', error: err });
        }
    }

    static async dashboardUnifiedOrders(req: Request, res: Response) {
        try {
            const user = res.locals.user;
            if (!user?.id) return res.redirect('/auth/login');
            const business = await (DashboardController as any).resolveBusinessContext(user, {
                integrations: { where: { status: 'connected' } }
            });
            const sourceFilter = req.query.source as string;
            const connectedIntegrations = business?.integrations || [];

            console.log(`[DASHBOARD ORDERS] User: ${user.email}, Business: ${business?.id}`);

            let orders: any[] = [];
            if (business) {
                const { unifiedDataService } = await import('../modules/unified-data/unified-data.service');
                orders = await unifiedDataService.getUnifiedOrders(business.id, 1, 100, { source: sourceFilter });
                console.log(`[DASHBOARD ORDERS] Found ${orders.length} orders`);
            }

            // Direct assignment to res.locals to ensure ejs-mate preserves it
            res.locals.unifiedOrders = orders;
            res.locals.orders = orders;
            res.locals.connectedIntegrations = connectedIntegrations;
            res.locals.sourceFilter = sourceFilter;

            res.render('dashboard/services/unified/orders', { 
                ...res.locals,
                locals: res.locals,
                user, 
                business,
                title: 'Unified Orders', 
                activeService: 'unified',
                nonce: res.locals.nonce,
                renderTime: new Date().toISOString()
            });
        } catch (err: any) {
            res.status(500).render('error', { message: 'Failed to load orders', error: err });
        }
    }

    static async dashboardUnifiedPayments(req: Request, res: Response) {
        try {
            const user = res.locals.user;
            if (!user?.id) return res.redirect('/auth/login');
            const business = await (DashboardController as any).resolveBusinessContext(user, {
                integrations: { where: { status: 'connected' } }
            });
            const sourceFilter = req.query.source as string;
            const connectedIntegrations = business?.integrations || [];

            console.log(`[DASHBOARD PAYMENTS] User: ${user.email}, Business: ${business?.id}`);

            let payments: any[] = [];
            if (business) {
                const { unifiedDataService } = await import('../modules/unified-data/unified-data.service');
                payments = await unifiedDataService.getUnifiedPayments(business.id, 1, 100, { source: sourceFilter });
                console.log(`[DASHBOARD PAYMENTS] Found ${payments.length} payments`);
            }

            // Direct assignment to res.locals to ensure ejs-mate preserves it
            res.locals.unifiedPayments = payments;
            res.locals.payments = payments;
            res.locals.connectedIntegrations = connectedIntegrations;
            res.locals.sourceFilter = sourceFilter;

            res.render('dashboard/services/unified/payments', { 
                ...res.locals,
                locals: res.locals,
                user, 
                business,
                title: 'Unified Payments', 
                activeService: 'unified',
                nonce: res.locals.nonce,
                renderTime: new Date().toISOString()
            });
        } catch (err: any) {
            res.status(500).render('error', { message: 'Failed to load payments', error: err });
        }
    }

    static async dashboardUnifiedInventory(req: Request, res: Response) {
        console.log(`\n[DASHBOARD INVENTORY] ====== ROUTE HIT ======`);
        try {
            const user = res.locals.user;
            console.log(`[DASHBOARD INVENTORY] User: ${user?.email}, user.id: ${user?.id}, user.businessId: ${user?.businessId}`);
            if (!user?.id) return res.redirect('/auth/login');
            const business = await (DashboardController as any).resolveBusinessContext(user, {
                integrations: { where: { status: 'connected' } }
            });
            console.log(`[DASHBOARD INVENTORY] Business resolved: ${business?.id || 'NULL'}`);
            const sourceFilter = req.query.source as string;
            const connectedIntegrations = business?.integrations || [];

            let products: any[] = [];
            if (business) {
                const { unifiedDataService } = await import('../modules/unified-data/unified-data.service');
                products = await unifiedDataService.getUnifiedProducts(business.id, 1, 100, { source: sourceFilter });
                console.log(`[DASHBOARD INVENTORY] ✅ Fetched ${products.length} products for business ${business.id}`);
            } else {
                console.log(`[DASHBOARD INVENTORY] ❌ No business context - cannot fetch products`);
            }

            // Direct assignment to res.locals to ensure ejs-mate preserves it
            res.locals.unifiedProducts = products;
            res.locals.products = products;
            res.locals.connectedIntegrations = connectedIntegrations;
            res.locals.sourceFilter = sourceFilter;

            res.render('dashboard/services/unified/inventory', { 
                ...res.locals,
                locals: res.locals,
                user, 
                business,
                title: 'Unified Inventory', 
                activeService: 'unified',
                nonce: res.locals.nonce,
                renderTime: new Date().toISOString()
            });
        } catch (err: any) {
            console.error(`[DASHBOARD INVENTORY] ❌ FATAL ERROR:`, err.message, err.stack);
            res.status(500).render('error', { message: 'Failed to load inventory', error: err });
        }
    }
    static async dashboardUnifiedCustomerDetail(req: Request, res: Response) {
        try {
            const user = res.locals.user;
            if (!user?.id) return res.redirect('/auth/login');

            const { id } = req.params;
            const business = await (DashboardController as any).resolveBusinessContext(user);

            if (!business) return res.status(404).render('error', { message: 'Business context not found' });

            console.log(`[UnifiedCustomerDetail] ✅ Business: ${business.id}, CustomerId: ${id}`);
            const { unifiedDataService } = await import('../modules/unified-data/unified-data.service');
            const customer = await unifiedDataService.getUnifiedCustomerDetail(business.id, id);

            if (!customer) return res.status(404).render('error', { message: 'Customer not found' });

            res.render('dashboard/services/unified/customer-detail', { 
                ...res.locals,
                locals: res.locals,
                user, 
                business,
                title: `Customer: ${customer.name}`, 
                activeService: 'unified',
                customer,
                nonce: res.locals.nonce
            });
        } catch (err: any) {
            console.log(`[UnifiedCustomerDetail] ❌ Error: ${err.message}`);
            res.status(500).render('error', { message: 'Failed to load customer details', error: err });
        }
    }

    static async syncAllIntegrations(req: Request, res: Response) {
        console.log(`\n[SYNC ALL] ====== TRIGGERED ======`);
        try {
            const user = res.locals.user;
            const businessId = user.businessId || user.business?.id;

            if (!businessId) {
                console.error('[SYNC ALL] ❌ Business context missing');
                return res.status(400).json({ error: 'Business context missing' });
            }

            const business = await prisma.business.findUnique({
                where: { id: businessId },
                include: { integrations: { where: { status: 'connected' } } }
            });

            if (!business || !business.integrations.length) {
                console.warn('[SYNC ALL] ⚠️ No connected integrations found for business:', businessId);
                return res.json({ success: true, message: 'No active integrations to sync', recordsSynced: 0 });
            }

            console.log(`[SYNC ALL] Syncing ${business.integrations.length} integrations for Business ${businessId}`);
            const { unifiedDataService } = await import('../modules/unified-data/unified-data.service');
            
            let totalSynced = 0;
            for (const integration of business.integrations) {
                try {
                    console.log(`[SYNC ALL] -> Syncing ${integration.provider} (${integration.id})`);
                    const count = await unifiedDataService.syncIntegrationData(businessId, integration.id);
                    totalSynced += count;
                } catch (e: any) {
                    console.error(`[SYNC ALL] ❌ Error syncing ${integration.provider}:`, e.message);
                }
            }

            console.log(`[SYNC ALL] ✅ Sync Completed. Total records: ${totalSynced}`);
            res.json({ success: true, recordsSynced: totalSynced });
        } catch (err: any) {
            console.error('[SYNC ALL] ❌ Global Error:', err.message);
            res.status(500).json({ error: err.message });
        }
    }

    /**
     * Helper to resolve business context for the current user.
     * Tries session ID first, then falls back to user relation.
     */
    private static async resolveBusinessContext(user: any, include: any = {}) {
        const businessId = user.businessId || user.business?.id;
        let business: any = null;

        if (businessId) {
            business = await prisma.business.findUnique({
                where: { id: businessId },
                include
            });
        }

        if (!business) {
            // Fallback to searching by user membership
            business = await prisma.business.findFirst({
                where: { users: { some: { id: user.id } } },
                orderBy: { createdAt: 'asc' },
                include
            });
            if (business) {
                console.log(`[DashboardController] Resolved Business via Fallback for ${user.email}: ${business.id}`);
            }
        }

        if (!business) {
            console.warn(`[DashboardController] ❌ FAILED to resolve Business context for User: ${user.email} (ID: ${user.id})`);
        }

        return business;
    }
}
