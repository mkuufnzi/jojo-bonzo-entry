import { Integration } from '@prisma/client';
import { IERPProvider, FetchParams, ERPDocument, NormalizedWebhookEvent } from './types';
import { TokenManager } from '../token.manager';
import { EventSegments, buildScopedEventName } from '../../../types/service.types';

/**
 * ZohoProvider handles communication with the Zoho Books API.
 * It implements standard ERP fetching and webhook parsing for the Floovioo 
 * "Transactional Branding" product line.
 */

export class ZohoProvider implements IERPProvider {
    private integration: Integration | null = null;
    private baseUrl: string = 'https://www.zohoapis.com/books/v3';
    private orgId: string = '';

    async initialize(integration: Integration): Promise<void> {
        this.integration = integration;
        
        // Dynamic Base URL based on DC (Data Center)
        const metadata = integration.metadata as any;
        if (metadata?.api_domain) {
            this.baseUrl = `${metadata.api_domain}/books/v3`;
        }
        console.log(`[ZohoProvider] Initialized with BaseURL: ${this.baseUrl}, OrgID: ${this.orgId}`);

        // Ensure we have an Organization ID
        // If not stored, we must fetch it. 
        // Ideally it should be stored in metadata during onboarding/connection.
        if (metadata?.organization_id) {
            this.orgId = metadata.organization_id;
        }
    }

    async ensureValidToken(): Promise<string> {
        if (!this.integration) throw new Error('Provider not initialized');
        return await TokenManager.getValidAccessToken(this.integration.id);
    }

    private async getHeaders(): Promise<HeadersInit> {
        const token = await this.ensureValidToken();
        return {
            'Authorization': `Zoho-oauthtoken ${token}`,
            'Content-Type': 'application/json'
        };
    }

    async validateConnection(): Promise<boolean> {
        if (!this.integration) return false;
        try {
            // Fetch Organizations to validate token and storing OrgId if missing
            const token = await this.ensureValidToken();
            // Use generic base URL for organizations lookup if we don't know the DC yet? 
            // Actually, we must rely on api_domain from metadata, or try .com default.
            
            const response = await fetch(`${this.baseUrl}/organizations`, {
                headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
            });
            const data = await response.json();

            if (data.code === 0 && data.organizations?.length > 0) {
                // If orgId not set, default to first active one
                if (!this.orgId) {
                    const defaultOrg = data.organizations.find((o: any) => o.is_default_org) || data.organizations[0];
                    this.orgId = defaultOrg.organization_id;
                    console.log(`[ZohoProvider] Auto-discovered OrgID: ${this.orgId}`);
                    // TODO: Persist this back to DB metadata
                }
                return true;
            }
            console.error('Zoho Validation Error: API Response not OK', { 
                statusCode: response.status, 
                data,
                url: `${this.baseUrl}/organizations`,
                metadata: this.integration?.metadata
            });
            return false;
        } catch (e) {
            console.error('Zoho Validation Failed (Exception)', e);
            return false;
        }
    }

    async fetchRaw(endpoint: string, options?: RequestInit): Promise<any> {
        if (!this.orgId) await this.validateConnection();
        const headers = await this.getHeaders();
        
        // Append organization_id
        const separator = endpoint.includes('?') ? '&' : '?';
        const url = `${this.baseUrl}${endpoint}${separator}organization_id=${this.orgId}`;

        const response = await fetch(url, {
            ...options,
            headers: { ...headers, ...options?.headers }
        });

        const data = await response.json();

        // Standard Zoho Error Handling
        if (data.code !== 0) {
            throw new Error(`Zoho API Error ${data.code}: ${data.message}`);
        }

        return data;
    }

    // --- Standardized Getters ---

    async getInvoices(params?: FetchParams): Promise<ERPDocument[]> {
        const data = await this.fetchRaw('/invoices');
        return (data.invoices || []).map((inv: any) => ({
            id: inv.invoice_id,
            externalId: inv.invoice_number,
            type: 'invoice',
            date: new Date(inv.date),
            name: `Invoice #${inv.invoice_number}` || 'Unknown Invoice',
            total: inv.total,
            status: inv.status,
            contactName: inv.customer_name,
            rawData: inv
        }));
    }

