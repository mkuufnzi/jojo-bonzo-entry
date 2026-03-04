import { Business, User, Integration, BrandingProfile } from '@prisma/client';
import { TenantResource, TenantConfig, FlooviooMaster, TenantDataSource } from '../../types/tenant';
import { logger } from '../../lib/logger';
import { OnboardingEventTypes } from '../../domain-events';
import { validateUuid } from '../../lib/validation';

/**
 * Service Context Requirements for Billing & Tracing
 */
export interface ServiceContext {
    serviceId: string;       // The Service Definition ID being used
    serviceTenantId?: string; // The specific AppService instance (Subscription)
    appId: string;           // The App invoking the action
    requestId: string;
    apiKey?: string;         // Authentication key
    ipAddress?: string;
    brandId?: string;
    businessId?: string;
    planId?: string;
}

/**
 * N8n Envelope
 * Wraps the schema-specific payload with standard tracing metadata
 * Simplified for flatter usage in n8n
 */
export interface N8nEnvelope<T> {
    eventType: string;
    floovioo_id: string;
    timestamp: string;
    context: {
        service_id: string;
        service_tenant_id: string;
        app_id: string;
        api_key?: string;
        request_id: string;
        environment: string;
        brand_id?: string;
        business_id?: string;
        plan_id?: string;
    };
    data: T;
    [key: string]: any;
}

/**
 * N8n Payload Factory
 * Anti-Corruption Layer (ACL) for transforming Floovioo Domain Entities
 * into strict External Schemas required by the n8n Workflow Engine.
 */
export class N8nPayloadFactory {

    /**
     * Helper: Wrap payload in standard envelope
     */
    private _wrap<T>(type: string, data: T, flooviooId: string, context: ServiceContext, extras: any = {}): N8nEnvelope<T> {
        
        // STRICT ENFORCEMENT
        if (flooviooId !== 'system') {
            validateUuid(flooviooId, 'floovioo_id (User ID)');
        }
        
        // Allow UUID or known slugs for service_id
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(context.serviceId);
        if (context.serviceId !== 'unknown' && !isUuid) {
             // Allow slugs (e.g. 'transactional-branding', 'floovioo_transactional_debt-collection')
             if (!/^[a-z0-9_-]+$/.test(context.serviceId)) {
                 throw new Error(`Invalid Service ID: '${context.serviceId}' is neither a UUID nor a valid slug.`);
             }
        } else if (context.serviceId !== 'unknown') {
             validateUuid(context.serviceId, 'context.service_id');
        }
        if (context.serviceTenantId && context.serviceTenantId !== 'unknown') {
             validateUuid(context.serviceTenantId, 'context.service_tenant_id (Subscription/Business ID)');
        }

        return {
            eventType: type,
            floovioo_id: flooviooId,
            timestamp: new Date().toISOString(),
            context: {
                service_id: context.serviceId,
                service_tenant_id: context.serviceTenantId || 'unknown',
                app_id: context.appId,
                api_key: context.apiKey,
                request_id: context.requestId,
                environment: process.env.NODE_ENV || 'development',
                ...(context.brandId && { brand_id: context.brandId }),
                ...(context.businessId && { business_id: context.businessId }),
                ...(context.planId && { plan_id: context.planId })
            },
            data,
            ...extras
        };
    }

    /**
     * Transform: Business -> Business Profile Payload
     * Schema: Floovioo Ops Branding Clients 1.0 (Approx)
     */
    createProfilePayload(business: Business, flooviooId: string, context: ServiceContext) {
        const configId = `config_${business.id}`;

        // Pick only Step 1 relevant metadata to avoid leaking future step data (e.g. documentTypes)
        const businessMetadata = (business.metadata as any) || {};
        const profileMetadata = {
            niche: businessMetadata.niche,
            slogan: businessMetadata.slogan,
            about: businessMetadata.about
        };

        const data = {
            business: {
                id: business.id,
                name: business.name,
                sector: business.sector,
                taxId: business.taxId,
                address: business.address,
                website: business.website,
                metadata: profileMetadata
            },
            crm_link: null 
        };

        return this._wrap(OnboardingEventTypes.PROFILE, data, flooviooId, context, { config_id: configId });
    }

    /**
     * Transform: Integration -> Integration Connected Payload
     * Schema: ERP DataMap 1.0 + Clients 1.0
     */
    createIntegrationPayload(integration: Integration, business: Business, providerName: string, flooviooId: string, context: ServiceContext) {
        
        const data = {
            provider: integration.provider,
            source_type: providerName || integration.provider,
            connection: {
                id: integration.id,
                status: integration.status,
                externalId: (integration.metadata as any)?.realmId || (integration.metadata as any)?.externalId, 
                connectedAt: integration.createdAt
            },
            erp_config: integration.settings || {}
        };

        return this._wrap(OnboardingEventTypes.CONNECTION, data, flooviooId, context, { 
            data_source_id: `${integration.provider}_source_${integration.id.substring(0, 8)}`
        });
    }

