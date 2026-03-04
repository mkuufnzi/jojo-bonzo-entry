import { Integration } from '@prisma/client';
import { IERPProvider, FetchParams, ERPDocument, NormalizedWebhookEvent } from './types';
import { TokenManager } from '../token.manager';
import { EventSegments, buildScopedEventName } from '../../../types/service.types';

/**
 * XeroProvider handles communication with the Xero API.
 * It implements standard ERP fetching and webhook parsing with a focus on 
 * Floovioo's "Transactional Branding" product line.
 */

export class XeroProvider implements IERPProvider {
    private integration: Integration | null = null;
    private baseUrl: string = 'https://api.xero.com/api.xro/2.0';
    private tenantId: string = '';

    async initialize(integration: Integration): Promise<void> {
        this.integration = integration;
        const metadata = integration.metadata as any;
        this.tenantId = metadata?.tenantId || '';
    }

    async ensureValidToken(): Promise<string> {
        if (!this.integration) throw new Error('Provider not initialized');
        return await TokenManager.getValidAccessToken(this.integration.id);
    }

    private async getHeaders(): Promise<HeadersInit> {
        const token = await this.ensureValidToken();
        if (!this.tenantId) throw new Error('Xero Tenant ID not found in metadata');
        
        return {
            'Authorization': `Bearer ${token}`,
            'Xero-tenant-id': this.tenantId,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        };
    }

    async validateConnection(): Promise<boolean> {
        try {
            const data = await this.fetchRaw('/Organisation');
            return !!data.Organisations;
        } catch (e) {
            return false;
        }
    }

