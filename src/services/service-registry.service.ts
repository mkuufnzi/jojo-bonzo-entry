import prisma from '../lib/prisma';

/**
 * Service Registry
 * Manages service configurations and provides fast in-memory lookups
 * 
 * Design: Simple, lean, production-ready
 * - Loads services from DB into memory at startup
 * - Provides helper methods for inter-service communication
 * - No fragile runtime route inspection
 */

import { aiService } from './ai.service';
import { designEngineService } from './design-engine.service';
import { ServiceManifest } from '../types/service-manifest';
import { ServiceSlug, ServiceConfig, ServiceSlugs } from '../types/service.types';
import { recommendationService } from '../modules/recommendation/recommendation.service';

export class ServiceRegistry {
    private static instance: ServiceRegistry;
    private services: Map<string, any> = new Map();
    private manifests: Map<string, ServiceManifest> = new Map();
    private providers: Map<string, any> = new Map();

    private constructor() {}

    static getInstance(): ServiceRegistry {
        if (!ServiceRegistry.instance) {
            ServiceRegistry.instance = new ServiceRegistry();
        }
        return ServiceRegistry.instance;
    }

    /**
     * Load all active services from database into memory
     * And merge with Code Manifests
     */
    async loadServices() {
        // 1. Load DB Configs
        const services = await prisma.service.findMany({
            where: { isActive: true }
        });

        this.services.clear();
        services.forEach(service => {
            this.services.set(service.slug, service);
        });

        // 2. Register Code Manifests (Manual registration for Monolith)
        // In a true plugin system, this would be a scanner.
        this.registerManifest(aiService.getManifest());
        
        const deManifest = designEngineService.getManifest();
        this.registerManifest(deManifest); // Register 'design-engine'
        this.registerManifest({ ...deManifest, slug: ServiceSlugs.TRANSACTIONAL_BRANDING, name: 'Transactional Branding' }); 
        this.registerManifest({ ...deManifest, slug: 'transactional-core', name: 'Transactional Branding' }); // Legacy alias

        // Debt Collection AI (Smart Recovery)
        this.registerManifest({
            slug: ServiceSlugs.DEBT_COLLECTION,
            name: 'Debt Collection AI',
            description: 'Smart invoice recovery via AI-powered dunning sequences',
            version: '1.0.0',
            actions: [
                {
                    key: 'recovery_action',
                    label: 'Trigger Recovery Action',
                    description: 'Dispatches a recovery email/communication via n8n',
                    endpoint: '/recovery/action',
                    method: 'POST' as any,
                    isBillable: true
                },
                {
                    key: 'data_sync',
                    label: 'CRM Data Synchronization',
                    description: 'Pushes synchronized customer and invoice data to n8n CRM cache',
                    endpoint: '/recovery/sync',
                    method: 'POST' as any,
                    isBillable: false
                }
            ],
            externalCalls: [
                { domain: 'n8n.automation-for-smes.com', purpose: 'Recovery orchestration and CRM Cache' }
            ]
        } as ServiceManifest);

        // Recommendation Engine (Core Product)
        this.registerManifest(recommendationService.getManifest());
        
        // Register Provider Instance for Execution
        this.registerProvider(ServiceSlugs.AI_DOC_GENERATOR, aiService);
        this.registerProvider(ServiceSlugs.DESIGN_ENGINE, designEngineService); 
        this.registerProvider(ServiceSlugs.TRANSACTIONAL_BRANDING, designEngineService); 
        this.registerProvider('transactional-core', designEngineService); // Legacy alias
        this.registerProvider('recommendation-service', recommendationService);

        // Debt Collection Provider (Lazy-loaded to avoid circular imports)
        const { RecoveryService } = await import('../modules/recovery/recovery.service');
        this.registerProvider(ServiceSlugs.DEBT_COLLECTION, new RecoveryService());

        // Integration Hub Provider
        const { integrationService } = await import('./integration.service');
        this.registerProvider(ServiceSlugs.INTEGRATION_HUB, integrationService);

        console.log(`   ✅ Loaded ${services.length} services & ${this.manifests.size} manifests into registry`);
    }

