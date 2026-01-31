import { Request, Response, NextFunction } from 'express';
import { UsageService } from '../services/usage.service';

const usageService = new UsageService();

export class AnalyticsController {
  static async showAppAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.session as any).userId;
      const { appId } = req.params;

      const app = await usageService.getAppDetails(userId, appId);

      const dailyUsage = await usageService.getAppDailyUsage(appId);
      const currentUsage = await usageService.getCurrentCycleUsage(appId);
      const recentLogs = await usageService.getRecentLogs(appId);
      const usageByService = await usageService.getUsageByService(appId);

      // Determine limits based on plan
      // @ts-ignore - Relations are loaded but TS might not know
      const plan = app.user?.subscription?.plan;
      const requestLimit = plan?.requestLimit || 50; // Default to Free limit
      const planName = plan?.name || 'Free';
      
      res.render('apps/analytics', { 
        app, 
        dailyUsage, 
        currentUsage, 
        recentLogs, 
        usageByService,
        requestLimit,
        planName
      });
    } catch (error) {
      next(error);
    }
  }

  static async getApiData(req: Request, res: Response, next: NextFunction) {
    try {
      const { appId } = req.params;
      const stats = await usageService.getAppDailyUsage(appId);
      res.json(stats);
    } catch (error) {
      next(error);
    }
  }
}
