import { Integration } from '@prisma/client';
import { IERPProvider, FetchParams, ERPDocument, NormalizedWebhookEvent } from './types';
import { TokenManager } from '../token.manager';

export class QBOProvider implements IERPProvider {
    private integration: Integration | null = null;
    private baseUrl: string = 'https://sandbox-quickbooks.api.intuit.com/v3/company';
    private realmId: string = '';

    async initialize(integration: Integration): Promise<void> {
        this.integration = integration;
        const metadata = integration.metadata as any;
        
        // Environment handling
        // Check both metadata and ENV override (ENV takes precedence for easier dev testing)
        // Support legacy QB_ENVIRONMENT as well
        const env = process.env.QBO_ENVIRONMENT || process.env.QB_ENVIRONMENT || metadata?.environment || 'sandbox';
        const isProd = env === 'production';
        
        this.baseUrl = isProd 
            ? 'https://quickbooks.api.intuit.com/v3/company' 
            : 'https://sandbox-quickbooks.api.intuit.com/v3/company';

        if (metadata?.realmId) {
            this.realmId = metadata.realmId;
            console.log(`[QBOProvider] Initialized. RealmID: ${this.realmId}, Env: ${isProd ? 'Production' : 'Sandbox'}`);
        } else {
            console.warn('[QBOProvider] Initialized WITHOUT RealmID. API calls will fail.');
        }
    }

    async ensureValidToken(): Promise<string> {
        if (!this.integration) throw new Error('Provider not initialized');
        return await TokenManager.getValidAccessToken(this.integration.id);
    }

    private async getHeaders(): Promise<HeadersInit> {
        const token = await this.ensureValidToken();
        return {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        };
    }

    async validateConnection(): Promise<boolean> {
        if (!this.integration || !this.realmId) {
            console.error('[QBOProvider] Validation Failed: Missing Integration or RealmID');
            return false;
        }
        try {
            // Check CompanyInfo as a ping
            const headers = await this.getHeaders();
            const url = `${this.baseUrl}/${this.realmId}/companyinfo/${this.realmId}`;
            
            console.log(`[QBOProvider] Validating Connection: ${url}`);
            const response = await fetch(url, { headers });
            
            if (response.status === 200) {
                console.log('[QBOProvider] Validation Success');
                return true;
            }
            
            const text = await response.text();
            console.warn(`[QBOProvider] Validation Failed: Status ${response.status}`, text);
            return false;
        } catch (e) {
            console.error('[QBOProvider] Validation Exception:', e);
            return false;
        }
    }

    async fetchRaw(endpoint: string, options?: RequestInit): Promise<any> {
        if (!this.integration) throw new Error('Not Initialized');
        const headers = await this.getHeaders();
        const url = `${this.baseUrl}/${this.realmId}${endpoint}`;
        
        const response = await fetch(url, {
            ...options,
            headers: { ...headers, ...options?.headers }
        });

        const data = await response.json();
        if (data.Fault) {
            throw new Error(`QBO API Error: ${JSON.stringify(data.Fault)}`);
        }
        return data;
    }

    // --- Webhook Validation ---
    async verifyWebhookSignature(rawBody: string | Buffer, headers: any, query?: any, secret?: string): Promise<boolean> {
        const signature = headers['intuit-signature'];
        if (!signature) return false;

        const token = secret || process.env.QBO_WEBHOOK_VERIFIER_TOKEN;
        if (!token) {
            console.warn('[QBOProvider] Missing Verifier Token');
            return false;
        }

        try {
            const crypto = require('crypto');
            const hmac = crypto.createHmac('sha256', token);
            hmac.update(rawBody);
            const generated = hmac.digest('base64');
            return generated === signature;
        } catch (e) {
            console.error('[QBOProvider] Verification Error', e);
            return false;
        }
    }

    async parseWebhook(payload: any, headers?: any): Promise<NormalizedWebhookEvent[]> {
        // QBO Structure: { eventNotifications: [ { realmId, dataChangeEvent: { entities: [] } } ] }
        const notifications = payload?.eventNotifications || [];
        const events: NormalizedWebhookEvent[] = [];
        
        for (const notification of notifications) {
            const entities = notification.dataChangeEvent?.entities || [];
            for (const entity of entities) {
                const op = entity.operation; // Create, Update, Delete
                let type: any = 'unknown';
                let entityType: any = 'unknown';

                if (entity.name === 'Invoice') {
                    type = op === 'Create' ? 'invoice.created' : 'invoice.updated';
                    entityType = 'invoice';
                } else if (entity.name === 'Customer') {
                    type = 'contact.created';
                    entityType = 'contact';
                } else if (entity.name === 'Item') {
                    type = 'item.created';
                    entityType = 'item';
                }

                if (type !== 'unknown') {
                    events.push({
                        type,
                        provider: 'qbo',
                        originalEvent: op,
                        entityId: entity.id,
                        entityType,
                        payload: entity
                    });
                }
            }
        }
        return events;
    }

    // --- Specific Fetchers ---

