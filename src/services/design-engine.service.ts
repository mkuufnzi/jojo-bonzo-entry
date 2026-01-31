import { ServiceManifest } from '../types/service-manifest';
import prisma from '../lib/prisma';
import { logger } from '../lib/logger';
import { n8nPayloadFactory } from './n8n/n8n-payload.factory';
import { OnboardingEventTypes } from '../domain-events';
import { ServiceSlugs } from '../types/service.types';

/**
 * Design Engine
 * Enterprise Service for generating high-fidelity visual assets and documents.
 * 
 * Capabilities:
 * - Layout Composition (JSON -> Structure)
 * - Rendering (Structure -> HTML/PDF)
 * - Brand Parsing (Input -> Style Tokens)
 */
export class DesignEngineService {
    
    constructor() {}

    /**
     * Service Manifest
     * Defines capabilities, dependencies, and billing routes.
     */
    getManifest(): ServiceManifest {
        return {
            slug: ServiceSlugs.DESIGN_ENGINE,
            name: 'Design Engine',
            version: '1.0.0',
            description: 'Centralized rendering core for generating branded visual assets and documents across all products.',
            actions: [
                {
                    key: 'compose',
                    label: 'Compose Layout',
                    description: 'Generates a layout structure from raw data and context.',
                    endpoint: '/compose',
                    method: 'POST',
                    isBillable: false
                },
                {
                    key: 'generate',
                    label: 'Generate Document',
                    description: 'Full pipeline generation: Data -> Layout -> PDF',
                    endpoint: '/generate',
                    method: 'POST',
                    requiredFeature: 'advanced_branding',
                    isBillable: true
                },
                {
                    key: 'render',
                    label: 'Render Document',
                    description: 'Transmutes layout structure into final HTML/PDF artifacts.',
                    endpoint: '/render',
                    method: 'POST',
                    requiredFeature: 'advanced_branding',
                    isBillable: true
                },
                {
                    key: 'extract_styles',
                    label: 'Extract Brand Identity',
                    description: 'Analyzes visual inputs (URLs, PDFs) to extract design tokens.',
                    endpoint: '/extract',
                    method: 'POST',
                    isBillable: true
                },
                {
                    key: 'ping',
                    label: 'Ping Service',
                    description: 'Health check connectivity to external providers.',
                    endpoint: '/ping',
                    method: 'POST',
                    isBillable: false
                }
            ],
            externalCalls: [
                { domain: 'n8n.automation-for-smes.com', purpose: 'AI Visual Analysis & Layout Optimization' }
            ],
            endpoints: [
                { path: `/services/${ServiceSlugs.DESIGN_ENGINE}/compose`, method: 'POST', description: 'Compose API' },
                { path: `/services/${ServiceSlugs.DESIGN_ENGINE}/generate`, method: 'POST', description: 'Full Generation API', billable: true },
                { path: `/services/${ServiceSlugs.DESIGN_ENGINE}/render`, method: 'POST', description: 'Render API', billable: true },
                { path: `/services/${ServiceSlugs.DESIGN_ENGINE}/extract`, method: 'POST', description: 'Brand Extraction API', billable: true }
            ]
        };
    }

    /**
     * Helper: Generate Floovioo ID (Slug)
     */
    private _getFlooviooId(name: string): string {
        return name.replace(/[^a-zA-Z0-9]/g, '');
    }

