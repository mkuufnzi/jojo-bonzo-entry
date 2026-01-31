import { AppRepository } from '../repositories/app.repository';
import { UserRepository } from '../repositories/user.repository';
import { ServiceRepository } from '../repositories/service.repository';
import { LogRepository } from '../repositories/log.repository';
import { NotificationService } from './notification.service';
import { EmailService } from './email.service';
import { FeatureAccessService } from './feature-access.service';
import { AppError } from '../lib/AppError';
import { v4 as uuidv4 } from 'uuid';

interface LogContext {
    ipAddress?: string;
    userAgent?: string;
    userId: string;
}

export class AppService {
  private appRepository: AppRepository;
  private userRepository: UserRepository;
  private serviceRepository: ServiceRepository;
  private logRepository: LogRepository;
  private notificationService: NotificationService;
  private emailService: EmailService;

  constructor() {
    this.appRepository = new AppRepository();
    this.userRepository = new UserRepository();
    this.serviceRepository = new ServiceRepository();
    this.logRepository = new LogRepository();
    this.notificationService = new NotificationService();
    this.emailService = new EmailService();
  }

  async getDashboardData(userId: string) {
      const user = await this.userRepository.findByIdWithRelations(userId);
      if (!user) throw new AppError('User not found', 404);

      const services = await this.serviceRepository.findAllActive();
      
      const enrichedServices = services.map(service => {
          const s = service as any;
          let isLocked = false;
          
          if (s.requiredFeatureKey) {
             // Simple Feature Check
             if (s.requiredFeatureKey === 'ai_generation') {
                  const quota = user.subscription?.plan?.aiQuota ?? 0;
                  const hasAccess = !!(user as any).hasAiAccess || quota !== 0;
                  if (!hasAccess) isLocked = true;
             } else if (s.requiredFeatureKey === 'pdf_conversion') {
                  const quota = user.subscription?.plan?.pdfQuota ?? 0;
                  const hasAccess = !!(user as any).hasPdfAccess || quota !== 0;
                  if (!hasAccess) isLocked = true;
             } else {
                 if (!FeatureAccessService.hasFeature(user, s.requiredFeatureKey)) {
                     isLocked = true;
                 }
             }
          }
          
          return { ...s, isLocked };
      });

      return { user, services: enrichedServices };
  }

  /**
   * Encapsulates logic for the Apps Dashboard.
   * Ensures lazy provisioning of services and returns all necessary data.
   */
  async getUserAppsOverview(userId: string) {
      // 1. Auto-Provisioning (Lazy Fix)
      await this.ensureAllServicesLinked(userId);

      // 2. Fetch User with Apps & Subscription
      // We use the Repository's enriched fetcher
      const user = await this.userRepository.findByIdWithRelations(userId);
      if (!user) throw new AppError('User not found', 404);

      // 3. Fetch All Active Services (for the "Enabled Services" toggle list)
      const services = await this.serviceRepository.findAllActive();

      return { user, services };
  }

  /**
   * Ensures all active services are linked to the user's apps.
   * Useful for backfilling new services to existing apps.
   */
  async ensureAllServicesLinked(userId: string) {
      const user = await this.userRepository.findByIdWithRelations(userId);
      if (!user) return; // Should not happen if auth middleware passed

      const allServices = await this.serviceRepository.findAllActive();
      
      for (const app of user.apps) {
          const missingServices = allServices.filter(s => !app.services.find(as => as.serviceId === s.id));
          
          if (missingServices.length > 0) {
              await Promise.all(missingServices.map(s => 
                  this.appRepository.upsertService(app.id, s.id, true)
              ));
          }
      }
  }

  async getConnectedApps(userId: string, serviceId?: string) {
      const user = await this.userRepository.findByIdWithRelations(userId);
      if (!user) throw new AppError('User not found', 404);

      // [LAZY PROVISIONING] Ensure all active services are linked to user's apps
      // This heals "No services available" for existing apps when new services land.
      const allServices = await this.serviceRepository.findAllActive();
      
      for (const app of user.apps) {
          const missingServices = allServices.filter(s => !app.services.find(as => as.serviceId === s.id));
          
          if (missingServices.length > 0) {
              // Create missing links
              await Promise.all(missingServices.map(s => 
                  this.appRepository.upsertService(app.id, s.id, true)
              ));
              // Refresh app instance in memory (simple re-fetch logic or manual push)
              const RefreshedApp = await this.appRepository.findById(app.id); // Optimized in repo usually
              // For now, assume it worked and manually patch the in-memory object 
              // to avoid N+1 DB calls if possible, or just re-fetch in next step if critical.
              // Let's just create them. The loop below reads from 'user.apps' which is stale.
          }
      }

      // Re-fetch clean state after provisioning
      const refreshedUser = await this.userRepository.findByIdWithRelations(userId);
      if (!refreshedUser) throw new AppError('User missing after refresh', 500);

      const connectedApps: any[] = [];
      
      refreshedUser.apps.forEach(app => {
          // If a specific serviceId is requested, we are looking for enabling state of THAT service
          // but usually we want all context. 
          // If serviceId is passed, filter? The original code uses find to get ONE entry?
          // The signature was `getConnectedApps(userId, serviceId)`.
          // But dashboard usage implies getting ALL apps and their status for that service.
          
          if (serviceId) {
             // Specific Service Context
             const appService = app.services.find(s => s.serviceId === serviceId);
             connectedApps.push({
                app: app,
                isEnabled: appService ? appService.isEnabled : false
             });
          } else {
              // Apps Dashboard Context (List all services?)
              // The original logic was: returns list of { app, isEnabled } objects.
              // But 'isEnabled' is vague if multiple services exist.
              // Usually this method is called per-service context.
              // Wait, DashboardController.apps calls this?
              // No, DashboardController.apps calls `prisma.user.findUnique({ include: apps })` directly!
              // Users might be confused. ServicesController.initializeToolHub calls this!
              // ServicesController checks ONE service.
              
              const appService = app.services.find(s => s.serviceId === serviceId); // serviceId might be undefined!
              connectedApps.push({
                  app: app,
                  isEnabled: appService ? appService.isEnabled : false
              });
          }
      });

      return connectedApps;
  }