    registerManifest(manifest: ServiceManifest) {
        this.manifests.set(manifest.slug, manifest);
    }

    /**
     * Register a runtime provider (class instance) for handling actions
     */
    registerProvider(slug: string, provider: any) {
        this.providers.set(slug, provider);
    }

    /**
     * Get the runtime provider
     */
    getProvider(slug: string): any {
        return this.providers.get(slug);
    }

    getManifest(slug: string): ServiceManifest | undefined {
        const staticManifest = this.manifests.get(slug);
        const dbService = this.services.get(slug);
        
        // 1. If we have a static manifest, start with it
        // 2. If not, construct a basic shell if we have a DB service
        let manifest: ServiceManifest | undefined = staticManifest ? { ...staticManifest } : undefined;

        if (!manifest && dbService) {
            manifest = {
                slug: dbService.slug,
                name: dbService.name,
                version: '1.0.0-dynamic',
                actions: []
            };
        }

        if (!manifest) return undefined;

        // 3. Merge Dynamic Actions from DB Config
        if (dbService?.config?.webhooks) {
            const dynamicActions = Object.entries(dbService.config.webhooks).map(([key, value]: [string, any]) => ({
                key,
                label: value.label || key,
                description: value.description || 'Dynamic Webhook Action',
                endpoint: value.url, // We might not expose the full URL here for security, but internal use needs it? 
                                     // Actually endpoint usually means /action path. 
                                     // But for dynamic, the key IS the action.
                method: (value.method || 'POST') as any,
                isBillable: true // Default dynamic actions to billable? Or check config?
            }));

            // Filter out overrides (if static manifest already has this key)
            const existingKeys = new Set(manifest.actions.map(a => a.key));
            const newActions = dynamicActions.filter(a => !existingKeys.has(a.key));
            
            manifest.actions = [...manifest.actions, ...newActions];
        }

        return manifest;
    }

    /**
     * Get Actions for a service (from Hybrid Manifest)
     */
    getActions(slug: string) {
        const manifest = this.getManifest(slug);
        return manifest?.actions || [];
    }

    /**
     * Get service configuration by slug
     */
    getService(slug: string) {
        return this.services.get(slug);
    }

    /**
     * Get service config (webhooks, endpoints, etc.)
     */
    getServiceConfig(slug: string): ServiceConfig {
        const service = this.getService(slug);
        return (service?.config as ServiceConfig) || {};
    }

    /**
     * Get webhook configuration for a service action
     */
    getWebhook(serviceSlug: string, actionKey: string): { url: string; method: string } | null {
        const config = this.getServiceConfig(serviceSlug);
        const webhook = config?.webhooks?.[actionKey];
        if (!webhook || !webhook.url) return null;
        return { url: webhook.url, method: webhook.method || 'POST' };
    }

    /**
     * Check if a path is billable for a service
     */
    isPathBillable(serviceSlug: string, path: string): boolean {
        const config = this.getServiceConfig(serviceSlug);
        const paths = config?.paths || [];
        const match = paths.find((p: any) => path.includes(p.path));
        return match?.billable ?? true; // Default to billable if not specified
    }

    /**
     * Call another internal service
     * Used for inter-service communication (e.g., ai-doc-gen → html-to-pdf)
     */
    async callInternalService(
        serviceSlug: string,
        endpoint: string,
        method: string = 'POST',
        payload?: any,
        headers?: Record<string, string>
    ) {
        const service = this.getService(serviceSlug);
        if (!service) {
            throw new Error(`Service ${serviceSlug} not found in registry`);
        }

        // Resolving URL from DB Config (Enterprise Pattern)
        // If the service has an internalUrl defined in its JSON config, use that.
        // Otherwise, fallback to the global APP_URL or localhost.
        const config = (service.config as any) || {};
        const baseUrl = config.internalUrl || process.env.APP_URL || 'http://localhost:3002';
        const url = `${baseUrl}/api${endpoint}`;

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            },
            body: payload ? JSON.stringify(payload) : undefined
        });

        if (!response.ok) {
            throw new Error(`Service call failed: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }
}

export const serviceRegistry = ServiceRegistry.getInstance();
