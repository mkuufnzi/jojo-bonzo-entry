import { 
    NormalizedCustomer, 
    NormalizedInvoice, 
    NormalizedProduct,
    NormalizedOrder,
    NormalizedPayment,
    NormalizedShippingNote,
    NormalizedEstimate
} from './unified-data.types';

export class NormalizationEngine {
    
    /**
     * Converts a raw vendor customer payload into a NormalizedCustomer
     */
    static normalizeCustomer(provider: string, rawData: any): NormalizedCustomer {
        switch (provider.toLowerCase()) {
            case 'quickbooks':
                return {
                    externalId: rawData.Id,
                    name: rawData.DisplayName || rawData.CompanyName || `${rawData.GivenName} ${rawData.FamilyName}`,
                    email: rawData.PrimaryEmailAddr?.Address,
                    phone: rawData.PrimaryPhone?.FreeFormNumber,
                    metadata: rawData
                };
            case 'xero':
                return {
                    externalId: rawData.ContactID,
                    name: rawData.Name,
                    email: rawData.EmailAddress,
                    phone: rawData.Phones?.find((p: any) => p.PhoneType === 'DEFAULT')?.PhoneNumber,
                    metadata: rawData
                };
            case 'sage':
                return {
                    externalId: rawData.id,
                    name: rawData.contact_name || rawData.company_name,
                    email: rawData.email,
                    phone: rawData.telephone,
                    metadata: rawData
                };
            case 'shopify':
                return {
                    externalId: rawData.id?.toString(),
                    name: `${rawData.first_name} ${rawData.last_name}`.trim(),
                    email: rawData.email,
                    phone: rawData.phone,
                    metadata: rawData
                };
            default:
                throw new Error(`Unsupported provider for customer normalization: ${provider}`);
        }
    }

    /**
     * Converts a raw vendor invoice payload into a NormalizedInvoice
     */
    static normalizeInvoice(provider: string, rawData: any): NormalizedInvoice {
        switch (provider.toLowerCase()) {
            case 'quickbooks':
                return {
                    externalId: rawData.Id,
                    customerId: rawData.CustomerRef?.value,
                    invoiceNumber: rawData.DocNumber,
                    amount: rawData.TotalAmt,
                    balance: rawData.Balance,
                    status: this.mapQboInvoiceStatus(rawData) as any,
                    dueDate: rawData.DueDate ? new Date(rawData.DueDate) : undefined,
                    issuedDate: rawData.TxnDate ? new Date(rawData.TxnDate) : undefined,
                    metadata: rawData
                };
            case 'xero':
                return {
                    externalId: rawData.InvoiceID,
                    customerId: rawData.Contact?.ContactID,
                    invoiceNumber: rawData.InvoiceNumber,
                    amount: rawData.Total,
                    balance: rawData.AmountDue,
                    status: this.mapXeroInvoiceStatus(rawData) as any,
                    dueDate: rawData.DueDate ? new Date(rawData.DueDate) : undefined,
                    issuedDate: rawData.Date ? new Date(rawData.Date) : undefined,
                    metadata: rawData
                };
            case 'sage':
                return {
                    externalId: rawData.id,
                    customerId: rawData.contact?.id,
                    invoiceNumber: rawData.invoice_number,
                    amount: rawData.total_amount,
                    balance: rawData.outstanding_amount,
                    status: this.mapSageInvoiceStatus(rawData) as any,
                    dueDate: rawData.due_date ? new Date(rawData.due_date) : undefined,
                    issuedDate: rawData.date ? new Date(rawData.date) : undefined,
                    metadata: rawData
                };
            default:
                throw new Error(`Unsupported provider for invoice normalization: ${provider}`);
        }
    }

