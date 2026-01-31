import { Integration } from '@prisma/client';

export interface FetchParams {
    limit?: number;
    page?: number;
    cursor?: string;
    updatedAfter?: Date;
    entity?: string; // For generic raw calls
}

export interface ERPDocument {
    id: string;
    externalId: string;
    type: 'invoice' | 'estimate' | 'salesorder' | 'purchaseorder' | 'bill' | 'payment' | 'contact' | 'account' | 'item';
    date: Date;
    name: string; // Normalized Display Name (e.g. "Invoice #1001" or "Acme Corp")
    total?: number;
    status: string;
    contactName?: string;
    rawData: any;
}

export interface IERPProvider {
    /**
     * initializes the provider with integration credentials
     */
    initialize(integration: Integration): Promise<void>;

    /**
     * Checks if the access token is valid and refreshes it if necessary.
     * Updates the database if a new token is generated.
     */
    ensureValidToken(): Promise<string>;

    /**
     * Validates the connection by fetching the organization/profile
     */
    validateConnection(): Promise<boolean>;

    // --- Authentication (Polymorphic) ---
    getAuthUrl(state: string, redirectUri: string): string;
    exchangeCode(code: string, redirectUri: string, options?: any): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        metadata: any;
    }>;

    // --- Webhook Validation ---
    verifyWebhookSignature(rawBody: string | Buffer, headers: any, query?: any, secret?: string): Promise<boolean>;
    // --- Data Sync ---
    syncContacts(userId: string): Promise<number>; // Returns count of synced items
    syncInventory(userId: string): Promise<number>;

    // Standardized Fetch Methods
    getInvoices(params?: FetchParams): Promise<ERPDocument[]>;
    getEstimates(params?: FetchParams): Promise<ERPDocument[]>;
    getSalesOrders(params?: FetchParams): Promise<ERPDocument[]>;
    getContacts(params?: FetchParams): Promise<ERPDocument[]>;
    getChartOfAccounts(params?: FetchParams): Promise<ERPDocument[]>;
    getItems(params?: FetchParams): Promise<ERPDocument[]>;
    getPurchaseOrders(params?: FetchParams): Promise<ERPDocument[]>;
    getBills(params?: FetchParams): Promise<ERPDocument[]>;
    getPayments(params?: FetchParams): Promise<ERPDocument[]>;

    // Generic Access
    fetchRaw(endpoint: string, options?: RequestInit): Promise<any>;

    /**
     * Exchanges a refresh token for a new access token.
     * This is a "static" logic but called on an instance for easier registry handling.
     */
    refreshToken(refreshToken: string, metadata?: any): Promise<{ access_token: string, refresh_token?: string, expires_in: number }>;

    /**
     * Parses an incoming webhook payload into a normalized event.
     * Returns null if the event is ignored/unhandled.
     */
    parseWebhook(payload: any, headers?: any): Promise<NormalizedWebhookEvent[]>;

    // --- Specific Data Fetchers (Used by Webhook Controller) ---
    getInvoicePdf(invoiceId: string): Promise<Buffer | null>;
    getContact(id: string): Promise<ERPDocument | null>;
    getItem(id: string): Promise<ERPDocument | null>;
}

export interface NormalizedWebhookEvent {
    type: 'invoice.created' | 'invoice.updated' | 'estimate.created' | 'contact.created' | 'contact.updated' | 'item.created' | 'item.updated' | 'unknown';
    provider: string; // 'zoho', 'quickbooks', etc.
    originalEvent: string; // The raw event name
    entityId: string; // External ID (e.g. INV-001)
    entityType: 'invoice' | 'estimate' | 'contact' | 'item' | 'unknown'; 
    payload: any; // The raw data or normalized subset
    tenantId?: string; // e.g. RealmID, OrgID
}