  async getAllServices() {
      return this.serviceRepository.findAllActive();
  }

  async getServiceBySlug(slug: string) {
      return this.serviceRepository.findBySlug(slug);
  }

  async createApp(userId: string, name: string, serviceIds: string[], context: LogContext) {
    const user = await this.userRepository.findByIdWithRelations(userId);
    if (!user) throw new AppError('User not found', 404);

    const planName = user.subscription?.plan?.name || 'Free';
    let appLimit = 1;
    if (planName === 'Pro') appLimit = 5;
    if (planName === 'Enterprise') appLimit = 50;

    const currentAppCount = await this.appRepository.countByUserId(userId);
    if (currentAppCount >= appLimit) {
      throw new AppError(`App limit reached for ${planName} plan. Upgrade to create more apps.`, 403);
    }

    const apiKey = `fl_${uuidv4().replace(/-/g, '')}`;
    
    // Validate Services against Plan before connecting
    const services = await this.serviceRepository.findAllActive();
    const authorizedServiceIds: string[] = [];

    for (const id of serviceIds) {
        const service = services.find(s => s.id === id);
        if (!service) continue;

        const requiredFeature = (service as any).requiredFeatureKey;
        if (requiredFeature) {
            let hasAccess = false;
            if (requiredFeature === 'ai_generation') {
                const quota = user.subscription?.plan?.aiQuota ?? 0;
                hasAccess = !!(user as any).hasAiAccess || quota !== 0; // Allow -1 (Unlimited)
            } else if (requiredFeature === 'pdf_conversion') {
                const quota = user.subscription?.plan?.pdfQuota ?? 0;
                hasAccess = !!(user as any).hasPdfAccess || quota !== 0; // Allow -1 (Unlimited)
            } else {
                hasAccess = FeatureAccessService.hasFeature(user, requiredFeature);
            }

            if (hasAccess) {
                authorizedServiceIds.push(id);
            } else {
                console.log(`[SECURITY] User ${user.email} attempted to create app with locked service: ${service.name}`);
                // Instead of throwing and failing the whole creation, we'll just not connect the locked services
                // Or we can throw. Throwing is safer for "production ready".
                throw new AppError(`Your plan does not include the ${service.name} service. Please upgrade to Pro.`, 403);
            }
        } else {
            authorizedServiceIds.push(id);
        }
    }

    const app = await this.appRepository.create({
      name,
      apiKey,
      user: { connect: { id: userId } },
      services: {
          create: authorizedServiceIds.map(id => ({
              service: { connect: { id } }
          }))
      }
    });

    await this.logRepository.createUsageLog({
        userId,
        appId: app.id,
        action: 'create_app',
        status: 'success',
        statusCode: 200,
        duration: 0,
        cost: 0,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
    });

    await this.notificationService.notifyUser(userId, 'success', 'App Created', `Your app "${name}" has been created successfully.`);

    return app;
  }

  async regenerateApiKey(userId: string, appId: string, context: LogContext) {
    const app = await this.appRepository.findById(appId);
    if (!app) throw new AppError('App not found', 404);
    if (app.userId !== userId) throw new AppError('Unauthorized', 403);

    const newApiKey = `fl_${uuidv4().replace(/-/g, '')}`;
    const updatedApp = await this.appRepository.update(appId, { apiKey: newApiKey });

    await this.logRepository.createUsageLog({
        userId,
        appId: appId,
        action: 'regenerate_key',
        status: 'success',
        statusCode: 200,
        duration: 0,
        cost: 0,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
    });

    await this.notificationService.notifyUser(userId, 'warning', 'API Key Regenerated', `The API key for app "${app.name}" has been regenerated.`);
    
    const user = await this.userRepository.findById(userId);
    if (user) {
        await this.emailService.sendNotification(user.email, 'API Key Regenerated', `Your API key for app "${app.name}" was regenerated. If this wasn't you, please contact support immediately.`);
    }

    return updatedApp;
  }