    /**
     * Converts a raw vendor product/item payload into a NormalizedProduct
     */
    static normalizeProduct(provider: string, rawData: any): NormalizedProduct {
        switch (provider.toLowerCase()) {
            case 'quickbooks':
                return {
                    externalId: rawData.Id,
                    name: rawData.Name,
                    sku: rawData.Sku,
                    description: rawData.Description,
                    price: rawData.UnitPrice,
                    currency: 'USD',
                    quantity: rawData.QtyOnHand || 0,
                    category: rawData.Type,
                    metadata: rawData
                };
            case 'xero':
                return {
                    externalId: rawData.ItemID,
                    name: rawData.Name,
                    sku: rawData.Code,
                    description: rawData.Description,
                    price: rawData.SalesDetails?.UnitPrice,
                    currency: 'USD',
                    metadata: rawData
                };
            case 'sage':
                return {
                    externalId: rawData.id,
                    name: rawData.description || rawData.id,
                    sku: rawData.item_code,
                    description: rawData.sales_ledger_account?.name,
                    price: rawData.sales_price,
                    currency: 'USD',
                    metadata: rawData
                };
            case 'shopify':
                return {
                    externalId: rawData.id?.toString(),
                    name: rawData.title,
                    sku: rawData.variants?.[0]?.sku,
                    description: rawData.body_html,
                    price: parseFloat(rawData.variants?.[0]?.price || '0'),
                    currency: rawData.variants?.[0]?.presentment_prices?.[0]?.price?.currency_code || 'USD',
                    metadata: rawData
                };
            default:
                throw new Error(`Unsupported provider for product normalization: ${provider}`);
        }
    }

    /**
     * Converts a raw vendor Order payload into a NormalizedOrder
     */
    static normalizeOrder(provider: string, rawData: any): NormalizedOrder {
        switch (provider.toLowerCase()) {
            case 'shopify':
                return {
                    externalId: rawData.id?.toString(),
                    customerId: rawData.customer?.id?.toString(),
                    orderNumber: rawData.order_number?.toString(),
                    totalAmount: parseFloat(rawData.total_price || '0'),
                    totalPaid: parseFloat(rawData.total_price_paid || '0'),
                    status: rawData.fulfillment_status === 'fulfilled' ? 'FULFILLED' : (rawData.cancelled_at ? 'CANCELLED' : 'CREATED'),
                    orderDate: rawData.created_at ? new Date(rawData.created_at) : undefined,
                    metadata: rawData
                };
            case 'woocommerce':
                return {
                    externalId: rawData.id?.toString(),
                    customerId: rawData.customer_id?.toString(),
                    orderNumber: rawData.number,
                    totalAmount: parseFloat(rawData.total || '0'),
                    totalPaid: parseFloat(rawData.total_tax || '0'), // Mock or real field if available
                    status: rawData.status === 'completed' ? 'FULFILLED' : (rawData.status === 'cancelled' ? 'CANCELLED' : 'CREATED'),
                    orderDate: rawData.date_created ? new Date(rawData.date_created) : undefined,
                    metadata: rawData
                };
            case 'quickbooks':
                return {
                    externalId: rawData.Id,
                    customerId: rawData.CustomerRef?.value,
                    orderNumber: rawData.DocNumber,
                    totalAmount: rawData.TotalAmt,
                    totalPaid: rawData.TotalAmt - (rawData.Balance || 0),
                    status: (rawData.TxnStatus === 'Closed' || rawData.TxnStatus === 'Accepted') ? 'FULFILLED' : 'CREATED',
                    orderDate: rawData.TxnDate ? new Date(rawData.TxnDate) : undefined,
                    metadata: rawData
                };
            default:
                throw new Error(`Unsupported provider for order normalization: ${provider}`);
        }
    }

    /**
     * Converts a raw vendor Payment payload into a NormalizedPayment
     */
    static normalizePayment(provider: string, rawData: any): NormalizedPayment {
        switch (provider.toLowerCase()) {
            case 'stripe':
                return {
                    externalId: rawData.id,
                    customerId: rawData.customer,
                    amount: rawData.amount / 100, // Stripe is in cents
                    method: rawData.payment_method_details?.type,
                    status: rawData.status === 'succeeded' ? 'SUCCESS' : (rawData.status === 'failed' ? 'FAILED' : 'REFUNDED'),
                    paymentDate: rawData.created ? new Date(rawData.created * 1000) : undefined,
                    metadata: rawData
                };
            case 'quickbooks': // QBO Payment
                return {
                    externalId: rawData.Id,
                    customerId: rawData.CustomerRef?.value,
                    amount: rawData.TotalAmt,
                    method: rawData.PaymentMethodRef?.name,
                    status: 'SUCCESS', // QBO Payments are typically successful if recorded
                    paymentDate: rawData.TxnDate ? new Date(rawData.TxnDate) : undefined,
                    metadata: rawData
                };
            default:
                throw new Error(`Unsupported provider for payment normalization: ${provider}`);
        }
    }