    async getEstimates(params?: FetchParams): Promise<ERPDocument[]> {
        const data = await this.fetchRaw('/estimates');
        return (data.estimates || []).map((est: any) => ({
             id: est.estimate_id,
             externalId: est.estimate_number,
             type: 'estimate',
             date: new Date(est.date),
             name: `Estimate #${est.estimate_number}` || 'Unknown Estimate',
             total: est.total,
             status: est.status,
             contactName: est.customer_name,
             rawData: est
        }));
    }

    async getSalesOrders(params?: FetchParams): Promise<ERPDocument[]> {
        const data = await this.fetchRaw('/salesorders');
         return (data.salesorders || []).map((so: any) => ({
             id: so.salesorder_id,
             externalId: so.salesorder_number,
             type: 'salesorder',
             date: new Date(so.date),
             name: `Sales Order #${so.salesorder_number}` || 'Unknown SO',
             total: so.total,
             status: so.status,
             contactName: so.customer_name,
             rawData: so
        }));
    }

    async getContacts(params?: FetchParams): Promise<ERPDocument[]> {
        const data = await this.fetchRaw('/contacts');
        return (data.contacts || []).map((c: any) => ({
             id: c.contact_id,
             externalId: c.contact_name, // fallback
             type: 'contact',
             date: new Date(c.created_time), // fallback
             name: c.contact_name || 'Unknown Contact',
             status: c.status,
             contactName: c.contact_name,
             rawData: c
        }));
    }

    async getChartOfAccounts(params?: FetchParams): Promise<ERPDocument[]> {
        const data = await this.fetchRaw('/chartofaccounts');
        return (data.chartofaccounts || []).map((a: any) => ({
             id: a.account_id,
             externalId: a.account_code || a.account_name,
             type: 'account', 
             date: new Date(a.created_time), 
             name: a.account_name || 'Unknown Account',
             status: a.is_active ? 'active' : 'inactive',
             contactName: a.account_type, 
             rawData: a
        }));
    }

    async getItems(params?: FetchParams): Promise<ERPDocument[]> {
        const data = await this.fetchRaw('/items');
        return (data.items || []).map((item: any) => ({
             id: item.item_id,
             externalId: item.sku || item.name,
             type: 'item',
             date: new Date(item.created_time),
             name: item.name || item.sku || 'Unknown Item',
             total: item.rate, // Using rate as value
             status: item.status,
             contactName: item.name,
             rawData: item
        }));
    }

    async getPurchaseOrders(params?: FetchParams): Promise<ERPDocument[]> {
        const data = await this.fetchRaw('/purchaseorders');
        return (data.purchaseorders || []).map((po: any) => ({
             id: po.purchaseorder_id,
             externalId: po.purchaseorder_number,
             type: 'purchaseorder',
             date: new Date(po.date),
             name: `PO #${po.purchaseorder_number}` || 'Unknown PO',
             total: po.total,
             status: po.status,
             contactName: po.vendor_name,
             rawData: po
        }));
    }

    async getBills(params?: FetchParams): Promise<ERPDocument[]> {
        const data = await this.fetchRaw('/bills');
        return (data.bills || []).map((bill: any) => ({
             id: bill.bill_id,
             externalId: bill.bill_number,
             type: 'bill',
             date: new Date(bill.date),
             name: `Bill #${bill.bill_number}` || 'Unknown Bill',
             total: bill.total,
             status: bill.status,
             contactName: bill.vendor_name,
             rawData: bill
        }));
    }

    async getPayments(params?: FetchParams): Promise<ERPDocument[]> {
        const data = await this.fetchRaw('/customerpayments');
        return (data.customerpayments || []).map((pay: any) => ({
             id: pay.payment_id,
             externalId: pay.payment_number,
             type: 'payment',
             date: new Date(pay.date),
             name: `Payment #${pay.payment_number}` || 'Unknown Payment',
             total: pay.amount,
             status: 'confirmed', // Zoho payments are usually confirmed if in list
             contactName: pay.customer_name,
             rawData: pay
        }));
    }

