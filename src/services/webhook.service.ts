import axios from 'axios';
import { logger } from '../lib/logger';
import prisma from '../lib/prisma';
import { AppError } from '../lib/AppError';

interface WebhookConfig {
    analyze?: string;
    generate?: string;
    [key: string]: string | undefined;
}

/**
 * Webhook Service for n8n Integration (Database Driven)
 * 
 * Manages a registry of webhook endpoints loaded dynamically from the Service table.
 * Implements caching to ensure 100% scalability (lean DB usage).
 */
export class WebhookService {
    private registry: Map<string, WebhookConfig> = new Map();
    private initialized = false;
    private lastRefresh = 0;
    // Env-configurable TTL: short in dev to catch any URL changes quickly
    private readonly REFRESH_INTERVAL = parseInt(process.env.WEBHOOK_CACHE_TTL_MS || '60000', 10);

    constructor() {}

    /**
     * Ensures configuration is loaded from DB.
     * Call this before accessing endpoints.
     */
    private async ensureInitialized() {
        if (this.initialized && (Date.now() - this.lastRefresh < this.REFRESH_INTERVAL)) {
            return;
        }
        await this.refreshConfig();
    }

    /**
     * Forces a refresh of the webhook configuration from the database.
     * Public so boot.ts and seeder can call it immediately after writing new URLs.
     */
    async refreshConfig() {
        console.log('🔄 [WebhookService] Refreshing configuration from Database...');
        try {
            const services = await prisma.service.findMany({
                where: { isActive: true }
            });

            this.registry.clear();
            
            for (const service of services) {
                const defaultConfig = (service.defaultConfig as any) || {};
                const runtimeConfig = (service.config as any) || {};
                
                // CRITICAL MERGE ORDER: runtime config (DB service.config) MUST override defaultConfig.
                // defaultConfig is the code-defined baseline; runtimeConfig is the authoritative DB entry.
                const webhooks = {
                    ...(defaultConfig.webhooks || {}),
                    ...(runtimeConfig.webhooks || {})
                };

                if (Object.keys(webhooks).length > 0) {
                    this.registry.set(service.slug, webhooks);
                    // Log every resolved URL upfront so stale cache issues are immediately visible
                    for (const [action, cfg] of Object.entries(webhooks)) {
                        const url = typeof cfg === 'string' ? cfg : (cfg as any)?.url;
                        console.log(`   [WebhookService] ${service.slug}.${action} → ${url}`);
                    }
                }
            }
            
            this.initialized = true;
            this.lastRefresh = Date.now();
            console.log(`✅ [WebhookService] Registry ready (${this.registry.size} services, TTL=${this.REFRESH_INTERVAL}ms).`);
        } catch (error) {
            console.error('❌ [WebhookService] Failed to load configuration:', error);
        }
    }

    /**
     * Immediately invalidates the cache so the next call to getEndpoint()
     * will re-query the database. Call this after any DB write to service.config.
     */
    invalidateCache() {
        this.initialized = false;
        this.lastRefresh = 0;
        console.log('🔄 [WebhookService] Cache invalidated — will refresh on next access.');
    }

    /**
     * Get the appropriate endpoint based on the action and service.
     * Now ASYNC to support lazy loading.
     */
    async getEndpoint(serviceSlug: string, action: string = 'default'): Promise<string> {
        await this.ensureInitialized();

        let targetSlug = serviceSlug;
        
        const config = this.registry.get(targetSlug);
        if (!config) {
            console.warn(`⚠️ [WebhookService] No webhook config found for service: ${targetSlug} (original: ${serviceSlug})`);
            throw new AppError(`Service ${serviceSlug} not configured for webhooks`, 503);
        }

        // Get webhook config for the action
        const webhook = config[action] || config['default'];
        
        if (!webhook) {
             // If requesting 'generate' but only 'default' exists, try default?
             if (config['default']) {
                 const defaultWebhook = config['default'] as any;
                 // Handle both old format (string) and new format (object)
                 return typeof defaultWebhook === 'string' ? defaultWebhook : defaultWebhook.url;
             }

             console.error(`[WebhookService] Endpoint '${action}' not found in config for ${serviceSlug}`);
             throw new AppError(`Webhook action '${action}' not configured`, 503);
        }

        // Handle both old format (string URL) and new format (object with url property)
        const webhookData = webhook as any;
        const url = typeof webhookData === 'string' ? webhookData : webhookData.url;
        
        if (!url) {
            console.error(`[WebhookService] Webhook '${action}' has no URL for ${serviceSlug}`);
            throw new AppError(`Webhook action '${action}' has no URL configured`, 503);
        }

        console.log(`[WebhookService] ✅ Resolved '${action}' for '${serviceSlug}' -> ${url}`);
        logger.info({ serviceSlug, action, url }, '✅ [WebhookService] Endpoint resolved');
        return url;
    }

    /**
     * Trigger a generic event (Fire-and-forget)
     */
    async sendTrigger(serviceSlug: string, event: string, payload: any) {
        try {
            const url = await this.getEndpoint(serviceSlug, 'default');
            const data = {
                eventType: event,
                timestamp: new Date().toISOString(),
                ...payload
            };

            // Fire and forget
            axios.post(url, data).catch(err => console.error(`Webhook Trigger Error (${event}):`, err.message));

        } catch (error: any) {
            console.warn(`[WebhookService] Skipped trigger '${event}': ${error.message}`);
        }
    }
}

export const webhookService = new WebhookService();
