import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { FeatureAccessService } from '../services/feature-access.service';

export const injectUser = async (req: Request, res: Response, next: NextFunction) => {
  if ((req.session as any).userId) {
    try {
      // Only fetch if not already populated
      if (!res.locals.user) {
        const { UserRepository } = require('../repositories/user.repository');
        const userRepo = new UserRepository();
        const user = await userRepo.findByIdWithRelations((req.session as any).userId);
        
        if (user) {
            // FIX: Self-healing onboarding for users without subscription or app
            if (!user.subscription || user.apps.length === 0) {
               console.log(`[Onboarding] Fixing missing infrastructure for ${user.email}`);
               const { v4: uuidv4 } = require('uuid');
               
               try {
                   await prisma.$transaction(async (tx) => {
                       // 1. Ensure Subscription
                       if (!user.subscription) {
                           const freePlan = await tx.plan.findFirst({ where: { name: 'Free' } });
                           if (freePlan) {
                               await tx.subscription.create({
                                   data: { userId: user.id, planId: freePlan.id, status: 'active' }
                               });
                           }
                       }

                       // 2. Ensure Default App
                       if (user.apps.length === 0) {
                           const apiKey = 'fl_' + uuidv4().replace(/-/g, '');
                           const coreServices = await tx.service.findMany({
                               where: { slug: { in: ['html-to-pdf', 'ai-doc-generator', 'transactional-branding'] } }
                           });

                           await tx.app.create({
                               data: {
                                   name: 'Default App',
                                   userId: user.id,
                                   apiKey: apiKey,
                                   services: {
                                       create: coreServices.map(s => ({
                                           serviceId: s.id,
                                           isEnabled: true
                                       }))
                                   }
                               }
                           });
                       }
                   });

                   // Refresh user object after fix
                   const refreshedUser = await userRepo.findByIdWithRelations(user.id);
                   if (refreshedUser) {
                       res.locals.user = refreshedUser;
                       (req as any).user = refreshedUser;
                   }
               } catch (onboardingError) {
                   console.error(`[Onboarding] Failed to fix infrastructure for ${user.id}:`, onboardingError);
                   res.locals.user = user;
                   (req as any).user = user;
               }
            } else {
                res.locals.user = user;
                (req as any).user = user;
            }
            
            // Add feature access flags for easy checking in views
            (res.locals.user as any).hasAiAccess = FeatureAccessService.hasAiAccess(res.locals.user);
            (res.locals.user as any).hasPdfAccess = FeatureAccessService.hasPdfAccess(res.locals.user);
            (res.locals.user as any).isPaidUser = FeatureAccessService.isPaidUser(res.locals.user);
            (res.locals.user as any).planName = FeatureAccessService.getPlanName(res.locals.user);

            if (req.path.startsWith('/services')) {
                console.log(`[DEBUG] injectUser (${user.email}): Plan=${user.subscription?.plan?.name}, AIQuota=${user.subscription?.plan?.aiQuota}, PDFQuota=${user.subscription?.plan?.pdfQuota}`);
                console.log(`[DEBUG] injectUser (${user.email}): HasAiAccess=${(res.locals.user as any).hasAiAccess}`);
            }


            // Calculate Alerts (Billing & Usage)
            const alerts = {
                billing: false,
                usage: false
            };

            // Billing Alert
            if (user.subscription && ['past_due', 'unpaid'].includes(user.subscription.status)) {
                alerts.billing = true;
            }

            // Usage Alert (Calculate only if plan has limit)
            if (user.subscription && user.subscription.plan) {
                const now = new Date();
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                
                // Total usage for requestLimit
                const totalUsageCount = await prisma.usageLog.count({
                    where: {
                        userId: user.id,
                        status: 'success',
                        createdAt: { gte: startOfMonth },
                        cost: { gt: 0 }, // STRICTLY exclude free actions (like visits)
                        resourceType: { not: 'dashboard_visit' }
                    }
                });

                // Feature specific usage
                const { UsageService } = require('../services/usage.service');
                const usageService = new UsageService();

                const aiUsageCount = await usageService.getFeatureUsage(user.id, 'ai_generation', startOfMonth);
                const pdfUsageCount = await usageService.getFeatureUsage(user.id, 'pdf_conversion', startOfMonth);

                const aiLimit = user.subscription.plan.aiQuota;
                const pdfLimit = user.subscription.plan.pdfQuota;
                const totalLimit = user.subscription.plan.requestLimit;

                (res.locals.user as any).aiUsageCount = aiUsageCount;
                (res.locals.user as any).pdfUsageCount = pdfUsageCount;
                (res.locals.user as any).aiLimitReached = aiLimit !== -1 && aiUsageCount >= aiLimit;
                (res.locals.user as any).pdfLimitReached = pdfLimit !== -1 && pdfUsageCount >= pdfLimit;

                // Show alert if total usage is >= 80% or over limit
                if (totalLimit !== -1 && totalUsageCount >= totalLimit * 0.8) {
                    alerts.usage = true;
                }
            }
            
            res.locals.alerts = alerts;

            // --- SAE ENHANCEMENT: Inject currentApp for Session Users ---
            // If the user has an app named 'Main Dashboard App' (or just their first app),
            // we use it as the context for UI-based service calls.
            if (!(req as any).currentApp) {
                const app = await prisma.app.findFirst({
                    where: { userId: user.id, isActive: true },
                    include: { services: { include: { service: true } } }
                });
                
                if (app) {
                    (req as any).currentApp = {
                        id: app.id,
                        name: app.name,
                        apiKey: app.apiKey,
                        services: app.services.map(s => s.service.slug)
                    };
                }
            }
            // --- SAE ENHANCEMENT: Populate Trace Context ---
            const { TraceManager } = require('../lib/trace');
            const traceContext = TraceManager.getContext();
            if (traceContext) {
              traceContext.userId = user.id;
              traceContext.appId = (req as any).currentApp?.id;
            }
        }
      }
    } catch (error) {
      console.error('Failed to inject user:', error);
    }
  }
  next();
};
