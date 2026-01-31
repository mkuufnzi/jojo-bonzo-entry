/**
 * App Resolution Service
 * 
 * Handles creation and resolution of Apps for system workflows.
 * Implements architecture rule: "All API calls must have App + API Key"
 */
import prisma from '../lib/prisma';
import { logger } from '../lib/logger';
import { v4 as uuid } from 'uuid';

/**
 * Get or create a default "System Automation" app for a business
 * @param businessId - The business ID to create the app for
 * @returns The App ID (existing or newly created)
 */
/**
 * Resolve the default system app for a business
 * Used for system-triggered workflows (like ERP webhooks) where we need a valid App context
 * 
 * Strategy:
 * 1. Find the business owner
 * 2. Return their "Default App" (created at signup)
 * 3. Fallback to any active app if "Default App" not found
 */
export async function resolveSystemApp(businessId: string): Promise<string> {
  const user = await prisma.user.findFirst({ 
    where: { businessId },
    include: { 
      apps: {
        where: { isActive: true },
        orderBy: { createdAt: 'asc' }
      }
    }
  });
  
  if (!user) {
    throw new Error(`No user found for businessId: ${businessId}`);
  }
  
  if (!user.apps || user.apps.length === 0) {
    // Critical architecture failure - user exists but has no apps
    // This should ideally never happen if AuthService is working correctly
    logger.warn({ businessId, userId: user.id }, 'User has no active apps, creating fallback Default App');
    
    // Auto-repair: Create a Default App
    const crypto = require('crypto');
    const apiKey = 'fl_' + crypto.randomBytes(24).toString('hex');
    
    const app = await prisma.app.create({
      data: {
        id: uuid(),
        name: 'Default App',
        description: 'Auto-created fallback app',
        apiKey: apiKey,
        userId: user.id,
        isActive: true
      }
    });
    
    return app.id;
  }
  
  // Prefer "Default App" if it exists
  const defaultApp = user.apps.find(app => app.name === 'Default App');
  if (defaultApp) {
    return defaultApp.id;
  }
  
  // Fallback to the first active app (e.g. if they renamed it)
  return user.apps[0].id;
}
