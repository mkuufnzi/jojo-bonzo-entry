import { exec } from 'child_process';
import util from 'util';
import prisma from './prisma';
import { SeederService } from '../services/seeder.service';
import { StripeProvider } from '../services/payment/stripe.provider';
import { logger } from './logger';

const execPromise = util.promisify(exec);

export class BootManager {
  
  static async initialize() {
    logger.info('🚀 Starting Boot Sequence...');

    try {
      // 1. Check Database Connection
      await this.checkDatabaseConnection();

      // 2. Check & Apply Migrations (Self-Healing)
      await this.ensureMigrations();

      // 3. Seed Data (Idempotent)
      logger.info('🌱 Seeding Core Data...');
      await SeederService.seed();
      
      // 3.1 Seed Features (New System)
      logger.info('🌱 Seeding Features and Plans...');
      const { FeatureSeeder } = await import('../services/feature-seeder.service');
      await FeatureSeeder.seedFeatures();

      // 3.2 Force-refresh WebhookService so stale cache never persists across restarts.
      //     Seeder may have written new URLs to service.config; the singleton must re-read them.
      logger.info('🔄 Forcing WebhookService cache refresh after seeding...');
      const { webhookService } = await import('../services/webhook.service');
      webhookService.invalidateCache();
      await webhookService.refreshConfig();
      logger.info('✅ WebhookService cache warmed with current DB config.');

      // 3.3 Verify Critical Data
      await this.verifyCriticalData();

      // 4. Sync Stripe Price IDs (if Stripe is configured)
      await this.syncStripePriceIds();

      // 5. Initialize V2 Architecture (Enterprise Services)
      logger.info('🚀 Initializing V2 Services...');
      await this.initializeV2Services();
      logger.info('✅ V2 Architecture Active.');

      // 6. Schedule Automated Tasks (Cron Jobs)
      logger.info('⏰ Scheduling Cron Jobs...');
      await this.scheduleCronJobs();


      logger.info('✅ Boot Sequence Completed Successfully.');
    } catch (error: any) {
      logger.error({ msg: '❌ Boot Sequence Failed', error: error.message });
      logger.fatal('⚠️ Server cannot start without a healthy database state.');
      process.exit(1);
    }
  }

  /**
   * Schedule Repeatable BullMQ Jobs — Production-Grade Orchestrator
   * 
   * ARCHITECTURE:
   * Instead of 2 daily mega-jobs that iterate ALL tenants sequentially,
   * we use an ORCHESTRATOR pattern:
   * 
   *   recovery:orchestrate (every 15 min)
   *     → Finds all tenants with active sequences
   *     → Fans out ONE job per tenant (staggered delays)
   *     → Each tenant job handles sync + process independently
   *     → Tenant failures are isolated
   * 
   * SCALING: At 10k tenants, this processes tenants in parallel
   * instead of 8+ hours of sequential processing.
   */
  private static async scheduleCronJobs() {
    try {
      const { QUEUES, createQueue } = await import('./queue');
      const recoveryQueue = createQueue(QUEUES.RECOVERY_ENGINE);

      // ── Clean up old cron patterns from previous architecture ──
      // Remove legacy daily-only crons if they still exist in Redis
      const existingRepeatable = await recoveryQueue.getRepeatableJobs();
      for (const job of existingRepeatable) {
        if (['recovery-erp-sync-id', 'recovery-daily-dispatch-id'].includes(job.id || '')) {
          await recoveryQueue.removeRepeatableByKey(job.key);
          logger.info(`   🗑️ Removed legacy cron: ${job.name} (${job.id})`);
        }
      }

      // 1. Recovery Orchestrator (Every 15 minutes)
      // Fans out per-tenant sync + process jobs with staggered delays.
      // Replaces both the old 8AM erp-sync and 9AM daily-dispatch.
      await recoveryQueue.add('recovery:orchestrate', {}, {
        repeat: {
          pattern: '*/15 * * * *'  // Every 15 minutes
        },
        jobId: 'recovery-orchestrate-v2'
      });
      logger.info('   ✅ Recovery Orchestrator Scheduled (*/15 * * * *)');

      // 2. Boot-time Orchestrate (catches up immediately on server start)
      // Runs the orchestrator once on boot so the operator sees the full E2E flow.
      await recoveryQueue.add('recovery:orchestrate', {
        trigger: 'boot',
        bootTime: new Date().toISOString()
      }, {
        delay: 15000,  // 15s — allow workers to fully initialize
        jobId: `recovery-boot-orchestrate-${Date.now()}`,
        removeOnComplete: true
      });
      logger.info('   ✅ Boot-time Orchestrator queued (15s delay)');

    } catch (error: any) {
      logger.error({ err: error }, '   ⚠️ Failed to schedule cron jobs');
    }
  }