    async getInvoicePdf(invoiceId: string): Promise<Buffer | null> {
        try {
            const headers = await this.getHeaders();
            const url = `${this.baseUrl}/${this.realmId}/invoice/${invoiceId}/pdf`;
            
            const response = await fetch(url, { 
                headers: { 
                    ...headers,
                    'Accept': 'application/pdf' 
                } 
            });

            if (response.status !== 200) {
                console.warn(`[QBOProvider] PDF Fetch Failed: ${response.status}`);
                return null;
            }

            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        } catch (e) {
            console.error('[QBOProvider] PDF Exception:', e);
            return null;
        }
    }

    async getContact(id: string): Promise<ERPDocument | null> {
        if (!this.integration) throw new Error('Not Initialized');
        const query = `select * from Customer where Id = '${id}'`;
        const result = await this.fetchRaw(`/query?query=${encodeURIComponent(query)}`);
        const item = result.QueryResponse?.Customer?.[0];
        if (!item) return null;
        
        return {
            id: item.Id,
            externalId: item.Id,
            type: 'contact',
            date: new Date(item.MetaData?.CreateTime || new Date()),
            status: item.Active ? 'active' : 'inactive',
            name: item.DisplayName || item.FullyQualifiedName || 'Unknown Contact',
            contactName: item.DisplayName,
            rawData: item
        };
    }

    async getItem(id: string): Promise<ERPDocument | null> {
        if (!this.integration) throw new Error('Not Initialized');
        const query = `select * from Item where Id = '${id}'`;
        const result = await this.fetchRaw(`/query?query=${encodeURIComponent(query)}`);
        const item = result.QueryResponse?.Item?.[0];
        if (!item) return null;
        
        return {
            id: item.Id,
            externalId: item.Sku || item.Id,
            type: 'item',
            date: new Date(item.MetaData?.CreateTime || new Date()),
            status: item.Active ? 'active' : 'inactive',
            name: item.Name || item.Sku || 'Unknown Item',
            total: item.UnitPrice,
            rawData: item
        };
    }

    async getInvoices(params?: FetchParams): Promise<ERPDocument[]> {
        // QBO Query Language
        const query = "select * from Invoice MAXRESULTS 100";
        const data = await this.fetchRaw(`/query?query=${encodeURIComponent(query)}`);
        
        return (data.QueryResponse?.Invoice || []).map((inv: any) => ({
            id: inv.Id,
            externalId: inv.DocNumber,
            type: 'invoice',
            date: new Date(inv.TxnDate),
            name: `Invoice #${inv.DocNumber}` || 'Unknown Invoice',
            total: inv.TotalAmt,
            status: inv.Balance === 0 ? 'paid' : 'open',
            contactName: inv.CustomerRef?.name,
            rawData: inv
        }));
    }

