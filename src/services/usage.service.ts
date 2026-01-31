import { LogRepository } from '../repositories/log.repository';
import { AppRepository } from '../repositories/app.repository';
import { ServiceRepository } from '../repositories/service.repository';
import { UserRepository } from '../repositories/user.repository';
import { AppError } from '../lib/AppError';

export class UsageService {
  private logRepository: LogRepository;
  private appRepository: AppRepository;
  private serviceRepository: ServiceRepository;
  private userRepository: UserRepository;

  constructor() {
    this.logRepository = new LogRepository();
    this.appRepository = new AppRepository();
    this.serviceRepository = new ServiceRepository();
    this.userRepository = new UserRepository();
  }

  async getDashboardStats(userId: string) {
      const user = await this.userRepository.findByIdWithRelations(userId);
      if (!user) throw new AppError('User not found', 404);

      const logsCount = await this.logRepository.countByUserId(userId);
      const successCount = await this.logRepository.countByUserId(userId, 'success');
      const usageByApp = await this.getUserDailyUsageByApp(userId);
      const recentLogs = await this.logRepository.getRecentLogsByUserId(userId, 10);

      // Attach logs to user object to match view expectation
      const userWithLogs = { ...user, logs: recentLogs };

      return { user: userWithLogs, logsCount, successCount, usageByApp };
  }

  async getUserDailyUsageByApp(userId: string, days: number = 30) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const logs = await this.logRepository.getLogsByUserId(userId, startDate, endDate);

    // Group by AppId and Date
    const stats: Record<string, Record<string, number>> = {}; // { appId: { date: count } }

    logs.forEach(log => {
      const appId = log.appId || 'unknown';
      const dateStr = log.createdAt.toISOString().split('T')[0];
      
      if (!stats[appId]) stats[appId] = {};
      if (!stats[appId][dateStr]) stats[appId][dateStr] = 0;
      
      stats[appId][dateStr]++;
    });