  private static async checkDatabaseConnection() {
    logger.debug('🔍 Checking Database Connection...');
    try {
      await prisma.$queryRaw`SELECT 1`;
      logger.info('✅ Database Connected.');
    } catch (error) {
      throw new Error('Could not connect to the database. Ensure Postgres is running and accessible.');
    }
  }

  private static async ensureMigrations() {
    logger.debug('🔍 Checking Database Schema...');
    try {
      // Simple check: does the Service table exist?
      // Note: this relies on Prisma's raw query support
      await prisma.service.count();
      logger.debug('✅ Schema appears valid.');
    } catch (error: any) {
      // P2021: Table does not exist in the current database.
      if (error.code === 'P2021' || error.message.includes('does not exist')) {
        logger.warn('⚠️ Database schema missing. Attempting to run migrations...');
        await this.runMigrationCommand();
      } else {
        throw error;
      }
    }
  }

  private static async runMigrationCommand() {
    try {
      logger.info('⚙️ Running "npx prisma migrate deploy"...');
      const { stdout, stderr } = await execPromise('npx prisma migrate deploy');
      logger.info(stdout);
      if (stderr) logger.warn(stderr); // generic warnings
      logger.info('✅ Migrations Applied.');
    } catch (error: any) {
      throw new Error(`Failed to apply migrations: ${error.message}`);
    }
  }

  private static async verifyCriticalData() {
    const serviceCount = await prisma.service.count();
    const planCount = await prisma.plan.count();
    
    logger.info({ serviceCount, planCount }, '📊 Data Verification');

    if (serviceCount === 0 || planCount === 0) {
      logger.warn('⚠️ CRITICAL: Core data (Services/Plans) is missing after seed!');
      // Optional: Retry seed or throw? For now, just warn loudly.
    }
  }