    /**
     * Converts a raw vendor Shipping Note payload into a NormalizedShippingNote
     */
    static normalizeShippingNote(provider: string, rawData: any): NormalizedShippingNote {
        switch (provider.toLowerCase()) {
            case 'shipstation':
                return {
                    externalId: rawData.shipmentId?.toString(),
                    orderId: rawData.orderId?.toString(),
                    trackingId: rawData.trackingNumber,
                    carrier: rawData.carrierCode,
                    status: rawData.shipmentStatus === 'shipped' ? 'SHIPPED' : 'DELIVERED', // Simplify for now
                    shippedDate: rawData.shipDate ? new Date(rawData.shipDate) : undefined,
                    metadata: rawData
                };
            case 'shopify': // Shopify Fulfillment
                return {
                    externalId: rawData.id?.toString(),
                    orderId: rawData.order_id?.toString(),
                    trackingId: rawData.tracking_number,
                    carrier: rawData.tracking_company,
                    status: rawData.status === 'success' ? 'DELIVERED' : 'SHIPPED',
                    shippedDate: rawData.created_at ? new Date(rawData.created_at) : undefined,
                    metadata: rawData
                };
            default:
                throw new Error(`Unsupported provider for shipping note normalization: ${provider}`);
        }
    }

    /**
     * Converts a raw vendor Estimate payload into a NormalizedEstimate
     */
    static normalizeEstimate(provider: string, rawData: any): NormalizedEstimate {
        switch (provider.toLowerCase()) {
            case 'quickbooks':
                return {
                    externalId: rawData.Id,
                    customerId: rawData.CustomerRef?.value,
                    estimateNum: rawData.DocNumber,
                    amount: rawData.TotalAmt,
                    status: this.mapQboEstimateStatus(rawData) as any,
                    estimateDate: rawData.TxnDate ? new Date(rawData.TxnDate) : undefined,
                    expiryDate: rawData.ExpirationDate ? new Date(rawData.ExpirationDate) : undefined,
                    metadata: rawData
                };
            case 'xero': // Xero Quote
                return {
                    externalId: rawData.QuoteID,
                    customerId: rawData.Contact?.ContactID,
                    estimateNum: rawData.QuoteNumber,
                    amount: rawData.Total,
                    status: this.mapXeroQuoteStatus(rawData) as any,
                    estimateDate: rawData.Date ? new Date(rawData.Date) : undefined,
                    expiryDate: rawData.ExpiryDate ? new Date(rawData.ExpiryDate) : undefined,
                    metadata: rawData
                };
            default:
                throw new Error(`Unsupported provider for estimate normalization: ${provider}`);
        }
    }

    // --- Status Mappers ---

    private static mapQboInvoiceStatus(raw: any): string {
        // SalesReceipts don't have a Balance field in the same way, but they are always paid
        if (raw.Balance === 0 || raw.Balance === undefined) return 'PAID';
        if (raw.DueDate && new Date(raw.DueDate) < new Date() && raw.Balance > 0) return 'OVERDUE';
        return 'OPEN';
    }

    private static mapXeroInvoiceStatus(raw: any): string {
        const s = raw.Status?.toUpperCase();
        if (s === 'PAID') return 'PAID';
        if (s === 'VOIDED' || s === 'DELETED') return 'VOIDED';
        if (raw.DueDate && new Date(raw.DueDate) < new Date() && raw.AmountDue > 0) return 'OVERDUE';
        return 'OPEN';
    }

    private static mapSageInvoiceStatus(raw: any): string {
        const s = raw.status?.id?.toUpperCase();
        if (s === 'PAID') return 'PAID';
        if (s === 'VOID') return 'VOIDED';
        if (raw.due_date && new Date(raw.due_date) < new Date() && raw.outstanding_amount > 0) return 'OVERDUE';
        return 'OPEN';
    }

    private static mapQboEstimateStatus(raw: any): string {
        // QBO TxnStatus: Accepted, Closed, Pending, Rejected
        const s = raw.TxnStatus?.toUpperCase() || 'PENDING';
        if (s === 'ACCEPTED') return 'ACCEPTED';
        if (s === 'REJECTED') return 'REJECTED';
        if (s === 'CLOSED') return 'ACCEPTED'; // Usually closed when invoiced
        return 'SENT';
    }

    private static mapXeroQuoteStatus(raw: any): string {
        const s = raw.Status?.toUpperCase();
        if (s === 'ACCEPTED') return 'ACCEPTED';
        if (s === 'DECLINED') return 'REJECTED';
        if (s === 'DRAFT') return 'DRAFT';
        return 'SENT';
    }
}
