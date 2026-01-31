import prisma from '../lib/prisma';
import { Prisma } from '@prisma/client';

export class LogRepository {
  async createUsageLog(data: Prisma.UsageLogCreateInput | Prisma.UsageLogUncheckedCreateInput) {
    return prisma.usageLog.create({
      data,
    });
  }



  async countByAppId(appId: string, startDate: Date, endDate: Date): Promise<number> {
    return prisma.usageLog.count({
      where: {
        appId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });
  }

  async countUsage(userId: string, startDate: Date, endDate: Date, billableOnly: boolean = false) {
    const where: any = {
        userId,
        createdAt: {
          gte: startDate,
          lte: endDate
        }
    };

    if (billableOnly) {
        where.cost = { gt: 0 };
        where.resourceType = { not: 'dashboard_visit' };
    }

    return prisma.usageLog.count({ where });
  }

  async countUsageByType(userId: string, startDate: Date, endDate: Date, serviceSlugs: string[]) {
    return prisma.usageLog.count({
      where: {
        userId,
        createdAt: {
          gte: startDate,
          lte: endDate
        },
        service: {
            slug: { in: serviceSlugs }
        }
      }
    });
  }

  async getDailyUsage(appId: string, startDate: Date, endDate: Date) {
    return prisma.usageLog.groupBy({
      by: ['createdAt', 'status'],
      where: {
        appId,
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      _count: {
        id: true
      }
    });
  }

  async getRecentLogs(appId: string, limit: number) {
    return prisma.usageLog.findMany({
      where: { appId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { service: true }
    });
  }

  async getUsageByService(appId: string) {
    return prisma.usageLog.groupBy({
      by: ['serviceId', 'status'],
      where: { appId },
      _count: { id: true }
    });
  }

  async getLogsByUserId(userId: string, startDate: Date, endDate: Date) {
    return prisma.usageLog.findMany({
      where: {
        userId,
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      select: {
        createdAt: true,
        appId: true
      }
    });
  }

  async countByUserId(userId: string, status?: string) {
      const where: any = { userId };
      if (status) where.status = status;
      return prisma.usageLog.count({ where });
  }

  async findServiceLogs(userId: string, serviceId: string, actions?: string[], limit: number = 20, skip: number = 0) {
    const whereClause: any = {
        userId,
        serviceId
    };

    if (actions && actions.length > 0) {
        whereClause.action = { in: actions };
    }

    return prisma.usageLog.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: skip,
      include: { app: true }
    });
  }

  async countServiceLogs(userId: string, serviceId: string, actions?: string[]) {
    const whereClause: any = {
        userId,
        serviceId
    };

    if (actions && actions.length > 0) {
        whereClause.action = { in: actions };
    }

    return prisma.usageLog.count({
      where: whereClause
    });
  }

  async getRecentLogsByUserId(userId: string, limit: number) {
    return prisma.usageLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { service: true, app: true }
    });
  }

  async getServiceUsageLogs(userId: string, serviceId: string, startDate: Date, endDate: Date) {
      return prisma.usageLog.findMany({
          where: {
              userId,
              serviceId,
              createdAt: { gte: startDate, lte: endDate }
          },
          select: {
              createdAt: true,
              cost: true,
              status: true,
              duration: true
          }
      });
  }
}

