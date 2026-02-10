import prisma from '../lib/prisma';
import { App, Prisma } from '@prisma/client';

export class AppRepository {
  async findById(id: string): Promise<App | null> {
    return prisma.app.findUnique({
      where: { id },
    });
  }

  async findByIdWithRelations(id: string): Promise<App | null> {
    return prisma.app.findUnique({
      where: { id },
      include: {
          user: {
              include: {
                  subscription: { include: { plan: true } }
              }
          },
          services: { include: { service: true } }
      }
    });
  }

  async findByApiKey(apiKey: string): Promise<App | null> {
    return prisma.app.findUnique({
      where: { apiKey },
      include: {
          user: {
              include: {
                  subscription: { include: { plan: true } }
              }
          },
          services: { include: { service: true } }
      }
    });
  }

  async findAppService(appId: string, serviceId: string) {
    return prisma.appService.findUnique({
      where: {
        appId_serviceId: {
          appId,
          serviceId
        }
      },
      include: { app: true }
    });
  }

  async findFirstConnectedApp(userId: string, serviceId: string) {
    return prisma.appService.findFirst({
      where: {
        serviceId,
        app: { userId, isActive: true },
        isEnabled: true
      },
      include: { app: true }
    });
  }

  async create(data: Prisma.AppCreateInput, tx?: Prisma.TransactionClient): Promise<App> {
    const client = tx || prisma;
    return client.app.create({
      data,
    });
  }

  async update(id: string, data: Prisma.AppUpdateInput): Promise<App> {
    return prisma.app.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<App> {
    return prisma.app.delete({
      where: { id },
    });
  }

  async countByUserId(userId: string): Promise<number> {
    return prisma.app.count({
      where: { userId },
    });
  }

  async findManyByUserId(userId: string): Promise<App[]> {
    return prisma.app.findMany({
      where: { userId },
    });
  }
  
  async addService(appId: string, serviceId: string) {
      return prisma.appService.create({
          data: {
              appId,
              serviceId
          }
      });
  }

  async upsertService(appId: string, serviceId: string, isEnabled: boolean) {
      return prisma.appService.upsert({
          where: {
              appId_serviceId: {
                  appId,
                  serviceId
              }
          },
          update: { isEnabled },
          create: {
              appId,
              serviceId,
              isEnabled
          }
      });
  }

  async removeService(appId: string, serviceId: string) {
      return prisma.appService.deleteMany({
          where: {
              appId,
              serviceId
          }
      });
  }
}
