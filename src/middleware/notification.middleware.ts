import { Request, Response, NextFunction } from 'express';
import { notificationService } from '../services/notification.service';

export const injectNotificationCount = async (req: Request, res: Response, next: NextFunction) => {
  if ((req.session as any)?.userId) {
    try {
      const count = await notificationService.getUnreadCount((req.session as any).userId);
      res.locals.unreadNotificationsCount = count;
    } catch (error) {
      console.error('Failed to fetch notification count:', error);
      res.locals.unreadNotificationsCount = 0;
    }
  } else {
    res.locals.unreadNotificationsCount = 0;
  }
  next();
};