    return stats;
  }

  async getUserDailyUsage(userId: string, days: number = 7) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const logs = await this.logRepository.getLogsByUserId(userId, startDate, endDate);

    // Group by Date
    const dailyStats: Record<string, number> = {};
    
    // Initialize all days (last 7 days)
    for (let i = 0; i < days; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toLocaleDateString('en-US', { weekday: 'short' }); // "Mon", "Tue"
        // Note: This simple keying might overlap if spanning > 1 week, but for "Last 7 Days" it's fine.
        // For robustness, maybe use full date, but UI expects simple labels.
        // Let's use YYYY-MM-DD for sorting, then map to Label later? 
        // actually View expects 'date' property.
        // Let's use the date string for now and let Controller or View format it if needed.
        // But the Mock data used "Mon", "Tue". Let's match that style for the View Chart.
        if (days <= 7) {
             dailyStats[dateStr] = 0;
        } else {
             const isoDate = d.toISOString().split('T')[0];
             dailyStats[isoDate] = 0;
        }
    }

    // Re-loop to fill map with correct keys
    const finalStats: { date: string, rawDate: string, count: number }[] = [];
    const datesMap = new Map<string, number>();

    for(let i = days - 1; i >= 0; i--) {
         const d = new Date();
         d.setDate(d.getDate() - i);
         const label = days <= 7 ? d.toLocaleDateString('en-US', { weekday: 'short' }) : d.toISOString().split('T')[0];
         const rawDate = d.toISOString().split('T')[0];
         
         const count = logs.filter(l => l.createdAt.toISOString().startsWith(rawDate)).length;
         finalStats.push({ date: label, rawDate, count });
    }

    return finalStats;
  }

  async getServiceLogs(userId: string, serviceId: string, actions?: string[], limit: number = 20, skip: number = 0) {
      return this.logRepository.findServiceLogs(userId, serviceId, actions, limit, skip);
  }

  async getServiceLogCount(userId: string, serviceId: string, actions?: string[]) {
    return this.logRepository.countServiceLogs(userId, serviceId, actions);
  }

  async getServiceDailyUsage(userId: string, serviceId: string, days: number = 30) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const logs = await this.logRepository.getServiceUsageLogs(userId, serviceId, startDate, endDate);

    const dailyStats: Record<string, { success: number; failed: number; cost: number; count: number; billableCount: number; duration: number }> = {};
    
    // Initialize all days
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      dailyStats[dateStr] = { success: 0, failed: 0, cost: 0, count: 0, billableCount: 0, duration: 0 };
    }


    logs.forEach(log => {
      const dateStr = log.createdAt.toISOString().split('T')[0];
      if (dailyStats[dateStr]) {
        if (log.status === 'success') {
          dailyStats[dateStr].success++;
        } else {
          dailyStats[dateStr].failed++;
        }
        dailyStats[dateStr].cost += (log.cost || 0);
				dailyStats[dateStr].duration += (log.duration || 0);
        dailyStats[dateStr].count++; // All activity (for graphs)
        
        if ((log.cost || 0) > 0) {
            dailyStats[dateStr].billableCount++; // Only billable (for quota)
        }
      }
    });

    return dailyStats;
  }

  async getAppDetails(userId: string, appId: string) {
    const app = await this.appRepository.findByIdWithRelations(appId);
    
    if (!app) {
      throw new AppError('App not found', 404);
    }
    
    // Check ownership
    if (app.userId !== userId) {
      throw new AppError('Unauthorized', 403);
    }

    return app;
  }

  async getAppDailyUsage(appId: string, days: number = 30) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const logs = await this.logRepository.getDailyUsage(appId, startDate, endDate);

    // Process logs to group by day
    const dailyStats: Record<string, { success: number; failed: number }> = {};
    
    // Initialize all days with 0
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      dailyStats[dateStr] = { success: 0, failed: 0 };
    }

    logs.forEach(log => {
      const dateStr = log.createdAt.toISOString().split('T')[0];
      if (dailyStats[dateStr]) {
        if (log.status === 'success') {
          dailyStats[dateStr].success += log._count.id;
        } else {
          dailyStats[dateStr].failed += log._count.id;
        }
      }
    });

    return Object.entries(dailyStats)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stats]) => ({ date, ...stats }));
  }

  async getCurrentCycleUsage(appId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    return this.logRepository.countByAppId(appId, startOfMonth, endOfMonth);
  }

  async getRecentLogs(appId: string, limit: number = 50) {
    return this.logRepository.getRecentLogs(appId, limit);
  }

  async getUsageByService(appId: string) {
    const usage = await this.logRepository.getUsageByService(appId);
    const services = await this.serviceRepository.findAll(); // Need to map IDs to names

    return usage.map(u => {
      const service = services.find(s => s.id === u.serviceId);
      return {
        serviceName: service?.name || 'Unknown',
        status: u.status,
        count: u._count.id
      };
    });
  }
  async getMonthlyUsage(userId: string) {
    const now = new Date();
    const startOfPeriod = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfPeriod = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return this.logRepository.countUsage(userId, startOfPeriod, endOfPeriod, true); // Billable only
  }

  /**
   * Get usage for a specific feature key across all services that require it
   */
  async getFeatureUsage(userId: string, featureKey: string, startDate?: Date, endDate?: Date): Promise<number> {
    const now = new Date();
    const start = startDate || new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endDate || new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // 1. Find all services that use this feature key
    const services = await this.serviceRepository.findByFeatureKey(featureKey);
    const relevantServiceIds = services.map(s => s.id);

    // 2. Count successful logs for these services
    if (relevantServiceIds.length === 0) return 0;

    // 2. Count successful logs for these services
    const prisma = (await import('../lib/prisma')).default;

    const whereClause: any = {
        userId,
        status: 'success',
        serviceId: { in: relevantServiceIds },
        createdAt: { gte: start, lte: end },
        resourceType: { not: 'dashboard_visit' }
    };

    // STRICT RESOURCE FILTERING to prevent double-counting (API Call + Worker Log)
    if (featureKey === 'ai_generation') {
        whereClause.resourceType = 'ai_document'; // Only count the worker's fulfillment
    } else if (featureKey === 'pdf_conversion') {
        whereClause.resourceType = { in: ['pdf', 'pdf_document', 'pdf_conversion'] }; // Handle potential varied names
    }

    return prisma.usageLog.count({
        where: whereClause
    });
  }

  async getUserCostByService(userId: string, startDate?: Date, endDate?: Date) {
    const now = new Date();
    const start = startDate || new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endDate || new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const prisma = (await import('../lib/prisma')).default;

    // Aggregate cost by serviceId
    const costGroups = await prisma.usageLog.groupBy({
        by: ['serviceId'],
        where: {
            userId,
            createdAt: { gte: start, lte: end },
            status: 'success'
        },
        _sum: {
            cost: true
        }
    });

    const services = await this.serviceRepository.findAll();
    
    return costGroups.map(group => {
        const service = services.find(s => s.id === group.serviceId);
        return {
            serviceName: service?.name || 'Unknown',
            cost: group._sum.cost || 0,
            serviceSlug: service?.slug
        };
    }).sort((a, b) => b.cost - a.cost);
  }
    /**
     * Get health status for the main service suites based on recent performance
     */
    async getServicesHealth(userId: string) {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        // Fetch logs for the last 24 hours
        // Optimize: Group by ServiceID and Status
        const prisma = (await import('../lib/prisma')).default;

        const healthGroups = await prisma.usageLog.groupBy({
            by: ['serviceId', 'status'],
            where: {
                // userId, // Can be global or user specific. "Service Status" usually implies System Status, but maybe User's experience?
                // Let's make it Global System Status for now as that's what "Service Status" implies
                createdAt: { gte: yesterday }
            },
            _count: { id: true }
        });

        // Map Service IDs to definitions
        const services = await this.serviceRepository.findAll();
        
        // Define Suites Mappings
        const suites = [
            { id: 'transactional', name: 'Transactional', relatedSlugs: ['html-to-pdf', 'docx-to-pdf', 'invoice-generator'] },
            { id: 'retention', name: 'Retention', relatedSlugs: ['merge-pdf', 'split-pdf', 'gdpr-compiler'] },
            { id: 'sales', name: 'Sales', relatedSlugs: ['ai-doc-generator', 'proposal-gen'] }, // AI Doc Gen spans multiple but usually core
            { id: 'content', name: 'Content', relatedSlugs: ['ai-doc-generator', 'content-engine'] }
        ];

        const suiteHealth = suites.map(suite => {
            // finding related service IDs
            const relatedServices = services.filter(s => s.slug && suite.relatedSlugs.some(slug => (s.slug as string).includes(slug)));
            const relatedIds = relatedServices.map(s => s.id);

            if (relatedIds.length === 0) return { name: suite.name, status: 'Optimal', color: 'emerald' };

            let success = 0;
            let failed = 0;

            healthGroups.forEach(g => {
                if (g.serviceId && relatedIds.includes(g.serviceId)) {
                    if (g.status === 'success') success += g._count.id;
                    else failed += g._count.id;
                }
            });

            const total = success + failed;
            if (total === 0) return { name: suite.name, status: 'Idle', color: 'slate' };

            const rate = (success / total) * 100;

            if (rate >= 98) return { name: suite.name, status: 'Healthy', color: 'emerald' };
            if (rate >= 90) return { name: suite.name, status: 'Degraded', color: 'amber' };
            return { name: suite.name, status: 'Critical', color: 'rose' };
        });

        return suiteHealth;
    }
    async getCategoryStats(userId: string, slugs: string[]) {
        const prisma = (await import('../lib/prisma')).default;

        // 1. Get Service IDs
        const services = await this.serviceRepository.findAll();
        const relevantIds = services
            .filter(s => s.slug && slugs.some(slug => (s.slug as string).includes(slug)))
            .map(s => s.id);

        if (relevantIds.length === 0) {
            return { totalRequests: 0, avgDuration: 0, successRate: 0 };
        }

        // 2. Aggregate Log Data (All time? Or last 30 days? Let's say Last 30 Days for relevance)
        // Actually, user view shows "Documents Generated" (Total?). Let's stick to last 30 days for dashboard stats usually.
        // But the previous mock said "1,204". Let's do Last 30 Days.
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const logs = await prisma.usageLog.findMany({
            where: {
                userId,
                serviceId: { in: relevantIds },
                createdAt: { gte: thirtyDaysAgo }
            },
            select: {
                status: true,
                duration: true
            }
        });

        const totalRequests = logs.length;
        if (totalRequests === 0) return { totalRequests: 0, avgDuration: 0, successRate: 0 };

        const successLogs = logs.filter(l => l.status === 'success');
        const successRate = (successLogs.length / totalRequests) * 100;
        
        // Avg Duration (only for successful ones usually, or all?)
        const totalDuration = logs.reduce((sum, l) => sum + (l.duration || 0), 0);
        const avgDuration = Math.round(totalDuration / totalRequests);

        return { totalRequests, avgDuration, successRate };
    }
}
