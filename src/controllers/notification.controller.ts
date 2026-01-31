import { Request, Response, NextFunction } from 'express';
import { notificationService } from '../services/notification.service';

export class NotificationController {
  static async index(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id || (req.session as any).userId;
      const notifications = await notificationService.getRecentNotifications(userId);
      
      // If AJAX request, return JSON
      if (req.xhr || req.headers.accept?.includes('json')) {
        return res.json(notifications);
      }

      // Otherwise render view (if we had a full notifications page)
      res.render('notifications/index', { notifications });
    } catch (error) {
      next(error);
    }
  }

  static async getUnreadCount(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.session as any).userId;
      const count = await notificationService.getUnreadCount(userId);
      res.json({ count });
    } catch (error) {
      next(error);
    }
  }

  static async markRead(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.session as any).userId;
      const { id } = req.params;
      
      await notificationService.markAsRead(userId, id);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  static async markAllRead(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.session as any).userId;
      await notificationService.markAllAsRead(userId);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  static async settings(req: Request, res: Response, next: NextFunction) {
      try {
          const userId = (req.session as any).userId;
          const config = await notificationService.getSettings(userId);
          res.render('notifications/settings', { config, user: res.locals.user });
      } catch (error) {
          next(error);
      }
  }

  static async updateSettings(req: Request, res: Response, next: NextFunction) {
      try {
          const userId = (req.session as any).userId;
          // Extract booleans from checkbox (form) or JSON
          const data = {
              emailEnabled: req.body.emailEnabled === 'on' || req.body.emailEnabled === true,
              inAppEnabled: req.body.inAppEnabled === 'on' || req.body.inAppEnabled === true,
              toolSuccess: req.body.toolSuccess === 'on' || req.body.toolSuccess === true,
              toolFailure: req.body.toolFailure === 'on' || req.body.toolFailure === true,
              billingAlert: req.body.billingAlert === 'on' || req.body.billingAlert === true,
              paymentAction: req.body.paymentAction === 'on' || req.body.paymentAction === true,
          };
          
          await notificationService.updateSettings(userId, data);
          
          if (req.xhr || req.headers.accept?.includes('json')) {
              return res.json({ success: true });
          }
          res.redirect('/notifications/settings?success=true');
      } catch (error) {
          next(error);
      }
  }

  static async createTest(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.session as any).userId;
      await notificationService.notifyUser(
        userId,
        'info',
        'Test Notification',
        `This is a test notification generated at ${new Date().toLocaleTimeString()}`,
        'toolSuccess' // Default category for test
      );
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
}