    async refreshToken(refreshToken: string, metadata?: any): Promise<{ access_token: string, refresh_token?: string, expires_in: number }> {
        const clientId = process.env.ZOHO_CLIENT_ID;
        const clientSecret = process.env.ZOHO_CLIENT_SECRET;
        const accountsUrl = metadata?.accounts_server || 'https://accounts.zoho.com';

        if (!clientId || !clientSecret) {
            throw new Error('Zoho Client ID/Secret not configured');
        }

        const url = `${accountsUrl}/oauth/v2/token?refresh_token=${refreshToken}&client_id=${clientId}&client_secret=${clientSecret}&grant_type=refresh_token`;

        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();

        if (data.error) {
            throw new Error(`Zoho Refresh Failed: ${data.error}`);
        }

        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_in: data.expires_in // seconds
        };
    }

    async verifyWebhookSignature(rawBody: string | Buffer, headers: any, query?: any): Promise<boolean> {
        // Simple API Key presence check (Logic deferred to Controller AUTH lookup usually)
        // But if query.key is provided, we can assume it's valid if it matched an App in Controller.
        return true; 
    }

    async parseWebhook(payload: any, headers?: any): Promise<NormalizedWebhookEvent[]> {
        /**
         * Zoho Webhooks often send a payload with a 'JSONString' field.
         * We normalize the events to Floovioo's scoped naming convention.
         */
        const events: NormalizedWebhookEvent[] = [];
        let data = payload;
        
        if (payload?.JSONString) {
            try {
                data = JSON.parse(payload.JSONString);
            } catch (e) {
                console.warn('[ZohoProvider] Failed to parse JSONString', e);
            }
        }

        // 1. Invoice
        if (data.invoice_id) {
             events.push({
                 type: 'invoice.created',
                 provider: 'zoho',
                 originalEvent: 'invoice',
                 entityId: data.invoice_number || data.invoice_id,
                 entityType: 'invoice',
                 payload: data,
                 tenantId: data.organization_id,
                 // Standard naming: floovioo_transactional_branding_automation_request_apply_invoice
                 normalizedEventType: buildScopedEventName(
                     EventSegments.PRODUCT.TRANSACTIONAL,
                     EventSegments.SERVICE.BRANDING_AUTOMATION,
                     EventSegments.REQUEST_TYPE.REQUEST,
                     EventSegments.ACTION.APPLY,
                     'invoice'
                 )
             });
        }
        
        // 2. Estimate
        else if (data.estimate_id) {
            events.push({
                type: 'estimate.created',
                provider: 'zoho',
                originalEvent: 'estimate',
                entityId: data.estimate_number || data.estimate_id,
                entityType: 'estimate',
                payload: data,
                tenantId: data.organization_id,
                // Standard naming: floovioo_transactional_branding_automation_request_apply_estimate
                normalizedEventType: buildScopedEventName(
                    EventSegments.PRODUCT.TRANSACTIONAL,
                    EventSegments.SERVICE.BRANDING_AUTOMATION,
                    EventSegments.REQUEST_TYPE.REQUEST,
                    EventSegments.ACTION.APPLY,
                    'estimate'
                )
            });
        }

        // 3. Contact
        else if (data.contact_id) {
            events.push({
                type: 'contact.created',
                provider: 'zoho',
                originalEvent: 'contact',
                entityId: data.contact_name || data.contact_id,
                entityType: 'contact',
                payload: data,
                tenantId: data.organization_id,
                // Standard naming: floovioo_transactional_branding_automation_request_apply_contact
                normalizedEventType: buildScopedEventName(
                    EventSegments.PRODUCT.TRANSACTIONAL,
                    EventSegments.SERVICE.BRANDING_AUTOMATION,
                    EventSegments.REQUEST_TYPE.REQUEST,
                    EventSegments.ACTION.APPLY,
                    'contact'
                )
            });
        }

        return events;
    }

    async getEntityPdf(type: string, id: string): Promise<Buffer | null> {
        try {
            const pdfSupported = ['invoice', 'estimate', 'salesorder', 'purchaseorder', 'creditnote'];
            const normalizedType = type.toLowerCase();
            
            if (!pdfSupported.includes(normalizedType)) return null;

            if (!this.orgId) await this.validateConnection();
            const headers = await this.getHeaders();
            
            // Zoho PDF endpoints follow /<entities>/pdf pattern
            const entityPlural = normalizedType === 'contact' ? 'contacts' : `${normalizedType}s`;
            const url = `${this.baseUrl}/${entityPlural}/pdf?${normalizedType}_ids=${id}&organization_id=${this.orgId}`;
            
            const response = await fetch(url, { headers: { ...headers } });
            if (response.status !== 200) return null;
            
            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        } catch (e) {
            console.error('[ZohoProvider] PDF Fetch Error:', e);
            return null;
        }
    }

    async getEntity(type: string, id: string): Promise<any | null> {
        if (!this.orgId) await this.validateConnection();
        
        const entityMap: Record<string, string> = {
            'invoice': 'invoices',
            'estimate': 'estimates',
            'salesorder': 'salesorders',
            'purchaseorder': 'purchaseorders',
            'contact': 'contacts',
            'item': 'items',
            'payment': 'customerpayments',
            'bill': 'bills'
        };

        const zohoPath = entityMap[type.toLowerCase()] || `${type.toLowerCase()}s`;
        
        try {
            const data = await this.fetchRaw(`/${zohoPath}/${id}`);
            // Zoho returns { code: 0, message: "...", [entity]: { ... } }
            // We need to return the inner entity object
            const key = type.toLowerCase() === 'contact' ? 'contact' : type.toLowerCase();
            return data[key] || data;
        } catch (e) {
            console.error(`[ZohoProvider] Failed to fetch enriched ${type}:`, e);
            return null;
        }
    }

    // --- Legacy / Compatibility ---
    async getInvoicePdf(invoiceId: string): Promise<Buffer | null> {
        return this.getEntityPdf('invoice', invoiceId);
    }

    async getContact(id: string): Promise<ERPDocument | null> {
         try {
            const data = await this.fetchRaw(`/contacts/${id}`);
            const c = data.contact;
            return {
                id: c.contact_id,
                externalId: c.contact_name,
                type: 'contact',
                date: new Date(c.created_time),
                name: c.contact_name || 'Unknown Contact',
                status: c.status,
                contactName: c.contact_name,
                rawData: c
            };
         } catch (e) { return null; }
    }

    async getItem(id: string): Promise<ERPDocument | null> {
        try {
            const data = await this.fetchRaw(`/items/${id}`);
            const item = data.item;
             return {
                 id: item.item_id,
                 externalId: item.sku || item.name,
                 type: 'item',
                 date: new Date(item.created_time),
                 name: item.name || item.sku || 'Unknown Item',
                 total: item.rate,
                 status: item.status,
                 contactName: item.name,
                 rawData: item
             };
        } catch (e) { return null; }
    }

    // --- Polymorphic Auth Stubs ---
    // --- Polymorphic Auth Implementation ---
    getAuthUrl(state: string, redirectUri: string): string {
        const clientId = process.env.ZOHO_CLIENT_ID;
        if (!clientId) throw new Error('Zoho Client ID missing');
        
        // Use generic .com accounts URL for initial auth, it handles redirection
        const accountsUrl = 'https://accounts.zoho.com/oauth/v2/auth';
        const scope = 'ZohoBooks.fullAccess.all ZohoContacts.fullAccess.all offline_access';
        
        return `${accountsUrl}?client_id=${clientId}&response_type=code&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&access_type=offline&prompt=consent`;
    }

    async exchangeCode(code: string, redirectUri: string, options?: any): Promise<any> {
        const clientId = process.env.ZOHO_CLIENT_ID;
        const clientSecret = process.env.ZOHO_CLIENT_SECRET;
        
        if (!clientId || !clientSecret) throw new Error('Zoho Credentials missing');

        // Note: For Zoho, we ideally know the DC (Data Center) such as .com, .eu, .in
        // But for initial exchange, accounts.zoho.com often routes correctly or we rely on user hint
        // Defaulting to .com for MVP.
        const tokenUrl = 'https://accounts.zoho.com/oauth/v2/token';
        
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('redirect_uri', redirectUri);
        params.append('client_id', clientId);
        params.append('client_secret', clientSecret);

        const response = await fetch(tokenUrl, { method: 'POST', body: params });
        const data = await response.json();

        if (data.error) {
            throw new Error(`Zoho Auth Failed: ${data.error}`);
        }

        // Discovery: Get User Info / Organization to determine API Domain
        // Zoho isn't great at self-discovery from just a token without knowing the API Base URL.
        // However, the access_token contains the 'api_domain' in the response sometimes, or we try generic.
        const apiDomain = data.api_domain || 'https://www.zohoapis.com'; 

        // Get Organizations
        const orgRes = await fetch(`${apiDomain}/books/v3/organizations`, {
            headers: { 'Authorization': `Zoho-oauthtoken ${data.access_token}` }
        });
        const orgData = await orgRes.json();
        
        if (orgData.code !== 0 || !orgData.organizations?.length) {
            throw new Error('No Zoho Books Organizations found.');
        }

        // Logic: Pick default or first
        const defaultOrg = orgData.organizations.find((o: any) => o.is_default_org) || orgData.organizations[0];

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresIn: data.expires_in,
            metadata: {
                api_domain: apiDomain, // Store the DC region (e.g. .eu, .in)
                organization_id: defaultOrg.organization_id,
                organization_name: defaultOrg.organization_name
            }
        };
    }

    // --- Sync Implementation ---
    async syncContacts(userId: string): Promise<number> {
        if (!this.integration) throw new Error('Not Initialized');
        
        const data = await this.fetchRaw('/contacts');
        const contacts = data.contacts || [];
        
        if (contacts.length === 0) return 0;

        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();

        let count = 0;
        for (const c of contacts) {
             await prisma.contact.upsert({
                where: {
                    businessId_source_externalId: {
                        businessId: this.integration.businessId,
                        source: 'zoho',
                        externalId: c.contact_id
                    }
                },
                update: {
                    name: c.contact_name,
                    email: c.email || '',
                    phone: c.phone || '',
                    type: c.contact_type === 'vendor' ? 'vendor' : 'customer',
                    metadata: c,
                    updatedAt: new Date()
                },
                create: {
                    businessId: this.integration.businessId,
                    externalId: c.contact_id,
                    source: 'zoho',
                    name: c.contact_name,
                    email: c.email || '',
                    phone: c.phone || '',
                    type: c.contact_type === 'vendor' ? 'vendor' : 'customer',
                    metadata: c
                }
            });
            count++;
        }
        return count;
    }

    async syncInventory(userId: string): Promise<number> {
        if (!this.integration) throw new Error('Not Initialized');

        const data = await this.fetchRaw('/items');
        const items = data.items || [];

        if (items.length === 0) return 0;

        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();

        let count = 0;
        for (const item of items) {
             await prisma.product.upsert({
                where: {
                    businessId_source_externalId: {
                        businessId: this.integration.businessId,
                        source: 'zoho',
                        externalId: item.item_id
                    }
                },
                update: {
                    name: item.name,
                    sku: item.sku || item.item_name, // Fallback if SKU is empty
                    description: item.description,
                    price: item.rate,
                    metadata: item,
                    updatedAt: new Date()
                },
                create: {
                    businessId: this.integration.businessId,
                    externalId: item.item_id,
                    source: 'zoho',
                    name: item.name,
                    sku: item.sku || item.item_name,
                    description: item.description,
                    price: item.rate,
                    metadata: item
                }
            });
            count++;
        }
        return count;
    }

    async syncInvoices(userId: string): Promise<number> {
        return 0; // implemented only in QBO currently
    }
}
