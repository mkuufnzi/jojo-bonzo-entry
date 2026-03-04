import { Integration } from '@prisma/client';
import { IERPProvider, FetchParams, ERPDocument, NormalizedWebhookEvent } from './types';
import { TokenManager } from '../token.manager';
import { EventSegments, buildScopedEventName } from '../../../types/service.types';

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

    async fetchRaw(endpoint: string, options?: RequestInit, maxRetries = 3): Promise<any> {
        if (!this.integration) throw new Error('Not Initialized');
        
        const url = `${this.baseUrl}/${this.realmId}${endpoint}`;
        
        let attempt = 0;
        let lastError: any = null;

        while (attempt < maxRetries) {
            try {
                const headers = await this.getHeaders();
                console.log(`[QBOProvider] 🌐 Calling API (Attempt ${attempt + 1}/${maxRetries}): ${url}`);
                
                const response = await fetch(url, {
                    ...options,
                    headers: { ...headers, ...options?.headers }
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`[QBOProvider] ❌ API Error (${response.status}): ${errorText}`);
                    
                    if (response.status === 401 || response.status === 429 || response.status >= 500) {
                        throw new Error(`QBO API Network Error: ${response.status} - ${errorText}`);
                    }
                    
                    // Fatal bad requests like syntax queries should not retry
                    throw new Error(`QBO API Fatal Error: ${response.status} - ${errorText}`);
                }

                const data = await response.json();
                if (data.Fault) {
                    // QBO occasionally returns 200 OK but embeds a Fault XML object inside
                    const faultMsg = data.Fault.Error?.[0]?.Detail || data.Fault.Error?.[0]?.Message || JSON.stringify(data.Fault);
                    
                    try {
                        const { PrismaClient } = await import('@prisma/client');
                        const p = new PrismaClient();
                        if (this.integration?.businessId) {
                            await p.auditLog.create({
                                data: {
                                    actionType: 'erp_sync_failure',
                                    eventType: 'quickbooks_fault',
                                    businessId: this.integration.businessId,
                                    success: false,
                                    requestPayload: { endpoint, fault: data.Fault } as any,
                                    requestId: `qbo_fault_${Date.now()}`
                                }
                            });
                        }
                    } catch (e) {
                         console.error('[QBOProvider] Could not log fault to AuditLog', e);
                    }

                    throw new Error(`QBO API Fault Payload: ${faultMsg}`);
                }
                return data;

            } catch (err: any) {
                lastError = err;
                
                if (err.message.includes('Fatal Error')) {
                    throw err; // Break loop immediately
                }
                
                attempt++;
                if (attempt < maxRetries) {
                    const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
                    console.warn(`[QBOProvider] ⚠️ Retrying after ${Math.round(backoffMs)}ms...`);
                    await new Promise(resolve => setTimeout(resolve, backoffMs));
                }
            }
        }
        
        throw new Error(`[QBOProvider] ❌ Exhausted all ${maxRetries} retries. Final Error: ${lastError?.message}`);
    }

    // --- Webhook Validation ---
    async verifyWebhookSignature(rawBody: string | Buffer, headers: any, query?: any, secret?: string): Promise<boolean> {
        const signature = headers['intuit-signature'];
        if (!signature) return false;

        const token = secret || process.env.QBO_WEBHOOK_VERIFIER_TOKEN;
        if (!token) {
            console.warn('[QBOProvider] Missing Verifier Token (ENV: QBO_WEBHOOK_VERIFIER_TOKEN)');
            return false;
        }

        try {
            const crypto = require('crypto');
            const hmac = crypto.createHmac('sha256', token);
            hmac.update(rawBody);
            const calculatedSignature = hmac.digest('base64');
            
            const isValid = calculatedSignature === signature;
            if (!isValid) {
                console.warn(`[QBOProvider] Signature Mismatch. Received: ${signature.substring(0, 10)}... Calculated: ${calculatedSignature.substring(0, 10)}...`);
            }
            return isValid;
        } catch (e) {
            console.error('[QBOProvider] Verification Error', e);
            return false;
        }
    }

    async parseWebhook(payload: any, headers?: any): Promise<NormalizedWebhookEvent[]> {
        const events: NormalizedWebhookEvent[] = [];

        // 1. Handle Legacy Format (eventNotifications wrapper)
        if (payload?.eventNotifications) {
            const notifications = payload.eventNotifications;
            for (const notification of notifications) {
                const entities = notification.dataChangeEvent?.entities || [];
                for (const entity of entities) {
                    const op = entity.operation; // Create, Update, Delete, Void, Merge, Emailed
                    const entityName = entity.name;
                    
                    // Standardize Operation to Suffix
                    const opMap: Record<string, string> = {
                        'Create': 'created',
                        'Update': 'updated',
                        'Delete': 'deleted',
                        'Void': 'voided',
                        'Merge': 'merged',
                        'Emailed': 'emailed'
                    };
                    const suffix = opMap[op] || op.toLowerCase();

                    // Standardize Entity Name to Prefix (Handling all 29+ entities)
                    const entityMap: Record<string, string> = {
                        'Account': 'account',
                        'Bill': 'bill',
                        'BillPayment': 'billpayment',
                        'Budget': 'budget',
                        'Class': 'class',
                        'CreditMemo': 'creditmemo',
                        'Currency': 'currency',
                        'Customer': 'contact',
                        'Department': 'department',
                        'Deposit': 'deposit',
                        'Employee': 'employee',
                        'Estimate': 'estimate',
                        'Invoice': 'invoice',
                        'Item': 'item',
                        'JournalCode': 'journalcode',
                        'JournalEntry': 'journalentry',
                        'Payment': 'payment',
                        'PaymentMethod': 'paymentmethod',
                        'Preferences': 'preferences',
                        'Purchase': 'purchase',
                        'PurchaseOrder': 'purchaseorder',
                        'RefundReceipt': 'refundreceipt',
                        'SalesReceipt': 'salesreceipt',
                        'TaxAgency': 'taxagency',
                        'Term': 'term',
                        'TimeActivity': 'timeactivity',
                        'Transfer': 'transfer',
                        'Vendor': 'vendor',
                        'VendorCredit': 'vendorcredit'
                    };
                    const prefix = entityMap[entityName] || entityName.toLowerCase();

                    const type: any = `${prefix}.${suffix}`;
                    const entityType: any = prefix === 'contact' ? 'customer' : prefix;

                    events.push({
                        type,
                        provider: 'quickbooks',
                        originalEvent: op,
                        entityId: entity.id,
                        entityType,
                        payload: entity,
                        tenantId: notification.realmId,
                        normalizedEventType: buildScopedEventName(
                            EventSegments.PRODUCT.TRANSACTIONAL,
                            EventSegments.SERVICE.BRANDING_AUTOMATION,
                            EventSegments.REQUEST_TYPE.REQUEST,
                            EventSegments.ACTION.APPLY,
                            entityType
                        )
                    });
                }
            }
        } 
        // 2. Handle New Format (CloudEvents - Array at root)
        else if (Array.isArray(payload)) {
            for (const item of payload) {
                const entityName = item.intuitentityname;
                const op = item.intuitoperation;
                const entityId = item.intuitentityid;
                const realmId = item.intuitrealm;

                // Standardize Operation to Suffix
                const opMap: Record<string, string> = {
                    'Create': 'created',
                    'Update': 'updated',
                    'Delete': 'deleted',
                    'Void': 'voided',
                    'Merge': 'merged',
                    'Emailed': 'emailed'
                };
                const suffix = opMap[op] || op.toLowerCase();

                // Standardize Entity Name to Prefix
                const entityMap: Record<string, string> = {
                    'Account': 'account',
                    'Bill': 'bill',
                    'BillPayment': 'billpayment',
                    'Budget': 'budget',
                    'Class': 'class',
                    'CreditMemo': 'creditmemo',
                    'Currency': 'currency',
                    'Customer': 'contact',
                    'Department': 'department',
                    'Deposit': 'deposit',
                    'Employee': 'employee',
                    'Estimate': 'estimate',
                    'Invoice': 'invoice',
                    'Item': 'item',
                    'JournalCode': 'journalcode',
                    'JournalEntry': 'journalentry',
                    'Payment': 'payment',
                    'PaymentMethod': 'paymentmethod',
                    'Preferences': 'preferences',
                    'Purchase': 'purchase',
                    'PurchaseOrder': 'purchaseorder',
                    'RefundReceipt': 'refundreceipt',
                    'SalesReceipt': 'salesreceipt',
                    'TaxAgency': 'taxagency',
                    'Term': 'term',
                    'TimeActivity': 'timeactivity',
                    'Transfer': 'transfer',
                    'Vendor': 'vendor',
                    'VendorCredit': 'vendorcredit'
                };
                const prefix = entityMap[entityName] || entityName.toLowerCase();

                const type: any = `${prefix}.${suffix}`;
                const entityType: any = prefix === 'contact' ? 'customer' : prefix;

                events.push({
                    type,
                    provider: 'quickbooks',
                    originalEvent: op,
                    entityId,
                    entityType,
                    payload: item,
                    tenantId: realmId,
                    normalizedEventType: buildScopedEventName(
                        EventSegments.PRODUCT.TRANSACTIONAL,
                        EventSegments.SERVICE.BRANDING_AUTOMATION,
                        EventSegments.REQUEST_TYPE.REQUEST,
                        EventSegments.ACTION.APPLY,
                        entityType
                    )
                });
            }
        }

        return events;
    }

    // --- Specific Fetchers ---

    async getEntity(type: string, id: string): Promise<any | null> {
        if (!this.integration) throw new Error('Not Initialized');
        
        // Map common normalized types to QBO entity names
        const entityMap: Record<string, string> = {
            'account': 'Account',
            'bill': 'Bill',
            'billpayment': 'BillPayment',
            'budget': 'Budget',
            'class': 'Class',
            'creditmemo': 'CreditMemo',
            'currency': 'Currency',
            'contact': 'Customer',
            'customer': 'Customer',
            'department': 'Department',
            'deposit': 'Deposit',
            'employee': 'Employee',
            'estimate': 'Estimate',
            'invoice': 'Invoice',
            'item': 'Item',
            'journalcode': 'JournalCode',
            'journalentry': 'JournalEntry',
            'payment': 'Payment',
            'paymentmethod': 'PaymentMethod',
            'preferences': 'Preferences',
            'purchase': 'Purchase',
            'purchaseorder': 'PurchaseOrder',
            'refundreceipt': 'RefundReceipt',
            'salesreceipt': 'SalesReceipt',
            'taxagency': 'TaxAgency',
            'term': 'Term',
            'timeactivity': 'TimeActivity',
            'transfer': 'Transfer',
            'vendor': 'Vendor',
            'vendorcredit': 'VendorCredit'
        };

        const qboType = entityMap[type.toLowerCase()] || type;
        const query = `select * from ${qboType} where Id = '${id}'`;
        
        try {
            const result = await this.fetchRaw(`/query?query=${encodeURIComponent(query)}`);
            // QBO wraps responses in a key named after the entity
            const data = result.QueryResponse?.[qboType]?.[0] || null;
            if (data) {
                console.log(`[QBOProvider] ✅ Enriched ${qboType} ${id} found`);
            } else {
                console.warn(`[QBOProvider] ⚠️ No data found for ${qboType} ${id} in query response`, result.QueryResponse);
            }
            return data;
        } catch (e) {
            console.error(`[QBOProvider] Failed to fetch enriched ${qboType}:`, e);
            return null;
        }
    }

    async getEntityPdf(type: string, id: string): Promise<Buffer | null> {
        if (!this.integration) throw new Error('Not Initialized');

        // Supported entities for PDF export per Intuit Docs
        const pdfSupported = [
            'invoice', 'salesreceipt', 'creditmemo', 
            'estimate', 'payment', 'purchaseorder', 
            'refundreceipt'
        ];

        const normalizedType = type.toLowerCase();
        if (!pdfSupported.includes(normalizedType)) {
            return null;
        }

        const entityMap: Record<string, string> = {
            'invoice': 'invoice',
            'salesreceipt': 'salesreceipt',
            'creditmemo': 'creditmemo',
            'estimate': 'estimate',
            'payment': 'payment', // Payment receipts
            'purchaseorder': 'purchaseorder',
            'refundreceipt': 'refundreceipt'
        };

        const qboPath = entityMap[normalizedType];
        console.log(`[QBOProvider] 📄 Fetching PDF for ${normalizedType} ${id}`);

        try {
            const headers = await this.getHeaders();
            const url = `${this.baseUrl}/${this.realmId}/${qboPath}/${id}/pdf`;
            
            const response = await fetch(url, {
                headers: { ...headers, 'Accept': 'application/pdf' }
            });

            if (!response.ok) {
                console.warn(`[QBOProvider] ⚠️ PDF Export not available for ${normalizedType} ${id} (Status: ${response.status})`);
                return null;
            }

            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        } catch (e) {
            console.error(`[QBOProvider] ❌ Error fetching PDF for ${normalizedType} ${id}:`, e);
            return null;
        }
    }

    // --- Legacy / Compatibility ---
    async getInvoicePdf(invoiceId: string): Promise<Buffer | null> {
        return this.getEntityPdf('invoice', invoiceId);
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
            dueDate: inv.DueDate ? new Date(inv.DueDate) : undefined,
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

    async syncInvoices(userId: string): Promise<number> {
        if (!this.integration) throw new Error('Not Initialized');

        // 1. Fetch from QBO (Order by latest modifications first)
        const result = await this.fetchRaw("/query?query=select * from Invoice ORDERBY MetaData.LastUpdatedTime DESC MAXRESULTS 1000");
        const invoices = result.QueryResponse?.Invoice || [];
        
        if (invoices.length === 0) return 0;

        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();

        let count = 0;
        for (const invoice of invoices) {
            await prisma.externalDocument.upsert({
                where: {
                    integrationId_externalId_type: {
                        integrationId: this.integration.id,
                        externalId: invoice.Id,
                        type: 'invoice'
                    }
                },
                update: {
                    data: invoice,
                    syncedAt: new Date(),
                    updatedAt: new Date()
                },
                create: {
                    businessId: this.integration.businessId,
                    integrationId: this.integration.id,
                    externalId: invoice.Id,
                    type: 'invoice',
                    data: invoice,
                    syncedAt: new Date()
                }
            });
            count++;
        }
        return count;
    }

    // --- Smart Recovery: Overdue Invoice Bridge ---
    /**
     * Fetches invoices that are overdue (Balance > 0 AND DueDate < today).
     * Used by the Recovery Engine to identify candidates for dunning sequences.
     */
    async getOverdueInvoices(daysOverdue: number = 0): Promise<ERPDocument[]> {
        if (!this.integration) throw new Error('Not Initialized');

        const date = new Date();
        date.setDate(date.getDate() - daysOverdue);
        const thresholdDate = date.toISOString().split('T')[0];

        let allInvoices: any[] = [];
        let startPosition = 1;
        const maxResults = 1000;
        let hasMore = true;

        while (hasMore) {
            const query = `SELECT * FROM Invoice WHERE Balance > '0' AND DueDate <= '${thresholdDate}' STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
            console.log(`[QBOProvider] 🔍 Querying Overdue Invoices (Start: ${startPosition}): ${query}`);

            try {
                const data = await this.fetchRaw(`/query?query=${encodeURIComponent(query)}`);
                const pageInvoices = data.QueryResponse?.Invoice || [];
                
                allInvoices = [...allInvoices, ...pageInvoices];

                if (pageInvoices.length < maxResults) {
                    hasMore = false;
                } else {
                    startPosition += maxResults;
                }
            } catch (e: any) {
                console.error('[QBOProvider] ❌ Failed to fetch overdue invoices page:', e);
                throw new Error(`QBO Pagination Failure (Overdue): ${e.message}`);
            }
        }

        console.log(`[QBOProvider] 📊 Found ${allInvoices.length} total overdue invoices`);

        return allInvoices.map((inv: any) => ({
            id: inv.Id,
            externalId: inv.DocNumber || inv.Id,
            type: 'invoice' as const,
            date: new Date(inv.TxnDate),
            dueDate: inv.DueDate ? new Date(inv.DueDate) : undefined,
            name: `Invoice #${inv.DocNumber || inv.Id}`,
            total: inv.Balance, 
            status: 'overdue',
            contactName: inv.CustomerRef?.name,
            rawData: inv
        }));
    }

    /**
     * Fetches ALL unpaid invoices (Balance > 0) regardless of due date.
     * Used by the Recovery Engine to accurately verify if an invoice was paid.
     */
    async getAllUnpaidInvoices(): Promise<ERPDocument[]> {
        if (!this.integration) throw new Error('Not Initialized');

        let allInvoices: any[] = [];
        let startPosition = 1;
        const maxResults = 1000;
        let hasMore = true;

        while (hasMore) {
            const query = `SELECT * FROM Invoice WHERE Balance > '0' STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
            console.log(`[QBOProvider] 🔍 Querying Unpaid Invoices (Start: ${startPosition}): ${query}`);

            try {
                const data = await this.fetchRaw(`/query?query=${encodeURIComponent(query)}`);
                const pageInvoices = data.QueryResponse?.Invoice || [];
                
                allInvoices = [...allInvoices, ...pageInvoices];

                if (pageInvoices.length < maxResults) {
                    hasMore = false;
                } else {
                    startPosition += maxResults;
                }
            } catch (e: any) {
                console.error('[QBOProvider] ❌ Failed to fetch unpaid invoices page:', e);
                // CRITICAL: Throwing ensures the orchestrator crashes cleanly and retries later.
                // Returning a partial [] would trick the system into closing "missing" active invoices as RECOVERED!
                throw new Error(`QBO Pagination Failure: ${e.message}`);
            }
        }

        console.log(`[QBOProvider] 📊 Successfully retrieved all ${allInvoices.length} unpaid invoices across all pages.`);

        return allInvoices.map((inv: any) => ({
            id: inv.Id,
            externalId: inv.DocNumber || inv.Id,
            type: 'invoice' as const,
            date: new Date(inv.TxnDate),
            dueDate: inv.DueDate ? new Date(inv.DueDate) : undefined,
            name: `Invoice #${inv.DocNumber || inv.Id}`,
            total: inv.Balance,
            status: 'unpaid',
            contactName: inv.CustomerRef?.name,
            rawData: inv
        }));
    }
    /**
     * Fetches ALL customers to build a local map and avoid N+1 queries.
     */
    async getAllCustomers(): Promise<any[]> {
        if (!this.integration) throw new Error('Not Initialized');

        let allCustomers: any[] = [];
        let startPosition = 1;
        const maxResults = 1000;
        let hasMore = true;

        while (hasMore) {
            const query = `SELECT * FROM Customer STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
            console.log(`[QBOProvider] 🔍 Querying Customers (Start: ${startPosition}): ${query}`);

            try {
                const data = await this.fetchRaw(`/query?query=${encodeURIComponent(query)}`);
                const pageCustomers = data.QueryResponse?.Customer || [];
                
                allCustomers = [...allCustomers, ...pageCustomers];

                if (pageCustomers.length < maxResults) {
                    hasMore = false;
                } else {
                    startPosition += maxResults;
                }
            } catch (e: any) {
                console.error('[QBOProvider] ❌ Failed to fetch customers page:', e);
                throw new Error(`QBO Pagination Failure (Customers): ${e.message}`);
            }
        }

        console.log(`[QBOProvider] 📊 Successfully retrieved all ${allCustomers.length} customers across all pages.`);
        return allCustomers;
    }

    async getInvoiceStats(daysThreshold: number = 0): Promise<{ total: number, unpaid: number, overdue: number }> {
        if (!this.integration) throw new Error('Not Initialized');
        
        try {
            const date = new Date();
            date.setDate(date.getDate() - daysThreshold);
            const thresholdDate = date.toISOString().split('T')[0];
            
            // 1. Total Count
            const totalRes = await this.fetchRaw(`/query?query=${encodeURIComponent("SELECT COUNT(*) FROM Invoice")}`);
            const total = totalRes.QueryResponse?.totalCount || 0;

            // 2. Unpaid (Balance > 0)
            const unpaidRes = await this.fetchRaw(`/query?query=${encodeURIComponent("SELECT COUNT(*) FROM Invoice WHERE Balance > '0'")}`);
            const unpaid = unpaidRes.QueryResponse?.totalCount || 0;

            // 3. Overdue (Balance > 0 AND DueDate < thresholdDate)
            const overdueRes = await this.fetchRaw(`/query?query=${encodeURIComponent(`SELECT COUNT(*) FROM Invoice WHERE Balance > '0' AND DueDate <= '${thresholdDate}'`)}`);
            const overdue = overdueRes.QueryResponse?.totalCount || 0;

            console.log(`[QBOProvider] 📊 Invoice Stats - Total: ${total}, Unpaid: ${unpaid}, Overdue: ${overdue} (Threshold: ${daysThreshold} days)`);
            
            return { total, unpaid, overdue };
        } catch (e) {
            console.error('[QBOProvider] ❌ Failed to fetch invoice stats:', e);
            return { total: 0, unpaid: 0, overdue: 0 };
        }
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
