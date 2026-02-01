/**
 * Unified Data Model
 * 
 * Standardized interfaces for ERP entities across all providers (Zoho, QBO, Xero).
 * This decouples the core logic from provider-specific schemas.
 */

export type ProviderType = 'zoho' | 'quickbooks' | 'xero' | 'manual';

export interface UnifiedEntity {
    id: string;              // Internal UUID or Hash
    externalId: string;      // ID in the Provider System
    provider: ProviderType;  
    businessId: string;      // Floovioo Business ID
    createdAt: Date;
    updatedAt: Date;
    rawData?: any;           // The original JSON from provider (for debugging/re-hydration)
}

export interface UnifiedContact extends UnifiedEntity {
    type: 'customer' | 'vendor';
    name: string;
    email?: string;
    phone?: string;
    currency?: string;
    address?: {
        street?: string;
        city?: string;
        state?: string;
        zip?: string;
        country?: string;
    };
    isActive: boolean;
}

export interface UnifiedItem extends UnifiedEntity {
    name: string;
    sku?: string;
    description?: string;
    rate: number;
    currency?: string;
    type: 'service' | 'inventory' | 'non-inventory';
    isActive: boolean;
}

export interface UnifiedInvoice extends UnifiedEntity {
    number: string;
    date: Date;
    dueDate?: Date;
    status: 'draft' | 'sent' | 'paid' | 'overdue' | 'void';
    
    // Financials
    subtotal: number;
    taxTotal: number;
    total: number;
    balance: number;
    currency: string;

    // Relationships
    customerId: string;      // Map to UnifiedContact.id if possible, or externalId
    customerName: string;    // Fallback

    lineItems: UnifiedLineItem[];
}

export interface UnifiedLineItem {
    itemId?: string;         // Map to UnifiedItem.id
    description: string;
    quantity: number;
    rate: number;
    amount: number;
}

/**
 * Sync Result Object
 */
export interface SyncResult {
    provider: ProviderType;
    entityType: 'invoice' | 'contact' | 'item';
    totalSynced: number;
    errors: string[];
    durationMs: number;
}