  /**
   * Sync Stripe Price IDs to the Plans table
   * Matches Stripe products to Plans by name and updates stripePriceId
   */
  private static async syncStripePriceIds() {
    logger.info('🔗 Syncing Stripe Price IDs...');
    
    try {
      const stripeProvider = new StripeProvider();
      const stripePrices = await stripeProvider.fetchAllPricesWithProducts();

      if (stripePrices.length === 0) {
        logger.info('⚠️ No active prices found in Stripe. Skipping sync.');
        return;
      }

      // Get all plans from database
      const plans = await prisma.plan.findMany();

      let updatedCount = 0;
      for (const plan of plans) {
        // Skip Free plan - it doesn't need a Stripe price
        if (plan.name.toLowerCase() === 'free' || plan.price === 0) {
          continue;
        }

        // Find matching Stripe price by product name (case-insensitive)
        const matchingPrice = stripePrices.find(
          sp => sp.productName.toLowerCase() === plan.name.toLowerCase()
        );

        if (matchingPrice) {
          // Check if name, price ID, or amount needs updating
          const needsUpdate = 
            plan.name !== matchingPrice.productName ||
            plan.stripePriceId !== matchingPrice.priceId || 
            plan.price !== matchingPrice.amount;

          if (needsUpdate) {
            await (prisma.plan.update as any)({
              where: { id: plan.id },
              data: { 
                name: matchingPrice.productName,  // Sync name from Stripe
                stripePriceId: matchingPrice.priceId,
                price: matchingPrice.amount,
                currency: matchingPrice.currency
              }
            });
            logger.info(`   ↳ Updated ${plan.name} → ${matchingPrice.productName}: ${matchingPrice.priceId} (${matchingPrice.currency} ${matchingPrice.amount})`);
            updatedCount++;
          }
        } else {
          logger.info(`   ⚠️ No Stripe product found matching "${plan.name}". Initiating Auto-Creation...`);
          try {
            // Auto-create product in Stripe
            const newStripeData = await stripeProvider.createProduct(plan.name, plan.price, 'month');
            
            // Sync new ID to DB
            await (prisma.plan.update as any)({
              where: { id: plan.id },
              data: { 
                 stripePriceId: newStripeData.priceId,
                 currency: 'USD' 
              }
            });
            logger.info(`   ✨ Automatically Created & Synced: ${plan.name} -> ${newStripeData.priceId}`);
            updatedCount++;
          } catch (err: any) {
            logger.error(`   ❌ Failed to auto-create Stripe product for ${plan.name}: ${err.message}`);
          }
        }
      }

      // Also check for Stripe products that don't exist in Prisma yet
      for (const stripePrice of stripePrices) {
        const existingPlan = plans.find(p => 
          p.name.toLowerCase() === stripePrice.productName.toLowerCase() ||
          p.stripePriceId === stripePrice.priceId
        );
        
        if (!existingPlan) {
          logger.info(`   ℹ️ Stripe product "${stripePrice.productName}" not found in database. Create it manually or via seeder.`);
        }
      }

      if (updatedCount > 0) {
        logger.info(`✅ Synced ${updatedCount} Stripe Price ID(s).`);
      } else {
        logger.info('✅ Stripe Price IDs already in sync.');
      }
    } catch (error: any) {
      // Non-fatal: Log warning but don't crash the boot sequence
      logger.warn({ err: error.message }, '⚠️ Stripe sync failed (non-fatal)');
      logger.warn('   Stripe integration may not work correctly until configured.');
    }
  }

  /**
   * Initialize Service Registry and Auto-Discover Endpoints
   */
  static async initializeServiceRegistry(app: any) {
    try {
      logger.info('🔧 Initializing Service Registry...');
      
      const { serviceRegistry } = await import('../services/service-registry.service');
      
      // Load all active services into memory cache for fast lookups
      await serviceRegistry.loadServices();
      
      logger.info('   ✅ Service registry initialized');
    } catch (error) {
      logger.error({ err: error }, '   ⚠️  Service registry initialization failed');
    }
  }

  /**
   * Explicitly Initialize V2 Enterprise Services
   * This ensures they are loaded, connected, and ready before traffic is accepted.
   */
  private static async initializeV2Services() {
      // Import them to trigger instantiation (Singleton Pattern)
      const { transactionalService } = await import('../services/v2/transactional.service');
      const { deliveryService } = await import('../services/v2/delivery.core');
      const { dataSyncService } = await import('../services/data-sync.service');
      const { onboardingService } = await import('../services/onboarding.service');

      // Initialize Debt Collection (Smart Recovery) Module
      const { RecoveryService } = await import('../modules/recovery/recovery.service');
      const recoveryHealth = await RecoveryService.healthCheck();

      if (recoveryHealth.ready) {
          logger.info({
              webhook: recoveryHealth.webhookUrl ? '✅' : '❌',
              activeSequences: recoveryHealth.activeSequences
          }, '   ✅ Debt-Collection AI initialized');
      } else {
          logger.warn({
              issues: recoveryHealth.issues,
              activeSequences: recoveryHealth.activeSequences
          }, '   ⚠️ Debt-Collection AI initialized with issues');
      }

      return {
          transactionServiceV2: transactionalService,
          deliveryServiceV2: deliveryService,
          dataSyncServiceV2: dataSyncService,
          onboardingServiceV2: onboardingService,
          recoveryService: RecoveryService
      };
  }
}