    /**
     * [Action] Compose Layout
     * Merges Data + Context + Rules -> Layout JSON
     */
    async composeLayout(payload: any, userId: string) {
        const { type, data, options } = payload;
        logger.info({ userId, type }, '🎨 [Design Engine] Composing Layout');

        // 1. Fetch Branding Profile (or use defaults)
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { business: { include: { brandingProfiles: { where: { isDefault: true } } } } }
        });

        const brandProfile = user?.business?.brandingProfiles?.[0];

        // 2. Load Template Rules based on Type (invoice, estimate, etc)
        // Hardcoded basic rules for now
        const rules = {
            primaryColor: (brandProfile?.brandColors as any)?.primary || '#000000',
            font: (brandProfile?.fontSettings as any)?.heading || 'Roboto'
        };

        // 3. Generate Layout Structure
        return {
            layoutId: `layout_${Date.now()}`,
            timestamp: new Date(),
            structure: {
                // This would be the "Intermediate Representation" if we were doing full JSON-based layout
                // For now, it passes the data needed for the EJS render step.
                type: type,
                engine: 'ejs' // or 'react-email' etc
            }
        };
    }

    /**
     * Helper: Resolve Service Context (IDs)
     */
    private async _resolveServiceContext(appId: string, serviceSlug: string = ServiceSlugs.TRANSACTIONAL_BRANDING): Promise<{ serviceId: string, serviceTenantId: string }> {
        let serviceId = 'unknown';
        let serviceTenantId = 'unknown';

        if (appId) {
            try {
                const appService = await prisma.appService.findFirst({
                    where: {
                        appId: appId,
                        service: { slug: serviceSlug }
                    },
                    include: { service: true }
                });
                
                if (appService) {
                    serviceId = appService.service.id;
                    serviceTenantId = appService.appId;
                } else {
                    const fallbackService = await prisma.service.findUnique({
                        where: { slug: serviceSlug }
                    });
                    if (fallbackService) {
                        serviceId = fallbackService.id;
                    }
                }
            } catch (dbErr) {
                logger.warn({ err: dbErr }, '⚠️ [DesignEngine] Failed to resolve Service IDs');
            }
        }
        return { serviceId, serviceTenantId };
    }

    /**
     * [EXECUTION] Dynamic Action Handler
     * Used by ServicesController to route traffic and send Webhooks
     */
    async executeAction(action: string, envelope: any, context: any) {
        const { webhookService } = require('./webhook.service');
        
        logger.info({ action, userId: context?.id }, '🎨 [Design Engine] Executing Action');

        const serviceSlug = ServiceSlugs.TRANSACTIONAL_BRANDING; 

         // 1. Resolve Webhook URL
         let webhookUrl = '';
         try {
            webhookUrl = await webhookService.getEndpoint(serviceSlug, action);
         } catch (e) {
            try {
                webhookUrl = await webhookService.getEndpoint(serviceSlug, 'default');
            } catch (e2) {
                 logger.error(`No webhook URL found for ${ServiceSlugs.TRANSACTIONAL_BRANDING}`);
                 return;
            }
         }

         if (action === 'ping') {
             try {
                 const axios = require('axios');
                 await axios.post(webhookUrl, { type: 'ping', floovioo_id: envelope?.floovioo_id || context?.id, service_id: envelope?.service_id || ServiceSlugs.TRANSACTIONAL_BRANDING }, { timeout: 3000 });
                 return { success: true, connected: true, url: webhookUrl };
             } catch (err: any) {
                 logger.warn({ err: err.message, url: webhookUrl }, '⚠️ [DesignEngine] Ping Failed');
                 return { success: false, connected: false, url: webhookUrl, error: err.message };
             }
         }

         logger.info({ action, webhookUrl }, `🔗 [n8n SYNC] Delegating '${action}' to n8n`);
         logger.info({ payload: envelope }, `📤 [n8n SYNC] Request Payload`);

         // 2. Send Payload
         try {
             const axios = require('axios');
             // Send the full envelope (metadata + payload)
             const response = await axios.post(webhookUrl, envelope);
             logger.info({ action, status: response.status, response: response.data }, `✅ [n8n SYNC] Hook Success`);
             return response.data;
         } catch (err: any) {
             const errorData = err.response?.data || err.message;
             logger.error({ err: errorData, action, status: err.response?.status }, '❌ [n8n SYNC] Hook Failed');
             return { error: err.message, details: errorData };
         }
    }

    /**
     * [Action] Render Document
     * Layout JSON -> HTML
     */
    async renderDocument(payload: any) {
        logger.info('🎨 [Design Engine] Rendering Document');
        // Logic to call BrandingService.render() or similar
        return { html: '<html>...</html>' };
    }

    /**
     * [Action] Sync Business Profile (Step 1)
     */
    async syncBusinessProfile(userId: string) {
        logger.info({ userId }, '🔄 [Design Engine] Syncing Business Profile');
        const user = await prisma.user.findUnique({ where: { id: userId }, include: { business: true } });
        if (!user || !user.business) return;

        const { serviceId } = await this._resolveServiceContext('system');
        
        const context = { 
            serviceId, 
            serviceTenantId: user.business.id, 
            appId: 'system', 
            requestId: `req_${Date.now()}` 
        };
        
        const envelope = n8nPayloadFactory.createProfilePayload(user.business, userId, context);

        return this.executeAction(OnboardingEventTypes.PROFILE, envelope, { id: userId });
    }

    /**
     * [Action] Sync Integration Connection (Step 2)
     */
    async syncIntegrationConnection(userId: string, integrationId: string, provider: string) {
        const integration = await prisma.integration.findUnique({ where: { id: integrationId } });
        if (!integration) return;

        const business = await prisma.business.findFirst({ where: { users: { some: { id: userId } } } });
        if (!business) return;

        const definition = await prisma.integrationDefinition.findUnique({ where: { slug: provider } });
        const providerName = definition?.name || provider;

        const { serviceId } = await this._resolveServiceContext('system');
        const context = { 
            serviceId, 
            serviceTenantId: business.id, 
            appId: 'system', 
            requestId: `req_${Date.now()}` 
        };

        const envelope = n8nPayloadFactory.createIntegrationPayload(integration, business, providerName, userId, context);

        return this.executeAction(OnboardingEventTypes.CONNECTION, envelope, { id: userId });
    }

    /**
     * [Action] Sync Branding Profile (Step 3)
     */
    async syncBrandingProfile(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { business: { include: { brandingProfiles: { where: { isDefault: true } } } } }
        });
        if (!user || !user.business) return;

        const profile = user.business.brandingProfiles[0];
        const { serviceId } = await this._resolveServiceContext('system');
        const context = { 
            serviceId, 
            serviceTenantId: user.business.id, 
            appId: 'system', 
            requestId: `req_${Date.now()}` 
        };

        const envelope = n8nPayloadFactory.createBrandingPayload(profile, user.business, userId, context);

        return this.executeAction(OnboardingEventTypes.BRAND, envelope, { id: userId });
    }

    /**
     * [Action] Sync Complete Onboarding
     */
    async syncOnboardingComplete(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { business: { include: { brandingProfiles: { where: { isDefault: true } }, integrations: true } } }
        });
        if (!user || !user.business) return;

        const profile = user.business.brandingProfiles[0] || {} as any;
        const integrations = user.business.integrations || [];
        
        const { serviceId } = await this._resolveServiceContext('system');
        const context = { 
            serviceId, 
            serviceTenantId: user.business.id, 
            appId: 'system', 
            requestId: `req_${Date.now()}` 
        };

        const envelope = n8nPayloadFactory.createCompleteOnboardingPayload(user.business, profile, integrations, userId, context);

        return this.executeAction(OnboardingEventTypes.COMPLETE, envelope, { id: userId });
    }
}

export const designEngineService = new DesignEngineService();
