/**
 * Core Interfaces for the Unified Data Layer
 */

export interface NormalizedCustomer {
    externalId: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    metadata?: any;
}

export interface NormalizedInvoice {
    externalId: string;
    customerId?: string | null; // Mapped to UnifiedCustomer
    invoiceNumber?: string | null;
    amount: number;
    balance: number;
    status: 'OPEN' | 'PAID' | 'OVERDUE' | 'VOIDED';
    dueDate?: Date | null;
    issuedDate?: Date | null;
    metadata?: any;
}

export interface NormalizedOrder {
    externalId: string;
    customerId?: string | null; // Mapped to UnifiedCustomer
    orderNumber?: string | null;
    totalAmount: number;
    totalPaid?: number;
    status: 'CREATED' | 'FULFILLED' | 'CANCELLED';
    orderDate?: Date | null;
    metadata?: any;
}

export interface NormalizedPayment {
    externalId: string;
    customerId?: string | null; // Mapped to UnifiedCustomer
    amount: number;
    method?: string | null;
    status: 'SUCCESS' | 'FAILED' | 'REFUNDED';
    paymentDate?: Date | null;
    metadata?: any;
}

export interface NormalizedShippingNote {
    externalId: string;
    orderId: string; // Mapped to UnifiedOrder
    trackingId?: string | null;
    carrier?: string | null;
    status: 'SHIPPED' | 'DELIVERED' | 'RETURNED';
    shippedDate?: Date | null;
    metadata?: any;
}

export interface NormalizedEstimate {
    externalId: string;
    customerId?: string | null;
    estimateNum?: string | null;
    amount: number;
    status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED';
    estimateDate?: Date | null;
    expiryDate?: Date | null;
    metadata?: any;
}

export interface NormalizedProduct {
    externalId: string;
    name: string;
    sku?: string | null;
    description?: string | null;
    price?: number | null;
    currency: string;
    quantity?: number;
    category?: string | null;
    metadata?: any;
}
