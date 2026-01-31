import { SubscriptionRepository } from '../repositories/subscription.repository';
import { LogRepository } from '../repositories/log.repository';
import { notificationService } from './notification.service';
import { AppError } from '../lib/AppError';

import { UsageService } from './usage.service';

export class QuotaService {
  private subscriptionRepository: SubscriptionRepository;
  private logRepository: LogRepository;
  private usageService: UsageService;

  constructor() {
    this.subscriptionRepository = new SubscriptionRepository();
    this.logRepository = new LogRepository();
    this.usageService = new UsageService();
  }

  async checkQuota(userId: string, serviceSlug: string): Promise<void> {
    const subscription = await this.subscriptionRepository.findByUserId(userId);
    
    if (!subscription || !subscription.plan || !['active', 'canceling'].includes(subscription.status)) {
       throw new AppError('An active subscription is required to use this service.', 403);
    }

    // 1. Fetch Service Details to identify characteristic & limit type
    const prisma = (await import('../lib/prisma')).default;
    const service = await prisma.service.findUnique({ where: { slug: serviceSlug } });
    
    if (!service) {
        throw new AppError(`Access Denied: Service '${serviceSlug}' not found or incorrectly configured.`, 404);
    }

    if (!service.isActive) {
        throw new AppError(`Access Denied: Service '${service.name}' is temporarily unavailable.`, 403);
    }

    const featureKey = (service as any).requiredFeatureKey;

    // FAIL-SAFE: If it's an AI or PDF tool but missing a feature key (config error), 
    // we should still treat it as restricted to prevent accidental free access.
    // [FIX] Removed "Magic String" inference (e.g. slug.includes('ai')). 
    // Services MUST have requiredFeatureKey set in DB.
    const inferredFeatureKey = featureKey;

    if (!inferredFeatureKey) return; // Legacy/Public Free tool with no restriction

    // 2. Map featureKey to Plan Quota field
    let limit = -1;
    let limitName = service.name;
    let actionType: string | string[] = [serviceSlug];

    if (featureKey === 'ai_generation') {
        limit = subscription.plan.aiQuota ?? 0;
        limitName = 'AI Generation';
        // AI actions are standardized in ServicesController
        actionType = ['ai_generate_html', 'ai-doc-generator'];
    } else if (featureKey === 'pdf_conversion') {
        limit = subscription.plan.pdfQuota ?? 0;
        limitName = 'PDF Conversion';
        // PDF actions include all conversion variants
        actionType = ['html-to-pdf', 'convert_pdf', 'convert_pdf_internal'];
    } else {
        // Future-proofing: Fallback to generic request limit or a dynamic feature lookup
        // For now, let's treat other pro features as part of general request limit if they don't have a specific quota
        limit = subscription.plan.requestLimit;
        limitName = 'API Requests';
        actionType = serviceSlug;
    }

    // 3. Redis-backed Atomic Check & Reservation
    const { getRedisClient } = await import('../lib/redis');
    const redis = getRedisClient();

    if (redis) {
       const now = new Date();
       const monthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
       const redisKey = `quota:${userId}:${inferredFeatureKey}:${monthKey}`;
       
       // Atomic INCR: "Reserve" a slot before doing work (prevent race condition)
       // If key doesn't exist, we must initialize it from DB first to be accurate
       const exists = await redis.exists(redisKey);
       
       if (!exists) {
           const dbUsage = await this.getPreciseUsageFromDB(userId, inferredFeatureKey);
           // Set calculated usage, expire after 30 days (approx end of month)
           await redis.setex(redisKey, 30 * 24 * 60 * 60, dbUsage);
       }
       
       const newUsage = await redis.incr(redisKey);
       
       // Check Limit against Reserved usage
       if (limit > 0 && newUsage > limit) {
           // [SELF-HEALING] Double-check with DB source of truth before blocking
           // This prevents "Ghost Usage" blocking users (e.g. Redis says 51, DB says 22)
           console.warn(`[QuotaService] Redis Quota Exceeded (${newUsage}/${limit}). Verifying with DB...`);
           
           const dbUsage = await this.getPreciseUsageFromDB(userId, inferredFeatureKey);
           
           if (dbUsage < limit) {
               console.log(`[QuotaService] 🟢 MISMATCH DETECTED! DB says ${dbUsage}/${limit}. Correcting Redis & Allowing.`);
               // Self-Heal: Reset Redis to DB value + 1 (current request)
               const ttl = 30 * 24 * 60 * 60;
               await redis.setex(redisKey, ttl, dbUsage + 1);
               // Allow request to proceed (return implies success)
               return;
           }

           // Confirmed overage
           // Rollback reservation (optional, but good for UX if they are truly blocked)
           await redis.decr(redisKey);

           console.log(`[QuotaService] Limit Reached (Verified) for User ${userId}. Usage: ${dbUsage}/${limit}.`);
           
           throw new AppError(`Quota Exceeded: You have reached your ${limitName} limit (${limit}).`, 403);
       }
       
       // Graceful Warning at 80%
       if (limit > 0 && newUsage === Math.floor(limit * 0.8)) {
           notificationService.notifyUser(userId, 'warning', 'Quota Warning', `You have used 80% of your monthly ${limitName} limit.`).catch(() => {});
       }
       
       return;
    }

    // Fallback: Database Check (if Redis unavailable)
    // 3. Calculate current timeframe
    const now = new Date();
    const startOfPeriod = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfPeriod = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // 4. Count Usage using standardized UsageService
    const usage = await this.usageService.getFeatureUsage(userId, inferredFeatureKey, startOfPeriod, endOfPeriod);

    // 5. Enforce Strict Quota (Hard Stop)
    if (usage >= limit) { // Race condition possible here without Redis
      console.log(`[QuotaService] Limit Reached (DB) for User ${userId}. Limit: ${limit}, Usage: ${usage}. Blocking request.`);
      throw new AppError(`Quota Exceeded: You have reached your ${limitName} limit (${limit}). Please upgrade to continue.`, 403);
    }
  }

  // Helper to fetch usage for Redis initialization
  private async getPreciseUsageFromDB(userId: string, featureKey: string): Promise<number> {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return this.usageService.getFeatureUsage(userId, featureKey, start, end);
  }
}

export const quotaService = new QuotaService();