    // --- OAuth Refresh ---
    async refreshToken(refreshToken: string, metadata?: any): Promise<{ access_token: string, refresh_token?: string, expires_in: number }> {
        const clientId = process.env.QBO_CLIENT_ID || process.env.QB_CLIENT_ID;
        const clientSecret = process.env.QBO_CLIENT_SECRET || process.env.QB_CLIENT_SECRET;
        
        if (!clientId || !clientSecret) throw new Error('QBO Client Credentials missing (checked QBO_ and QB_ prefixes)');

        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const url = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

        const params = new URLSearchParams();
        params.append('grant_type', 'refresh_token');
        params.append('refresh_token', refreshToken);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params
        });

        const data = await response.json();
        if (data.error) throw new Error(`QBO Refresh Failed: ${JSON.stringify(data)}`);

        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token, // QBO rotates refresh tokens!
            expires_in: data.expires_in
        };
    }

    // --- Authentication (Polymorphic) ---
    getAuthUrl(state: string, redirectUri: string): string {
        const clientId = process.env.QB_CLIENT_ID || process.env.QBO_CLIENT_ID;
        if (!clientId) throw new Error('QBO Client ID missing');
        
        const scope = 'com.intuit.quickbooks.accounting openid profile email phone address';
        const url = 'https://appcenter.intuit.com/connect/oauth2';
        
        return `${url}?client_id=${clientId}&response_type=code&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    }

    async exchangeCode(code: string, redirectUri: string, options?: any): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        metadata: any;
    }> {
        const clientId = process.env.QB_CLIENT_ID || process.env.QBO_CLIENT_ID;
        const clientSecret = process.env.QB_CLIENT_SECRET || process.env.QBO_CLIENT_SECRET;
        
        if (!clientId || !clientSecret) throw new Error('QBO Credentials missing');

        const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
        
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('redirect_uri', redirectUri);

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${authHeader}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: params
        });

        const data = await response.json();
        if (data.error) {
            throw new Error(`QuickBooks Auth Failed: ${data.error_description || data.error}`);
        }

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresIn: data.expires_in,
            metadata: {
                realmId: options?.realmId, // Passed from query usually
                token_type: data.token_type,
                x_refresh_token_expires_in: data.x_refresh_token_expires_in
            }
        };
    }

    // --- Data Sync ---
    async syncContacts(userId: string): Promise<number> {
        if (!this.integration) throw new Error('Not Initialized');
        
        // 1. Fetch from QBO
        // Query for Customers
        const result = await this.fetchRaw("/query?query=select * from Customer MAXRESULTS 1000");
        const customers = result.QueryResponse?.Customer || [];
        
        if (customers.length === 0) return 0;

        // 2. Upsert to DB
        // We need prisma. import at top or pass it? Usually we import it.
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient(); // Or reuse global instance if available

        let count = 0;
        for (const cust of customers) {
            await prisma.contact.upsert({
                where: {
                    businessId_source_externalId: {
                        businessId: this.integration.businessId,
                        source: 'quickbooks',
                        externalId: cust.Id
                    }
                },
                update: {
                    name: cust.DisplayName || cust.FullyQualifiedName,
                    email: cust.PrimaryEmailAddr?.Address,
                    phone: cust.PrimaryPhone?.FreeFormNumber,
                    type: 'customer',
                    metadata: cust,
                    updatedAt: new Date()
                },
                create: {
                    businessId: this.integration.businessId,
                    externalId: cust.Id,
                    source: 'quickbooks',
                    name: cust.DisplayName || cust.FullyQualifiedName,
                    email: cust.PrimaryEmailAddr?.Address,
                    phone: cust.PrimaryPhone?.FreeFormNumber,
                    type: 'customer',
                    metadata: cust
                }
            });
            count++;
        }
        
        return count;
    }

    async syncInventory(userId: string): Promise<number> {
        if (!this.integration) throw new Error('Not Initialized');

        // 1. Fetch from QBO
        // QSQL does not support invalid OR usage. Use IN ('Inventory', 'Service')
        const result = await this.fetchRaw("/query?query=select * from Item WHERE Type IN ('Inventory', 'Service') MAXRESULTS 1000");
        const items = result.QueryResponse?.Item || [];
        
        if (items.length === 0) return 0;

        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();

        let count = 0;
        for (const item of items) {
            await prisma.product.upsert({
                where: {
                    businessId_source_externalId: {
                        businessId: this.integration.businessId,
                        source: 'quickbooks',
                        externalId: item.Id
                    }
                },
                update: {
                    name: item.Name,
                    sku: item.Sku,
                    description: item.Description,
                    price: item.UnitPrice ? parseFloat(item.UnitPrice) : 0,
                    metadata: item,
                    updatedAt: new Date()
                },
                create: {
                    businessId: this.integration.businessId,
                    externalId: item.Id,
                    source: 'quickbooks',
                    name: item.Name,
                    sku: item.Sku,
                    description: item.Description,
                    price: item.UnitPrice ? parseFloat(item.UnitPrice) : 0,
                    metadata: item
                }
            });
            count++;
        }
        return count;
    }

    // --- Stubs for Interface ---
    async getEstimates(params?: FetchParams): Promise<ERPDocument[]> { return []; }
    async getSalesOrders(params?: FetchParams): Promise<ERPDocument[]> { return []; }
    async getContacts(params?: FetchParams): Promise<ERPDocument[]> {
        const query = "select * from Customer MAXRESULTS 100";
        const data = await this.fetchRaw(`/query?query=${encodeURIComponent(query)}`);
        return (data.QueryResponse?.Customer || []).map((c: any) => ({
             id: c.Id,
             externalId: c.Id,
             type: 'contact',
             date: c.MetaData?.CreateTime ? new Date(c.MetaData.CreateTime) : new Date(),
             name: c.DisplayName || c.FullyQualifiedName || 'Unknown Contact',
             contactName: c.DisplayName || c.FullyQualifiedName,
             status: c.Active ? 'active' : 'inactive',
             rawData: c
        }));
    }

    async getItems(params?: FetchParams): Promise<ERPDocument[]> {
        const query = "select * from Item WHERE Type IN ('Inventory', 'Service') MAXRESULTS 100";
        const data = await this.fetchRaw(`/query?query=${encodeURIComponent(query)}`);
        return (data.QueryResponse?.Item || []).map((item: any) => ({
            id: item.Id,
            externalId: item.Sku || item.Id,
            type: 'item',
            date: item.MetaData?.CreateTime ? new Date(item.MetaData.CreateTime) : new Date(),
            status: item.Active ? 'active' : 'inactive',
            name: item.Name || item.Sku || 'Unknown Item',
            contactName: item.Name,
            total: item.UnitPrice,
            rawData: item
        }));
    }

    // --- Remaining Stubs ---
    async getChartOfAccounts(params?: FetchParams): Promise<ERPDocument[]> { return []; }
    async getPurchaseOrders(params?: FetchParams): Promise<ERPDocument[]> { return []; }
    async getBills(params?: FetchParams): Promise<ERPDocument[]> { return []; }
    async getPayments(params?: FetchParams): Promise<ERPDocument[]> { return []; }
}
