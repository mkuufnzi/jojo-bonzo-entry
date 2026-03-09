import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { logger } from '../lib/logger';
import { recommendationService } from '../modules/recommendation/recommendation.service';
import { ServiceSlugs } from '../types/service.types';

export class RecommendationDashboardController {
    /**
     * Proactive Sync Check: Ensures the Unified Data Hub has fresh data 
     * before rendering any recommendation-related dashboard.
     */
    private static async proactiveSyncCheck(businessId: string, userId: string): Promise<boolean> {
        try {
            const { unifiedDataService } = await import('../modules/unified-data/unified-data.service');
            const lastSync = await prisma.unifiedSyncJob.findFirst({
                where: { businessId, status: 'completed' },
                orderBy: { completedAt: 'desc' }
            });

            const isStale = !lastSync || (Date.now() - new Date(lastSync.completedAt!).getTime() > 1000 * 60 * 60); // 1 hour stale
            
            if (isStale) {
                console.log(`[ProactiveSync] Data is stale or missing for business ${businessId}. Triggering background sync.`);
                // Trigger background sync but don't wait for it to finish to avoid blocking the UI
                unifiedDataService.syncBusinessData(businessId).catch(err => {
                    console.error(`[ProactiveSync] Background sync failed for ${businessId}:`, err);
                });
                return true; // We triggered a sync
            }
            return false;
        } catch (error) {
            console.error('[ProactiveSync] Health check failed:', error);
            return false;
        }
    }

    static async index(req: Request, res: Response) {
        try {
            const userId = (req.session as any)?.userId;
            if (!userId) return res.redirect('/auth/login');

            const { AppService } = await import('../services/app.service');
            const appService = new AppService();
            const { user, services } = await appService.getUserAppsOverview(userId);

            if (!user?.businessId) return res.redirect('/dashboard');
            
            await RecommendationDashboardController.proactiveSyncCheck(user.businessId, userId);

            // Fetch active recommendation rules and products
            const [rules, products, analytics] = await Promise.all([
                prisma.recommendationRule.findMany({
                    where: { businessId: user.businessId },
                    orderBy: { priority: 'desc' }
                }),
                prisma.unifiedProduct.findMany({
                    where: { businessId: user.businessId },
                    take: 50
                }),
                recommendationService.getRichAnalytics(user.businessId)
            ]);

            res.render('dashboard/recommendations/index', {
                user,
                nonce: res.locals.nonce,
                title: 'Recommendations Dashboard',
                activeService: 'recommendations',
                rules,
                products,
                analytics,
                availableServices: services
            });

        } catch (error: any) {
            console.error('CRITICAL ERROR in RecommendationDashboardController.index:', error);
            logger.error({ err: error, userId: (req as any).session?.userId }, 'Error rendering recommendations dashboard');
            res.status(500).send('Error loading recommendations manager');
        }
    }

    static async rules(req: Request, res: Response) {
        try {
            const userId = (req.session as any)?.userId;
            if (!userId) return res.redirect('/auth/login');

            const { AppService } = await import('../services/app.service');
            const appService = new AppService();
            const { user, services } = await appService.getUserAppsOverview(userId);

            if (!user?.businessId) return res.redirect('/dashboard');

            await RecommendationDashboardController.proactiveSyncCheck(user.businessId, userId);

            const rules = await recommendationService.listRules(user.businessId);

            res.render('dashboard/recommendations/rules', {
                user,
                nonce: res.locals.nonce,
                title: 'Recommendation Rules',
                activeService: 'recommendations',
                rules,
                availableServices: services
            });
        } catch (error) {
            logger.error({ error }, 'Error loading recommendation rules page');
            res.status(500).send('Failed to load rules');
        }
    }

