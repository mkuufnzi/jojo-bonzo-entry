import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { logger } from '../lib/logger';
import { recommendationService } from '../modules/recommendation/recommendation.service';
import { ServiceSlugs } from '../types/service.types';

export class RecommendationDashboardController {

    static async index(req: Request, res: Response) {
        try {
            const userId = (req as any).session?.userId;
            if (!userId) return res.redirect('/auth/login');

            const user = await prisma.user.findUnique({
                where: { id: userId },
                include: { 
                    business: true,
                    subscription: { include: { plan: true } }
                }
            });

            if (!user?.businessId) {
                return res.render('dashboard/recommendations/index', {
                    user,
                    nonce: res.locals.nonce,
                    title: 'Recommendations Manager',
                    activeService: 'recommendations',
                    rules: [],
                    products: []
                });
            }

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

            const { AppService } = await import('../services/app.service');
            const appService = new AppService();
            const { services } = await appService.getUserAppsOverview(userId);

            res.render('dashboard/recommendations/index', {
                user,
                nonce: res.locals.nonce,
                title: 'Recommendations Manager',
                activeService: 'recommendations',
                rules,
                products,
                analytics,
                availableServices: services
            });

        } catch (error: any) {
            logger.error({ error, userId: (req as any).session?.userId }, 'Error rendering recommendations dashboard');
            res.status(500).send('Error loading recommendations manager');
        }
    }

    static async analytics(req: Request, res: Response) {
        try {
            const userId = (req as any).session?.userId;
            if (!userId) return res.redirect('/auth/login');

            const user = await prisma.user.findUnique({
                where: { id: userId },
                include: { subscription: { include: { plan: true } } }
            });

            if (!user) return res.redirect('/auth/login');

            const { AppService } = await import('../services/app.service');
            const appService = new AppService();
            const { services } = await appService.getUserAppsOverview(userId);

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
                title: 'Recommendation Insights',
                activeService: 'recommendations',
                availableServices: services,
                metrics: {
                    totalImpressions: analytics.impressions,
                    totalConversions: analytics.conversions,
                    conversionRate: analytics.conversionRate,
                    additionalRevenue: analytics.revenueLift
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
}