    /**
     * Transform: BrandingProfile -> Branding Payload
     * Schema: Tenants Brand Voice 1.0 + Config
     */
    createBrandingPayload(profile: BrandingProfile, business: Business, flooviooId: string, context: ServiceContext) {
        const configId = `config_${business.id}`; 

        const data = {
            business_id: business.id,
            branding: {
                colors: profile.brandColors,
                logoUrl: profile.logoUrl,
                fonts: profile.fontSettings,
                templates: profile.templates
            },
            brand_voice: profile.voiceProfile || {
                persona: 'Default',
                tone: 'Professional',
                vocabulary: []
            },
            tenant_config: {
                ui_theme: (business.metadata as any)?.ui_theme || 'Light',
                feature_flags: (business.metadata as any)?.feature_flags || {}
            }
        };

        return this._wrap(OnboardingEventTypes.BRAND, data, flooviooId, context, { config_id: configId });
    }
    /**
     * Transform: Complete Onboarding Payload
     * Schema: Aggregates Tenant, Brand, and Config for single-shot sync
     */
    createCompleteOnboardingPayload(business: Business, profile: BrandingProfile, integrations: Integration[], flooviooId: string, context: ServiceContext) {
        
        const dataSources = integrations.map(i => ({
            provider: i.provider,
            source_id: `${i.provider}_source_${i.id.substring(0, 8)}`,
            status: i.status
        }));

        const data = {
            status: 'active',
            tenant: {
                name: business.name,
                sector: business.sector,
                tax_id: business.taxId,
                website: business.website,
                niche: (business.metadata as any)?.niche,
                slogan: (business.metadata as any)?.slogan,
                about: (business.metadata as any)?.about
            },
            brand: {
                colors: profile?.brandColors || { primary: '#2563EB', secondary: '#1E293B' },
                fonts: profile?.fontSettings || { heading: 'Inter', body: 'Inter' },
                logo: profile?.logoUrl || null,
                voice: profile?.voiceProfile || { tone: 'professional', rules: [] }
            },
            config: {
                document_types: (business.metadata as any)?.documentTypes || [],
                integrations: dataSources,
                ui_theme: (business.metadata as any)?.ui_theme || 'Light'
            }
        };

        return this._wrap(OnboardingEventTypes.COMPLETE, data, flooviooId, context, {
            config_id: `config_${business.id}`,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Transform: ERPDocument (Invoice) -> Normalized Data Sync Payload
     */
    createInvoicePayload(doc: any, business: Business, flooviooId: string, context: ServiceContext) {
        
        const data = {
            id: doc.id,
            external_id: doc.externalId,
            invoice_number: doc.name,
            total_amount: doc.total,
            status: doc.status,
            date: doc.date,
            contact_name: doc.contactName,
            currency: (doc.rawData as any)?.CurrencyRef?.value || (doc.rawData as any)?.currency_code || 'USD'
        };

        return this._wrap('data_sync_invoice_created', data, flooviooId, context, {
             entity_type: 'invoice',
             sync_source: doc.type === 'invoice' ? 'erp' : 'manual',
             raw: doc.rawData
        });
    }

    /**
     * Transform: ERPDocument (Contact) -> Normalized Data Sync Payload
     */
    createContactPayload(doc: any, business: Business, flooviooId: string, context: ServiceContext) {
        
        const data = {
            id: doc.id,
            external_id: doc.externalId,
            display_name: doc.name,
            email: (doc.rawData as any)?.PrimaryEmailAddr?.Address || (doc.rawData as any)?.email || null,
            phone: (doc.rawData as any)?.PrimaryPhone?.FreeFormNumber || (doc.rawData as any)?.phone || null,
            status: doc.status || 'active'
        };

        return this._wrap('data_sync_contact_created', data, flooviooId, context, {
            entity_type: 'contact',
            raw: doc.rawData
        });
    }

    /**
     * Transform: ERPDocument (Item) -> Normalized Data Sync Payload
     */
    createItemPayload(doc: any, business: Business, flooviooId: string, context: ServiceContext) {
        
        const data = {
            id: doc.id,
            external_id: doc.externalId,
            name: doc.name,
            description: doc.rawData?.Description || doc.rawData?.description || null,
            unit_price: doc.total || (doc.rawData as any)?.UnitPrice || 0,
            sku: (doc.rawData as any)?.Sku || (doc.rawData as any)?.sku || null,
            status: doc.status || 'active'
        };

        return this._wrap('data_sync_item_created', data, flooviooId, context, {
            entity_type: 'item',
            raw: doc.rawData
        });
    }

    /**
     * Transform: Generic/Fallback -> Normalized Data Sync Payload
     * Ensures strict envelope even for unsupported entities
     */
    createGenericEntityPayload(entityType: string, doc: any, business: Business, flooviooId: string, context: ServiceContext) {
        
        // Use normalized data if available in doc, else raw
        const data = {
            id: doc.id,
            external_id: doc.externalId,
            name: doc.name || doc.contactName || 'Unknown',
            status: doc.status || 'unknown',
            raw_summary: doc.rawData
        };

        return this._wrap(`data_sync_${entityType}_created`, data, flooviooId, context, {
            entity_type: entityType,
            is_generic_fallback: true
        });
    }

    /**
     * Transform: Workflow Execution Payload
     * Wraps user-defined workflow execution data
     */
    createWorkflowExecutionPayload(workflowId: string, actionType: string, triggerPayload: any, actionConfig: any, brandProfile: any, userId: string, context: ServiceContext, overrideEventType?: string, smartContent?: any) {
        
        const data = {
            workflow_id: workflowId,
            action: actionType,
            trigger: triggerPayload,
            config: actionConfig,
            brand: brandProfile,
            smart_content: smartContent || {}
        };

        return this._wrap(overrideEventType || 'workflow_execution', data, userId, context, {
             workflow_mode: 'active'
        });
    }

    /**
     * Transform: Generic System Event Payload
     * Wraps simple event data (e.g. user_registered, subscription_canceled)
     */
    createEventPayload(event: string, data: any, flooviooId: string, context: ServiceContext) {
        return this._wrap(event, data, flooviooId, context);
    }

    /**
     * Transform: Single-Invoice Recovery Dispatch Payload
     *
     * Used by RecoveryService.processRecovery() to dispatch a single dunning step
     * for one overdue invoice to n8n. Includes all tracking IDs required for n8n
     * to POST back to /api/callbacks/recovery/action.
     *
     * Envelope extras: actionId, sessionId, stepIndex, callbackUrl
     */
    createRecoveryDispatchPayload(
        params: {
            actionId: string;
            sessionId: string;
            stepIndex: number;
            stepAction: string;
            templateId: string;
            customSubject: string;
            customBody: string;
            businessId: string;
            externalInvoiceId: string;
            customerEmail: string;
            customerName: string;
            amount: number;
            currency: string;
            dueDate: string;
            contextData: Record<string, any>;
            enrichedProfile?: {
                ltv: number;
                totalPurchases: number;
                riskScore: string;
                clusterId: string | null;
                clusterName: string;
            } | null;
            signature: string;
            callbackUrl: string;
        },
        flooviooId: string,
        context: ServiceContext
    ) {
        const data = {
            // Tracking — n8n MUST echo these back in the callback
            actionId: params.actionId,
            sessionId: params.sessionId,
            stepIndex: params.stepIndex,

            // Step Config
            stepAction: params.stepAction,
            templateId: params.templateId,
            subject: params.customSubject,
            body: params.customBody,

            // Invoice Context
            businessId: params.businessId,
            externalInvoiceId: params.externalInvoiceId,

            // Customer Context
            customerEmail: params.customerEmail,
            customerName: params.customerName,
            amount: params.amount,
            currency: params.currency,
            dueDate: params.dueDate,

            // Injected Variables (for template rendering in n8n)
            ...params.contextData,

            // Enriched Analytics (Phase 5)
            profile: params.enrichedProfile || null,

            // Security
            signature: params.signature,

            // Callback — where n8n must POST the result
            callbackUrl: params.callbackUrl,
        };

        return this._wrap('recovery_single_dispatch', data, flooviooId, context, {
            recovery_mode: 'single',
            batch: false,
        });
    }

    /**
     * Transform: Batch Recovery Dispatch Payload
     *
     * Used by RecoveryService.processBatchRecovery() to dispatch all overdue invoices
     * for one customer (or a cluster of customers sharing a sequence) in a SINGLE n8n call.
     * n8n processes all invoices in one email and POSTs back to /api/callbacks/recovery/action
     * with the full actionIds[] array so the callback can advance all sessions atomically.
     *
     * Envelope extras: actionIds[], sessionIds[], callbackUrl
     */
    createBatchRecoveryDispatchPayload(
        params: {
            actionIds: string[];      // One per invoice — callback echoes these back
            sessionIds: string[];     // Parallel array matching actionIds
            businessId: string;
            integrationId: string;
            providerName: string;
            customerId: string;
            externalCustomerId: string | null;
            customerName: string;
            customerEmail: string;
            customerPhone: string | null;
            totalAmount: number;
            currency: string;
            invoices: Array<{
                invoiceNumber: string;
                amount: string;
                dueDate: string;
                stepName: string;
            }>;
            enrichedProfile?: {
                ltv: number;
                totalPurchases: number;
                creditLimit: number;
                riskScore: string;
                clusterId: string | null;
                clusterName: string;
            } | null;
            signature: string;
            callbackUrl: string;
        },
        flooviooId: string,
        context: ServiceContext
    ) {
        const data = {
            // Tracking — n8n MUST echo these back in the callback
            actionIds: params.actionIds,
            sessionIds: params.sessionIds,

            // Customer Context
            businessId: params.businessId,
            integrationId: params.integrationId,
            provider: params.providerName,
            customerId: params.customerId,
            externalCustomerId: params.externalCustomerId,
            customerName: params.customerName,
            customerEmail: params.customerEmail,
            customerPhone: params.customerPhone,

            // Aggregated Invoice Table
            totalAmount: `${params.currency} ${params.totalAmount.toFixed(2)}`,
            invoiceCount: params.invoices.length,
            invoices: params.invoices,

            // Enriched Profile
            profile: params.enrichedProfile || null,

            // Security
            signature: params.signature,

            // Callback — where n8n must POST the result
            callbackUrl: params.callbackUrl,
        };

        return this._wrap('recovery_batch_dispatch', data, flooviooId, context, {
            recovery_mode: 'batch',
            batch: true,
        });
    }
    /**
     * Transform: Batch Entity Payload
     * Wraps an array of entities for bulk sync
     */
    createBatchPayload(entityType: string, docs: any[], business: Business, flooviooId: string, context: ServiceContext) {
        
        // Transform each item based on type
        const payloads = docs.map(doc => {
            if (entityType === 'invoices') return { ...this.createInvoicePayload(doc, business, flooviooId, context).data, entity_type: 'invoice' };
            if (entityType === 'contacts') return { ...this.createContactPayload(doc, business, flooviooId, context).data, entity_type: 'contact' };
            if (entityType === 'items') return { ...this.createItemPayload(doc, business, flooviooId, context).data, entity_type: 'item' };
            return { ...this.createGenericEntityPayload(entityType, doc, business, flooviooId, context).data, entity_type: entityType };
        });

        // Use the first item's ID or a batch ID for the main data wrapper
        const batchData = {
            batch_id: `batch_${entityType}_${Date.now()}`,
            count: docs.length,
            entity_type: entityType,
            items: payloads
        };

        return this._wrap(`data_sync_${entityType}_batch`, batchData, flooviooId, context, {
             batch_mode: true
        });
    }
    /**
     * Transform: Unified Master Payload
     * Aggregates ALL entity types into a single "State of the Business" payload
     * requested by the user for simpler n8n processing.
     */
    createUnifiedPayload(
        data: {
            items: any[],
            contacts: any[],
            invoices: any[],
            payments: any[],
            salesorders: any[],
            purchaseorders: any[],
            estimates: any[]
        },
        business: Business,
        integration: Integration,
        flooviooId: string,
        context: ServiceContext
    ) {
        
        // 1. Map to User's Requested Keys
        // User requested: skus, customers, customerAddresses, invoices, receipts, returns, authorization, orders
        
        const payload = {
            authorization: {
                provider: integration.provider,
                connected_at: integration.createdAt,
                status: integration.status,
                sync_timestamp: new Date().toISOString()
            },
            skus: data.items.map(d => this.createItemPayload(d, business, flooviooId, context).data),
            customers: data.contacts.map(d => this.createContactPayload(d, business, flooviooId, context).data),
            customerAddresses: [], // Placeholder: Extract unique addresses if needed, or leave empty if not explicit in source
            invoices: data.invoices.map(d => this.createInvoicePayload(d, business, flooviooId, context).data),
            receipts: data.payments.map(d => ({ 
                ...d.rawData, // Pass raw for maximum flexibility
                id: d.id, 
                amount: d.total, 
                date: d.date 
            })), 
            orders: data.salesorders.map(d => ({
                id: d.id,
                total: d.total,
                status: d.status,
                date: d.date,
                ...d.rawData
            })),
            returns: [], // Credit Notes not yet synced, return empty array
            estimates: data.estimates.map(d => ({ id: d.id, total: d.total, ...d.rawData })) // Extra helper
        };

        return this._wrap(OnboardingEventTypes.DATA_SYNC, payload, flooviooId, context, {
             mode: 'unified_snapshot'
        });
    }
}

export const n8nPayloadFactory = new N8nPayloadFactory();