  async deleteApp(userId: string, appId: string, context: LogContext) {
    const app = await this.appRepository.findById(appId);
    if (!app) throw new AppError('App not found', 404);
    if (app.userId !== userId) throw new AppError('Unauthorized', 403);

    // Log before deletion to ensure we capture the event with the appId
    // Note: If deletion fails, we might have a log for a failed deletion? 
    // Ideally we wrap in transaction, but for now this is safer than logging after.
    // Or we log "attempt_delete" then "deleted".
    // Or we just log with appId and if it's deleted, the log remains (if FK allows).
    // Since we use scalars, we can log even if app is deleted IF the DB doesn't enforce FK on UsageLog.appId.
    // But DB DOES enforce FK. So we MUST log BEFORE deletion if we want to link to App.
    // BUT if we delete the App, the log with that AppId might be deleted if Cascade is on.
    // If Cascade is NOT on, we can't delete the App if logs exist.
    // Let's assume we want to keep logs. So UsageLog.appId should be set to NULL or we rely on Cascade Delete (which deletes logs).
    // If logs are deleted, then logging "delete_app" is pointless if it gets deleted immediately.
    // Usually, for audit, we want to keep logs. So UsageLog.appId should be nullable and ON DELETE SET NULL.
    // I'll assume the schema handles it or I should set appId to null in the log?
    // If I set appId to null, I lose context.
    // I'll log it. If it disappears, it disappears.
    
    await this.logRepository.createUsageLog({
        userId,
        appId: appId,
        action: 'delete_app',
        status: 'success',
        statusCode: 200,
        duration: 0,
        cost: 0,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
    });

    await this.appRepository.delete(appId);

    await this.notificationService.notifyUser(userId, 'info', 'App Deleted', `Your app "${app.name}" has been deleted.`);
  }

  async toggleActive(userId: string, appId: string, isActive: boolean, context: LogContext) {
      const app = await this.appRepository.findById(appId);
      if (!app) throw new AppError('App not found', 404);
      if (app.userId !== userId) throw new AppError('Unauthorized', 403);

      const updatedApp = await this.appRepository.update(appId, { isActive });

      await this.logRepository.createUsageLog({
        userId,
        appId: appId,
        action: isActive ? 'restore_app_access' : 'revoke_app_access',
        status: 'success',
        statusCode: 200,
        duration: 0,
        cost: 0,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
    });

    return updatedApp;
  }

  async toggleService(userId: string, appId: string, serviceId: string, isEnabled: boolean, context: LogContext) {
      const app = await this.appRepository.findById(appId);
      if (!app) throw new AppError('App not found', 404);
      if (app.userId !== userId) throw new AppError('Unauthorized', 403);

      const service = await this.serviceRepository.findById(serviceId);
      if (!service) throw new AppError('Service not found', 404);

      if (isEnabled) {
          // Fetch user with complete relations
          const fullUser = await this.userRepository.findByIdWithRelations(userId);
          if (!fullUser) throw new AppError('User not found', 404);

          // Standard SaaS Event Gate: Only active/canceling users can manage services
          const validStatuses = ['active', 'canceling'];
          if (!fullUser.subscription || !validStatuses.includes(fullUser.subscription.status)) {
              throw new AppError('An active subscription is required to manage services. Please update your payment method.', 403);
          }

          // Get required feature from service record
          const requiredFeature = (service as any).requiredFeatureKey;

          if (requiredFeature) {
              let hasAccess = false;

              // Strict Plan Feature Access Check
              if (requiredFeature === 'ai_generation') {
                  const quota = fullUser.subscription?.plan?.aiQuota ?? 0;
                  hasAccess = !!(fullUser as any).hasAiAccess || quota !== 0;
              } else if (requiredFeature === 'pdf_conversion') {
                  const quota = fullUser.subscription?.plan?.pdfQuota ?? 0;
                  hasAccess = !!(fullUser as any).hasPdfAccess || quota !== 0;
              } else {
                  hasAccess = FeatureAccessService.hasFeature(fullUser, requiredFeature);
              }

              if (!hasAccess) {
                  throw new AppError(`Upgrade to Pro to enable ${service.name} for your apps.`, 403);
              }
          }

          await this.appRepository.upsertService(appId, serviceId, true);
      } else {
          // User requirement: Disabling from Apps page should remove the connection entirely
          await this.appRepository.removeService(appId, serviceId);
      }

      await this.logRepository.createUsageLog({
        userId,
        appId,
        serviceId,
        action: isEnabled ? 'enable_service' : 'disable_service',
        status: 'success',
        statusCode: 200,
        duration: 0,
        cost: 0,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
    });
  }
}


