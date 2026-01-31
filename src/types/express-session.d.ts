import 'express-session';
import { App } from '@prisma/client';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    partialAuth?: string; // For 2FA or multi-step auth
    currentApp?: any; // App
    notification?: { type: 'success' | 'error' | 'info'; message: string };
  }
}
