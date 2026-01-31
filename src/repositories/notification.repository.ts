import prisma from '../lib/prisma';
import { Prisma, type Notification } from '@prisma/client';

export class NotificationRepository {
  async create(data: Prisma.NotificationCreateInput): Promise<Notification> {
    return prisma.notification.create({
      data,
    });
  }

  async findUnreadByUserId(userId: string, limit = 5): Promise<Notification[]> {
    return prisma.notification.findMany({
      where: {
        userId,
        isRead: false,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  }

  async findAllByUserId(userId: string, limit = 20, offset = 0): Promise<Notification[]> {
    return prisma.notification.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
    });
  }

  async countUnread(userId: string): Promise<number> {
    return prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });
  }

  async markAsRead(id: string): Promise<Notification> {
    return prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markOneRead(userId: string, notificationId: string): Promise<Prisma.BatchPayload> {
    return prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId: userId,
      },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string): Promise<Prisma.BatchPayload> {
    return prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: { isRead: true },
    });
  }
}
