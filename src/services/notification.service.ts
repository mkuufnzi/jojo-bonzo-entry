import { NotificationRepository } from '../repositories/notification.repository';

import prisma from '../lib/prisma';
import { emailService } from './email.service';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';
export type NotificationCategory = 'toolSuccess' | 'toolFailure' | 'billingAlert' | 'paymentAction' | 'syncEvent' | 'recoveryAction' | 'recoveryAlert';

export class NotificationService {
  private notificationRepository: NotificationRepository;

  constructor() {
    this.notificationRepository = new NotificationRepository();
  }

  async notifyUser(userId: string, type: NotificationType, title: string, message: string, category?: NotificationCategory, link?: string) {
    // 1. Fetch User & Settings
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { notificationConfig: true }
    });

    if (!user) return;

    // 2. Get or Create Config (Default to ALL ON)
    let config = user.notificationConfig;
    if (!config) {
        config = await prisma.notificationConfig.create({
            data: { userId }
        });
    }

    // 3. In-App Notification Logic
    // Check global toggle AND (category toggle OR true if no category)
    const categoryInApp = category ? config[category] : true;
    if (config.inAppEnabled && categoryInApp) {
        await this.notificationRepository.create({
            user: { connect: { id: userId } },
            type,
            title,
            message,
            link,
        });
    }

    // 4. Email Notification Logic
    // Check global toggle AND (category toggle OR true if no category)
    const categoryEmail = category ? config[category] : true;
    if (config.emailEnabled && categoryEmail) {
        try {
            await emailService.sendNotificationEmail(user.email, title, message, link);
        } catch (error) {
            console.error(`Failed to send email to ${user.email}:`, error);
        }
    }
  }

  /**
   * Notifies all users associated with a specific business.
   * Useful for background jobs or webhooks where `req.user` isn't available.
   */
  async notifyBusiness(businessId: string, type: NotificationType, title: string, message: string, category?: NotificationCategory, link?: string) {
    // Note: Assuming `businessId` exists on the User model as determined in DB schema
    const users = await prisma.user.findMany({ 
        where: { businessId }, 
        select: { id: true } 
    });
    
    // Dispatch notifications in parallel
    const notifyPromises = users.map(u => 
        this.notifyUser(u.id, type, title, message, category, link)
    );
    
    await Promise.allSettled(notifyPromises);
  }

  async getSettings(userId: string) {
      const config = await prisma.notificationConfig.findUnique({ where: { userId } });
      if (config) return config;
      // Return default if not exists
      return prisma.notificationConfig.create({ data: { userId } });
  }

  async updateSettings(userId: string, data: any) {
      return prisma.notificationConfig.upsert({
          where: { userId },
          create: { userId, ...data },
          update: data
      });
  }

  async getRecentNotifications(userId: string) {
    return this.notificationRepository.findAllByUserId(userId, 10);
  }

  async getUnreadCount(userId: string) {
    return this.notificationRepository.countUnread(userId);
  }

  async markAsRead(userId: string, notificationId: string) {
    const result = await this.notificationRepository.markOneRead(userId, notificationId);
    
    if (result.count === 0) {
        // Either not found or not owned by user. 
        // We can silently fail or throw. Silently failing is often safer for IDOR probing.
    }
  }

  async markAllAsRead(userId: string) {
    return this.notificationRepository.markAllAsRead(userId);
  }
}

// Export a singleton for easy use in other services
export const notificationService = new NotificationService();
