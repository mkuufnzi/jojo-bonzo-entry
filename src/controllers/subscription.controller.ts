import { Request, Response } from 'express';
import { SubscriptionService } from '../services/subscription.service';
import { UsageService } from '../services/usage.service';
import { ApiKeyRepository } from '../repositories/api-key.repository';
import prisma from '../lib/prisma';

export class SubscriptionController {
  static async index(req: Request, res: Response) {
    const userId = (req.session as any).userId;
    const subscriptionService = new SubscriptionService();
    const usageService = new UsageService();
    const apiKeyRepository = new ApiKeyRepository();

    try {
        let subscription, user, usageStats, costBreakdown, apiKeys;
        let pdfLimit, aiLimit, pdfUsage, aiUsage;
        let dailyUsage, serviceDistribution, recentActivity;

        try {
            // Attempt to fetch all real data
            [subscription, user] = await Promise.all([
                subscriptionService.getSubscription(userId),
                prisma.user.findUnique({ 
                    where: { id: userId },
                    include: { apps: true }
                })
            ]);
            
            [usageStats, costBreakdown, apiKeys] = await Promise.all([
                usageService.getMonthlyUsage(userId),
                usageService.getUserCostByService(userId),
                apiKeyRepository.findActiveByUserId(userId)
            ]);

            // Merge Legacy Keys
            if (user?.apps) {
                const legacyKeys = user.apps.map((app: any) => ({
                    id: app.id, // Add ID for linking
                    name: app.name,
                    key: app.apiKey,
                    scopes: 'full_access',
                    status: app.isActive ? 'active' : 'inactive',
                    createdAt: app.createdAt,
                    type: 'app' // Distinguish from dedicated keys
                }));
                apiKeys = [...legacyKeys, ...apiKeys];
            }

            // Quotas
            pdfLimit = subscription?.plan?.pdfQuota || 15;
            aiLimit = subscription?.plan?.aiQuota || 5; 
            pdfUsage = await usageService.getFeatureUsage(userId, 'pdf_conversion');
            aiUsage = await usageService.getFeatureUsage(userId, 'ai_generation');
             
            // Real Analytics Data Fetching
            const [dailyUsageData, serviceCostData, recentLogs] = await Promise.all([
                usageService.getUserDailyUsage(userId, 7),
                usageService.getUserCostByService(userId),
                usageService.getDashboardStats(userId).then(r => r.user.logs || [])
            ]);

            // 1. Map Daily Usage
            dailyUsage = dailyUsageData.map(d => ({
                date: d.date,
                count: d.count
            }));

            // 2. Map Service Distribution (Add Colors)
            const colors = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444'];
            serviceDistribution = serviceCostData.map((s, index) => ({
                label: s.serviceName,
                value: Math.round(s.cost * 100) / 100, // Round to 2 decimals
                color: colors[index % colors.length]
            })).filter(s => s.value > 0); // Only show active services

            // If empty (new user), show placeholders so chart isn't broken
            if (serviceDistribution.length === 0) {
                 serviceDistribution = [{ label: 'No Usage', value: 1, color: '#E5E7EB' }];
            }

            // 3. Map Recent Activity
            recentActivity = recentLogs.slice(0, 5).map((log: any) => {
                let costStr = '$0.00';
                if (log.cost > 0) costStr = `$${log.cost.toFixed(2)}`;
                
                // Calculate relative time (simple)
                const diff = Date.now() - new Date(log.createdAt).getTime();
                let timeStr = 'Just now';
                if (diff > 86400000) timeStr = `${Math.floor(diff / 86400000)}d ago`;
                else if (diff > 3600000) timeStr = `${Math.floor(diff / 3600000)}h ago`;
                else if (diff > 60000) timeStr = `${Math.floor(diff / 60000)}m ago`;

                return {
                    service: log.service?.name || log.action, // Fallback if service relation missing
                    status: log.status,
                    time: timeStr,
                    cost: costStr
                };
            });

        } catch (dbError) {
             console.error('DB Access Failed:', dbError);
             throw dbError; // Bubble up to main error handler or let the outer catch handle it
        }

        res.render('dashboard/subscription', {
          user: { ...user, subscription },
          title: 'Subscription',
          activeService: 'hub',
          stats: {
              totalRequests: usageStats,
              costBreakdown,
              pdf: { used: pdfUsage || 0, limit: pdfLimit || 10 },
              ai: { used: aiUsage || 0, limit: aiLimit || 5 }
          },
          analytics: {
              dailyUsage,
              serviceDistribution,
              recentActivity
          },
          apiKeys: apiKeys || [],
          error: req.query.error || null,
          success: req.query.success || null
        });
    } catch (criticalError) {
        console.error('Critical Dashboard Failure:', criticalError);
        // Absolute last resort
        res.render('subscription/index', {
            user: { id: userId, subscription: { plan: { name: 'Error' }, status: 'error' } }, 
            stats: { 
                totalRequests: 0, 
                costBreakdown: [], 
                pdf: { used: 0, limit: 0 }, 
                ai: { used: 0, limit: 0 } 
            },
            apiKeys: [],
            error: 'Unable to load dashboard. Please verify database connection.',
            success: null
        });
    }
  }

  static async plans(req: Request, res: Response) {
      const userId = (req.session as any).userId;
      const subscriptionService = new SubscriptionService();
  
      let subscription, user, plans;

      try {
        // Try to get real data
        [subscription, user] = await Promise.all([
            subscriptionService.getSubscription(userId),
            prisma.user.findUnique({ where: { id: userId } })
        ]);
        
        plans = await subscriptionService.getAllPlans();

      } catch (dbError) {
        console.error('Plans Page DB Access Failed:', dbError);
        throw dbError;
      }

      res.render('subscription/plans', {
        user: { ...user, subscription },
        title: 'Plans',
        activeService: 'hub',
        plans,
        error: req.query.error || null,
        success: req.query.success || null
      });
  }