    async fetchRaw(endpoint: string, options?: RequestInit): Promise<any> {
        const headers = await this.getHeaders();
        const url = `${this.baseUrl}${endpoint}`;

        const response = await fetch(url, {
            ...options,
            headers: { ...headers, ...options?.headers }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Xero API Error (${response.status}): ${errorText}`);
        }

        return await response.json();
    }

    // --- Standardized Getters ---

    async getInvoices(params?: FetchParams): Promise<ERPDocument[]> {
        const data = await this.fetchRaw('/Invoices');
        return (data.Invoices || []).map((inv: any) => ({
            id: inv.InvoiceID,
            externalId: inv.InvoiceNumber,
            type: 'invoice',
            date: new Date(inv.DateString || inv.DateStringUTC),
            name: `Invoice #${inv.InvoiceNumber}` || 'Unknown Invoice',
            total: inv.Total,
            status: inv.Status.toLowerCase() === 'paid' ? 'paid' : 'pending',
            contactName: inv.Contact?.Name || 'Unknown',
            rawData: inv
        }));
    }

    async getContacts(params?: FetchParams): Promise<ERPDocument[]> {
        const data = await this.fetchRaw('/Contacts');
        return (data.Contacts || []).map((c: any) => ({
            id: c.ContactID,
            externalId: c.Name,
            type: 'contact',
            date: new Date(c.UpdatedDateUTC),
            name: c.Name || 'Unknown Contact',
            status: c.ContactStatus === 'ACTIVE' ? 'active' : 'inactive',
            contactName: c.Name,
            rawData: c
        }));
    }

    async getItems(params?: FetchParams): Promise<ERPDocument[]> {
        const data = await this.fetchRaw('/Items');
        return (data.Items || []).map((item: any) => ({
            id: item.ItemID,
            externalId: item.Code,
            type: 'item',
            date: new Date(item.UpdatedDateUTC),
            name: item.Name || item.Code || 'Unknown Item',
            total: item.SalesDetails?.UnitPrice || 0,
            status: 'active',
            contactName: item.Name,
            rawData: item
        }));
    }

    async getEstimates(): Promise<ERPDocument[]> {
        // Xero Quotes
        const data = await this.fetchRaw('/Quotes');
        return (data.Quotes || []).map((q: any) => ({
            id: q.QuoteID,
            externalId: q.QuoteNumber,
            type: 'estimate',
            date: new Date(q.DateString),
            name: `Quote #${q.QuoteNumber}` || 'Unknown Quote',
            total: q.Total,
            status: q.Status.toLowerCase(),
            contactName: q.Contact?.Name,
            rawData: q
        }));
    }

    async getSalesOrders(): Promise<ERPDocument[]> { return []; } // Xero doesn't have a direct SO equivalent in standard API 2.0
    async getChartOfAccounts(): Promise<ERPDocument[]> { return []; }
    async getPurchaseOrders(): Promise<ERPDocument[]> {
        const data = await this.fetchRaw('/PurchaseOrders');
        return (data.PurchaseOrders || []).map((po: any) => ({
            id: po.PurchaseOrderID,
            externalId: po.PurchaseOrderNumber,
            type: 'purchaseorder',
            date: new Date(po.DateString),
            name: `PO #${po.PurchaseOrderNumber}` || 'Unknown PO',
            total: po.Total,
            status: po.Status.toLowerCase(),
            contactName: po.Contact?.Name,
            rawData: po
        }));
    }

    async getBills(): Promise<ERPDocument[]> {
        const data = await this.fetchRaw('/Invoices?where=Type=="ACCPAY"');
        return (data.Invoices || []).map((inv: any) => ({
            id: inv.InvoiceID,
            externalId: inv.InvoiceNumber,
            type: 'bill',
            date: new Date(inv.DateString),
            name: `Bill #${inv.InvoiceNumber}` || 'Unknown Bill',
            total: inv.Total,
            status: inv.Status.toLowerCase(),
            contactName: inv.Contact?.Name,
            rawData: inv
        }));
    }

    async getPayments(): Promise<ERPDocument[]> {
        const data = await this.fetchRaw('/Payments');
        return (data.Payments || []).map((p: any) => ({
            id: p.PaymentID,
            externalId: p.Reference || p.PaymentID,
            type: 'payment',
            date: new Date(p.DateString),
            name: `Payment ${p.Reference || ''}`.trim() || 'Unknown Payment',
            total: p.Amount,
            status: p.Status.toLowerCase(),
            contactName: 'N/A', // Payments don't directly have contact in root response
            rawData: p
        }));
    }

    async refreshToken(refreshToken: string): Promise<{ access_token: string, expires_in: number }> {
        const clientId = process.env.XERO_CLIENT_ID;
        const clientSecret = process.env.XERO_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            throw new Error('Xero Client ID/Secret not configured');
        }

        const url = 'https://identity.xero.com/connect/token';
        const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        
        const params = new URLSearchParams();
        params.append('grant_type', 'refresh_token');
        params.append('refresh_token', refreshToken);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${authHeader}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(`Xero Refresh Failed: ${data.error_description || data.error}`);
        }

        return {
            access_token: data.access_token,
            expires_in: data.expires_in // seconds
        };
    }

    // --- Webhook Validation ---
    async verifyWebhookSignature(rawBody: string | Buffer, headers: any, query?: any, secret?: string): Promise<boolean> {
        // Xero uses HMAC-SHA256
        const signature = headers['x-xero-signature'];
        // Config key: XERO_WEBHOOK_KEY
        const key = secret || process.env.XERO_WEBHOOK_KEY;
        
        if (!signature || !key) return false;

        try {
            const crypto = require('crypto');
            const hmac = crypto.createHmac('sha256', key);
            
            // Xero signature is on the raw body string
            hmac.update(rawBody.toString());
            const generated = hmac.digest('base64');
            return generated === signature;
        } catch (e) {
            return false;
        }
    }

    async parseWebhook(payload: any, headers?: any): Promise<NormalizedWebhookEvent[]> {
        /**
         * Xero Webhooks usually send an array of events.
         * We normalize these to consistent Floovioo events.
         */
        const events: NormalizedWebhookEvent[] = [];
        const xeroEvents = payload?.events || [];

        for (const ev of xeroEvents) {
             // ev.eventCategory: 'INVOICING' | 'CONTACT'
             // ev.eventType: 'CREATE' | 'UPDATE'
             // ev.resourceId: string
             // ev.tenantId: string
             
             if (ev.eventCategory === 'INVOICING') {
                 /**
                  * Xero treats both Invoices and Bills under 'INVOICING'.
                  * For the Branding Automation service, we treat these as 'apply' requests 
                  * to a potentially branding-capable document (invoice).
                  */
                 events.push({
                     type: ev.eventType === 'CREATE' ? 'invoice.created' : 'invoice.updated',
                     provider: 'xero',
                     originalEvent: ev.eventType,
                     entityId: ev.resourceId,
                     entityType: 'invoice',
                     payload: ev,
                     tenantId: ev.tenantId,
                     // Standardized naming: floovioo_transactional_branding_automation_request_apply_invoice
                     normalizedEventType: buildScopedEventName(
                         EventSegments.PRODUCT.TRANSACTIONAL,
                         EventSegments.SERVICE.BRANDING_AUTOMATION,
                         EventSegments.REQUEST_TYPE.REQUEST,
                         EventSegments.ACTION.APPLY,
                         'invoice'
                     )
                 });
             } else if (ev.eventCategory === 'CONTACT') {
                 /**
                  * Contacts can also trigger branding workflows (e.g. welcome letters).
                  */
                 events.push({
                     type: ev.eventType === 'CREATE' ? 'contact.created' : 'contact.updated',
                     provider: 'xero',
                     originalEvent: ev.eventType,
                     entityId: ev.resourceId,
                     entityType: 'contact',
                     payload: ev,
                     tenantId: ev.tenantId,
                     // Standardized naming: floovioo_transactional_branding_automation_request_apply_contact
                     normalizedEventType: buildScopedEventName(
                         EventSegments.PRODUCT.TRANSACTIONAL,
                         EventSegments.SERVICE.BRANDING_AUTOMATION,
                         EventSegments.REQUEST_TYPE.REQUEST,
                         EventSegments.ACTION.APPLY,
                         'contact'
                     )
                 });
             }
        }
        
        return events;
    }

    async getEntityPdf(type: string, id: string): Promise<Buffer | null> {
         const pdfSupported = ['invoice', 'creditnote', 'purchaseorder'];
         const normalizedType = type.toLowerCase();
         
         if (!pdfSupported.includes(normalizedType)) return null;

         try {
             const headers = await this.getHeaders();
             // Mapping to Xero endpoints
             const endpointMap: Record<string, string> = {
                 'invoice': 'Invoices',
                 'creditnote': 'CreditNotes',
                 'purchaseorder': 'PurchaseOrders'
             };
             
             const path = endpointMap[normalizedType];
             const response = await fetch(`${this.baseUrl}/${path}/${id}`, {
                 headers: { 
                     ...headers as any,
                     'Accept': 'application/pdf'
                 }
             });
             
             if (response.status !== 200) return null;
             const buf = await response.arrayBuffer();
             return Buffer.from(buf);
         } catch (e) { return null; }
    }

    async getEntity(type: string, id: string): Promise<any | null> {
        const entityMap: Record<string, string> = {
            'invoice': 'Invoices',
            'contact': 'Contacts',
            'item': 'Items',
            'payment': 'Payments',
            'bill': 'Invoices', // Xero bills are type='ACCPAY' in Invoices
            'purchaseorder': 'PurchaseOrders'
        };

        const xeroPath = entityMap[type.toLowerCase()] || `${type.charAt(0).toUpperCase()}${type.slice(1)}s`;
        
        try {
            const data = await this.fetchRaw(`/${xeroPath}/${id}`);
            // Xero returns { [PluralName]: [{...}] }
            return data[xeroPath]?.[0] || data;
        } catch (e) {
            console.error(`[XeroProvider] Failed to fetch enriched ${type}:`, e);
            return null;
        }
    }

    // --- Legacy / Compatibility ---
    async getInvoicePdf(invoiceId: string): Promise<Buffer | null> {
        return this.getEntityPdf('invoice', invoiceId);
    }

    async getContact(id: string): Promise<ERPDocument | null> {
        try {
            const data = await this.fetchRaw(`/Contacts/${id}`);
            const c = data.Contacts?.[0];
            if (!c) return null;
            return {
                id: c.ContactID,
                externalId: c.Name,
                type: 'contact',
                date: new Date(c.UpdatedDateUTC),
                name: c.Name || 'Unknown Contact',
                status: c.ContactStatus === 'ACTIVE' ? 'active' : 'inactive',
                contactName: c.Name,
                rawData: c
            };
        } catch (e) { return null; }
    }

    async getItem(id: string): Promise<ERPDocument | null> {
         try {
            const data = await this.fetchRaw(`/Items/${id}`);
            const item = data.Items?.[0];
            if (!item) return null;
            return {
                id: item.ItemID,
                externalId: item.Code,
                type: 'item',
                date: new Date(item.UpdatedDateUTC),
                name: item.Name || item.Code || 'Unknown Item',
                total: item.SalesDetails?.UnitPrice || 0,
                status: 'active',
                contactName: item.Name,
                rawData: item
            };
         } catch (e) { return null; }
    }

    // --- Polymorphic Auth Stubs ---
    // --- Polymorphic Auth Implementation ---
    getAuthUrl(state: string, redirectUri: string): string {
        const clientId = process.env.XERO_CLIENT_ID;
        if (!clientId) throw new Error('Xero Client ID missing');
        
        // Scopes: offline_access (refresh token), accounting.transactions (invoices), accounting.contacts (customers), accounting.settings (organisation)
        const scope = 'offline_access accounting.transactions accounting.contacts accounting.settings.read';
        const url = 'https://login.xero.com/identity/connect/authorize';
        
        return `${url}?client_id=${clientId}&response_type=code&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    }

    async exchangeCode(code: string, redirectUri: string, options?: any): Promise<any> {
        const clientId = process.env.XERO_CLIENT_ID;
        const clientSecret = process.env.XERO_CLIENT_SECRET;
        
        if (!clientId || !clientSecret) throw new Error('Xero Credentials missing');

        const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const tokenUrl = 'https://identity.xero.com/connect/token';
        
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('redirect_uri', redirectUri);

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${authHeader}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params
        });

        const data = await response.json();
        if (data.error) {
            throw new Error(`Xero Auth Failed: ${data.error}`);
        }

        // Fetch Tenants (Connected Organizations)
        // Xero requires selecting a tenant. We picked the first one usually or prompt user (simplification: pick first)
        const connectionsRes = await fetch('https://api.xero.com/connections', {
            headers: {
                'Authorization': `Bearer ${data.access_token}`,
                'Content-Type': 'application/json'
            }
        });
        const connections = await connectionsRes.json();
        if (!connections || connections.length === 0) {
            throw new Error('No Xero Tenants found. Please connect an organization.');
        }

        const tenantId = connections[0].tenantId; // Default to first

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresIn: data.expires_in,
            metadata: {
                tenantId: tenantId,
                tenantName: connections[0].tenantName
            }
        };
    }

    // --- Sync Implementation ---
    async syncContacts(userId: string): Promise<number> {
        if (!this.integration) throw new Error('Not Initialized');
        
        const data = await this.fetchRaw('/Contacts');
        const contacts = data.Contacts || [];
        
        if (contacts.length === 0) return 0;

        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();

        let count = 0;
        for (const c of contacts) {
            await prisma.contact.upsert({
                where: {
                    businessId_source_externalId: {
                        businessId: this.integration.businessId,
                        source: 'xero',
                        externalId: c.ContactID
                    }
                },
                update: {
                    name: c.Name,
                    email: c.EmailAddress,
                    phone: c.Phones?.[0]?.PhoneNumber, // Naive approach
                    type: c.IsSupplier ? 'vendor' : 'customer',
                    metadata: c,
                    updatedAt: new Date()
                },
                create: {
                    businessId: this.integration.businessId,
                    externalId: c.ContactID,
                    source: 'xero',
                    name: c.Name,
                    email: c.EmailAddress,
                    phone: c.Phones?.[0]?.PhoneNumber,
                    type: c.IsSupplier ? 'vendor' : 'customer',
                    metadata: c
                }
            });
            count++;
        }
        return count;
    }

    async syncInventory(userId: string): Promise<number> {
        if (!this.integration) throw new Error('Not Initialized');

        const data = await this.fetchRaw('/Items');
        const items = data.Items || [];

        if (items.length === 0) return 0;

        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();

        let count = 0;
        for (const item of items) {
             await prisma.product.upsert({
                where: {
                    businessId_source_externalId: {
                        businessId: this.integration.businessId,
                        source: 'xero',
                        externalId: item.Code // Xero uses Code as unique ID often, ItemID is internal
                    }
                },
                update: {
                    name: item.Name,
                    sku: item.Code,
                    description: item.Description,
                    price: item.SalesDetails?.UnitPrice || 0,
                    metadata: item,
                    updatedAt: new Date()
                },
                create: {
                    businessId: this.integration.businessId,
                    externalId: item.Code,
                    source: 'xero',
                    name: item.Name,
                    sku: item.Code,
                    description: item.Description,
                    price: item.SalesDetails?.UnitPrice || 0,
                    metadata: item
                }
            });
            count++;
        }
        return count;
    }

    async syncInvoices(userId: string): Promise<number> {
        return 0; // only QBO has this implementation natively at the moment
    }
}