    static async analytics(req: Request, res: Response) {
        try {
            const userId = (req.session as any)?.userId;
            if (!userId) return res.redirect('/auth/login');

            const { AppService } = await import('../services/app.service');
            const appService = new AppService();
            const { user, services } = await appService.getUserAppsOverview(userId);

            if (!user) return res.redirect('/auth/login');

            if (user.businessId) {
                await RecommendationDashboardController.proactiveSyncCheck(user.businessId, userId);
            }

            const analytics = user.businessId 
                ? await recommendationService.getRichAnalytics(user.businessId)
                : { 
                    impressions: 0, conversions: 0, conversionRate: '0%', revenueLift: '£0.00', topPerformers: [],
                    categoryDistribution: [], customerClusters: [], affinities: []
                  };

            // Real analytics from DB
            res.render('dashboard/recommendations/analytics', {
                user,
                nonce: res.locals.nonce,
                title: 'Performance Analytics',
                activeService: 'recommendations',
                availableServices: services,
                analytics, // Comprehensive data object
                metrics: {
                    impressions: analytics.impressions,
                    conversions: analytics.conversions,
                    conversionRate: analytics.conversionRate,
                    revenueLift: analytics.revenueLift
                },
                topPerformers: analytics.topPerformers,
                categoryDistribution: analytics.categoryDistribution,
                customerClusters: analytics.customerClusters,
                affinities: analytics.affinities
            });
        } catch (error) {
            res.status(500).send('Error loading analytics');
        }
    }
    static async createRule(req: Request, res: Response) {
        try {
            const userId = (req as any).session?.userId;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user?.businessId) return res.status(400).json({ error: 'Business ID required' });

            const ruleData = req.body;
            const rule = await recommendationService.createRule(user.businessId, {
                name: ruleData.name,
                triggerSku: ruleData.triggerSku || null,
                triggerCategory: ruleData.triggerCategory || null,
                targetSku: ruleData.targetSku,
                aiPromptContext: ruleData.aiPromptContext,
                priority: parseInt(ruleData.priority) || 0,
                isActive: ruleData.isActive !== false
            });

            res.status(201).json(rule);
        } catch (error: any) {
            logger.error({ error, body: req.body }, 'Error creating recommendation rule');
            res.status(500).json({ error: 'Failed to create rule' });
        }
    }

    static async updateRule(req: Request, res: Response) {
        try {
            const userId = (req as any).session?.userId;
            const { id } = req.params;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user?.businessId) return res.status(400).json({ error: 'Business ID required' });

            const ruleData = req.body;
            await recommendationService.updateRule(id, user.businessId, {
                name: ruleData.name,
                triggerSku: ruleData.triggerSku || null,
                triggerCategory: ruleData.triggerCategory || null,
                targetSku: ruleData.targetSku,
                aiPromptContext: ruleData.aiPromptContext,
                priority: parseInt(ruleData.priority) || 0,
                isActive: ruleData.isActive !== false
            });

            res.json({ success: true });
        } catch (error: any) {
            logger.error({ error, id: req.params.id }, 'Error updating recommendation rule');
            res.status(500).json({ error: 'Failed to update rule' });
        }
    }

    static async deleteRule(req: Request, res: Response) {
        try {
            const userId = (req as any).session?.userId;
            const { id } = req.params;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user?.businessId) return res.status(400).json({ error: 'Business ID required' });

            await recommendationService.deleteRule(id, user.businessId);
            res.json({ success: true });
        } catch (error: any) {
            logger.error({ error, id: req.params.id }, 'Error deleting recommendation rule');
            res.status(500).json({ error: 'Failed to delete rule' });
        }
    }

    static async createDefaultRules(req: Request, res: Response) {
        try {
            const userId = (req as any).session?.userId;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user?.businessId) return res.status(400).json({ error: 'Business ID required' });

            const defaultRules = [
                {
                    name: "Cross-Sell Premium Options",
                    triggerCategory: "Services",
                    targetSku: "PREMIUM-SUPPORT",
                    priority: 10,
                    aiPromptContext: "Recommend our premium support tier when clients purchase basic service packages.",
                    isActive: true
                },
                {
                    name: "Bundle Discounts",
                    triggerSku: "CONSULTING-HR",
                    targetSku: "CONSULTING-LEGAL",
                    priority: 5,
                    aiPromptContext: "Offer a combined HR and Legal consulting bundle at a discounted rate.",
                    isActive: true
                }
            ];

            const created = await Promise.all(defaultRules.map(rule => 
                recommendationService.createRule(user.businessId!, rule)
            ));

            res.status(201).json({ success: true, count: created.length });
        } catch (error: any) {
            logger.error({ error }, 'Error creating default rules');
            res.status(500).json({ error: 'Failed to create default rules' });
        }
    }

    static async syncProducts(req: Request, res: Response) {
        const userId = (req as any).session?.userId;
        try {
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user?.businessId) return res.status(400).json({ error: 'Business ID required' });

            await recommendationService.syncUnifiedInventory(user.businessId);
            res.json({ success: true, message: 'Products synced successfully' });
        } catch (error: any) {
            logger.error({ error, userId }, 'Dashboard product sync failed');
            res.status(500).json({ error: 'Product sync failed' });
        }
    }

    static async syncOrders(req: Request, res: Response) {
        const userId = (req as any).session?.userId;
        try {
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user?.businessId) return res.status(400).json({ error: 'Business ID required' });

            await recommendationService.syncUnifiedOrders(user.businessId);
            res.json({ success: true, message: 'Orders synced successfully' });
        } catch (error: any) {
            logger.error({ error, userId }, 'Dashboard order sync failed');
            res.status(500).json({ error: 'Order sync failed' });
        }
    }


    static async catalog(req: Request, res: Response) {
        try {
            const userId = (req as any).session?.userId;
            if (!userId) return res.redirect('/login');

            const { AppService } = await import('../services/app.service');
            const appService = new AppService();
            const { user, services } = await appService.getUserAppsOverview(userId);

            if (!user?.businessId) return res.redirect('/dashboard');

            await RecommendationDashboardController.proactiveSyncCheck(user.businessId, userId);

            const analytics = await recommendationService.getRichAnalytics(user.businessId);

            console.log(`[DEBUG] Rendering catalog with activeService: recommendations`);
            res.render('dashboard/recommendations/catalog', {
                title: 'Product Catalog',
                activeService: 'recommendations',
                user, 
                nonce: res.locals.nonce,
                availableServices: services,
                analytics
            });
        } catch (error: any) {
            logger.error({ error }, 'Error loading recommendations catalog');
            res.status(500).send('Failed to load catalog');
        }
    }

    static async segments(req: Request, res: Response) {
        try {
            const userId = (req as any).session?.userId;
            if (!userId) return res.redirect('/login');

            const { AppService } = await import('../services/app.service');
            const appService = new AppService();
            const { user, services } = await appService.getUserAppsOverview(userId);

            if (!user?.businessId) return res.redirect('/dashboard');

            await RecommendationDashboardController.proactiveSyncCheck(user.businessId, userId);
            
            // Wire logic to live hub data
            const analytics = await recommendationService.getRichAnalytics(user.businessId);
            const customerSegments = analytics.customerClusters; // Use the RFM clusters as segments

            console.log(`[DEBUG] Rendering segments with activeService: recommendations`);
            res.render('dashboard/recommendations/segments', {
                title: 'Customer Segments',
                activeService: 'recommendations',
                user, 
                nonce: res.locals.nonce,
                availableServices: services,
                analytics,
                customerClusters: analytics.customerClusters
            });
        } catch (error: any) {
            logger.error({ error }, 'Error loading recommendations segments');
            res.status(500).send('Failed to load segments');
        }
    }

    static async getStats(req: Request, res: Response) {
        try {
            const userId = (req as any).session?.userId;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user?.businessId) return res.status(400).json({ error: 'Business ID required' });

            const analytics = await recommendationService.getRichAnalytics(user.businessId);
            res.json({ success: true, data: analytics });
        } catch (error: any) {
            logger.error({ error }, 'Error fetching recommendation stats for dashboard');
            res.status(500).json({ error: 'Failed to fetch stats' });
        }
    }

    static async getRules(req: Request, res: Response) {
        try {
            const userId = (req as any).session?.userId;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user?.businessId) return res.status(400).json({ error: 'Business ID required' });

            const rules = await recommendationService.listRules(user.businessId);
            res.json({ success: true, data: rules });
        } catch (error: any) {
            logger.error({ error }, 'Error fetching recommendation rules for dashboard');
            res.status(500).json({ error: 'Failed to fetch rules' });
        }
    }

    static async getCatalog(req: Request, res: Response) {
        try {
            const userId = (req as any).session?.userId;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user?.businessId) return res.status(400).json({ error: 'Business ID required' });

            const analytics = await recommendationService.getRichAnalytics(user.businessId);
            const products = await prisma.unifiedProduct.findMany({
                where: { businessId: user.businessId }
            });
            res.json({ success: true, data: { products, insights: analytics } });
        } catch (error: any) {
            logger.error({ error }, 'Error fetching recommendation catalog for dashboard');
            res.status(500).json({ error: 'Failed to fetch catalog' });
        }
    }

    static async getClusters(req: Request, res: Response) {
        try {
            const userId = (req as any).session?.userId;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user?.businessId) return res.status(400).json({ error: 'Business ID required' });

            // Using the rich analytics since it contains the cluster RFM data
            const analytics = await recommendationService.getRichAnalytics(user.businessId);
            res.json({ success: true, data: analytics });
        } catch (error: any) {
            logger.error({ error }, 'Error fetching recommendation clusters for dashboard');
            res.status(500).json({ error: 'Failed to fetch clusters' });
        }
    }

    static async testRecommendations(req: Request, res: Response) {
        try {
            const userId = (req as any).session?.userId;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user?.businessId) return res.status(400).json({ error: 'Business ID required' });

            const { items, customerId, limit = 3 } = req.body;

            const recommendations = await recommendationService.getRecommendations({
                businessId: user.businessId,
                items: items || [],
                customerId: customerId || undefined,
                limit
            });

            res.json({ success: true, data: recommendations });
        } catch (error: any) {
            logger.error({ error }, 'Error running recommendation test playground');
            res.status(500).json({ error: 'Test failed. Please check parameters.' });
        }
    }
    static async searchAutocomplete(req: Request, res: Response) {
        try {
            const userId = (req as any).session?.userId;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user?.businessId) return res.status(400).json({ error: 'Business ID required' });

            const { query = '', type = 'product' } = req.query as { query: string, type: 'product' | 'customer' };

            let results: any[] = [];

            if (type === 'product') {
                results = await prisma.unifiedProduct.findMany({
                    where: {
                        businessId: user.businessId,
                        ...(query.length >= 2 ? {
                            OR: [
                                { name: { contains: query, mode: 'insensitive' } },
                                { sku: { contains: query, mode: 'insensitive' } }
                            ]
                        } : {})
                    },
                    take: 10,
                    orderBy: { createdAt: 'desc' },
                    select: { id: true, name: true, sku: true }
                });
            } else {
                results = await prisma.unifiedCustomer.findMany({
                    where: {
                        businessId: user.businessId,
                        ...(query.length >= 2 ? {
                            OR: [
                                { name: { contains: query, mode: 'insensitive' } },
                                { id: { contains: query, mode: 'insensitive' } }
                            ]
                        } : {})
                    },
                    take: 10,
                    orderBy: { createdAt: 'desc' },
                    select: { id: true, name: true }
                });
            }

            res.json({ success: true, data: results });
        } catch (error: any) {
            logger.error({ error }, 'Error in searchAutocomplete');
            res.status(500).json({ error: 'Search failed' });
        }
    }

    static async segmentDetail(req: Request, res: Response) {
        try {
            const userId = (req as any).session?.userId;
            const { clusterId } = req.params;
            if (!userId) return res.redirect('/auth/login');

            const { AppService } = await import('../services/app.service');
            const appService = new AppService();
            const { user, services } = await appService.getUserAppsOverview(userId);

            if (!user?.businessId) return res.redirect('/dashboard');

            // Fetch specific cluster data and customers
            const analytics = await recommendationService.getRichAnalytics(user.businessId);
            const cluster = analytics.customerClusters.find(c => c.clusterId === clusterId);

            if (!cluster) return res.redirect('/dashboard/recommendations/segments');

            // In a real app, we'd fetch actual customer records from Prisma based on segment logic
            // For now, we'll use the analytics data
            res.render('dashboard/recommendations/segment-detail', {
                title: `${cluster.name} - Segment Detail`,
                activeService: 'recommendations',
                user,
                nonce: res.locals.nonce,
                availableServices: services,
                cluster,
                analytics
            });
        } catch (error) {
            logger.error({ error }, 'Error loading segment detail');
            res.status(500).send('Failed to load segment details');
        }
    }

    static async sync(req: Request, res: Response) {
        try {
            const userId = (req as any).session?.userId;
            if (!userId) return res.redirect('/auth/login');

            const { AppService } = await import('../services/app.service');
            const appService = new AppService();
            const { user, services } = await appService.getUserAppsOverview(userId);

            if (!user?.businessId) return res.redirect('/dashboard');

            // Get sync status
            const syncStatus = await prisma.unifiedSyncJob.findMany({
                where: { businessId: user.businessId },
                orderBy: { createdAt: 'desc' },
                take: 10
            });

            res.render('dashboard/recommendations/sync', {
                title: 'Recommendation Sync',
                activeService: 'recommendations',
                user,
                nonce: res.locals.nonce,
                availableServices: services,
                syncStatus
            });
        } catch (error) {
            logger.error({ error }, 'Error loading sync page');
            res.status(500).send('Failed to load sync page');
        }
    }
}