  static async upgrade(req: Request, res: Response) {
    const userId = (req.session as any).userId;
    const { planId } = req.body;

    console.log('=== UPGRADE REQUEST ===');
    console.log('User ID:', userId);
    console.log('Plan ID:', planId);
    console.log('Session:', req.session);

    const subscriptionService = new SubscriptionService();

    try {
      const result: any = await subscriptionService.upgradeSubscription(userId, planId);
      console.log('Upgrade result:', result);

      if (result.stripeStatus === 'incomplete') {
         const message = 'Payment is processing. Your subscription will be active once payment is confirmed.';
         return res.redirect(`/subscription?info=${encodeURIComponent(message)}`);
      }

      let message = 'Plan updated successfully';
      if (result.status === 'canceling') {
        message = 'Your subscription has been set to cancel at the end of the billing period. You will retain access until then.';
      }

      res.redirect(`/subscription?success=${encodeURIComponent(message)}`);
    } catch (error) {
      console.error('=== UPGRADE ERROR ===');
      console.error(error);

      // Check if error is about missing payment method
      const errorMessage = error instanceof Error ? error.message : 'Failed to update plan';

      if (errorMessage.includes('add a payment method')) {
        // Redirect to add payment method page with notification
        return res.redirect('/billing/payment-methods/create?return=/subscription&message=' + encodeURIComponent('Please add a payment method before upgrading to a paid plan'));
      }

      // Check if error is about incomplete subscription status
      if (errorMessage.includes('incomplete') && errorMessage.includes('cannot')) {
        const friendlyMessage = 'Your subscription cannot be modified at this time due to a pending payment. Please contact support for assistance.';
        return res.redirect(`/subscription?error=${encodeURIComponent(friendlyMessage)}`);
      }

      res.redirect(`/subscription?error=${encodeURIComponent(errorMessage)}`);
    }
  }

  static async cancel(req: Request, res: Response) {
    const userId = (req.session as any).userId;
    const subscriptionService = new SubscriptionService();

    try {
      await subscriptionService.cancelSubscription(userId);
      res.redirect('/subscription?success=Subscription canceled');
    } catch (error) {
      res.redirect(`/subscription?error=${error instanceof Error ? error.message : 'Failed to cancel subscription'}`);
    }
  }

  // ==========================================
  // API Key Management
  // ==========================================
  
  static async createApiKey(req: Request, res: Response) {
      const userId = (req.session as any).userId;
      const { name } = req.body;
      const apiKeyRepository = new ApiKeyRepository();

      try {
          // specific prefix for easy ID
          const crypto = require('crypto');
          const key = 'sk_live_' + crypto.randomBytes(24).toString('hex');
          
          await apiKeyRepository.create({
              userId,
              name: name || 'New API Key',
              key
          });

          res.redirect('/subscription?success=New API Key generated successfully');
      } catch (error) {
          res.redirect(`/subscription?error=${error instanceof Error ? error.message : 'Failed to create key'}`);
      }
  }

  static async deleteApiKey(req: Request, res: Response) {
      const userId = (req.session as any).userId;
      const { id } = req.params;
      const apiKeyRepository = new ApiKeyRepository();

      try {
          await apiKeyRepository.delete(id, userId);
          res.redirect('/subscription?success=API Key revoked');
      } catch (error) {
          res.redirect(`/subscription?error=${error instanceof Error ? error.message : 'Failed to revoke key'}`);
      }
  }

  // ==========================================
  // Data Seeding (For Demo/Dev Purposes)
  // ==========================================
  static async seedData(req: Request, res: Response) {
      const userId = (req.session as any).userId;
      try {
          const prisma = (await import('../lib/prisma')).default;

          // 1. Clear existing logs for clarity? (Optional, maybe not to avoid data loss)
          // await prisma.usageLog.deleteMany({ where: { userId } });

          // 2. Generate 7 days of logs
          const services = await prisma.service.findMany();
          if (services.length === 0) throw new Error('No services defined to seed usage against.');

          const now = new Date();
          const entries: any[] = [];
          
          // Generate ~50 logs scattered over 7 days
          for(let i = 0; i < 50; i++) {
              const daysAgo = Math.floor(Math.random() * 7);
              const date = new Date();
              date.setDate(now.getDate() - daysAgo);
              date.setHours(Math.random() * 24, Math.random() * 60);

              const service = services[Math.floor(Math.random() * services.length)];
              const isSuccess = Math.random() > 0.1; // 90% success
              const cost = isSuccess ? (service.pricePerRequest || 0.10) : 0;
              
              entries.push({
                  userId,
                  serviceId: service.id,
                  action: service.name,
                  status: isSuccess ? 'success' : 'failed',
                  statusCode: isSuccess ? 200 : 500,
                  duration: Math.floor(Math.random() * 2000) + 100,
                  cost,
                  resourceType: service.slug.includes('pdf') ? 'pdf' : 'ai_document',
                  createdAt: date
              });
          }

          if (entries.length > 0) {
              await prisma.usageLog.createMany({ data: entries });
          }

          res.redirect('/subscription?success=Dashboard populated with demo usage data!');
      } catch (error) {
          console.error('Seeding specific error:', error);
          res.redirect(`/subscription?error=Failed to seed data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
  }
}
