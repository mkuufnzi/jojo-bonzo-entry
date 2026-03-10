import { SmartDocument, SmartDocumentTheme, SmartDocumentConfig } from './smart-document.abstract';

export interface LineItem {
    id: number;
    name: string;
    sku: string;
    qty: number;
    price: number;
    img: string;
    category: string;
}

export interface Recommendation {
    id: number;
    name: string;
    price: number;
    img: string;
    sku?: string;
    reason: string;
    match: number;
    badge: string;
    sales: string;
}

export interface Tutorial {
    id: number;
    title: string;
    duration: string;
    type: 'recipe' | 'tutorial' | 'guide' | 'video';
    thumb: string;
    steps: string[];
    forProduct: string;
}

export interface NurtureMessage {
    icon: string;
    headline: string;
    body: string;
}

/**
 * Normalized invoice metadata extracted from any ERP (QBO, Xero, Zoho).
 */
export interface InvoiceMetadata {
    docNumber: string;
    txnDate: string;
    dueDate: string;
    status: string;
    currency: string;
    customerName: string;
    customerEmail: string;
    billAddress: { line1: string; line2: string; city: string; state: string; zip: string; country: string };
    shipAddress: { line1: string; line2: string; city: string; state: string; zip: string; country: string };
}

export class SmartInvoice extends SmartDocument {
    public items: LineItem[];
    public recommendations: Recommendation[];
    public tutorials: Tutorial[];
    public nurtureMessages: NurtureMessage[];
    public invoiceMeta: InvoiceMetadata;
    
    // Financial totals — may be sourced from ERP or calculated from items
    public subtotal: number = 0;
    public tax: number = 0;
    public total: number = 0;

    constructor(
        id: string,
        theme: SmartDocumentTheme,
        config: SmartDocumentConfig,
        items: LineItem[] = [],
        recommendations: Recommendation[] = [],
        tutorials: Tutorial[] = [],
        nurtureMessages: NurtureMessage[] = [],
        metadata: Record<string, any> = {},
        invoiceMeta?: Partial<InvoiceMetadata>,
        erpTotals?: { subtotal?: number; tax?: number; total?: number }
    ) {
        super(id, 'INVOICE', theme, config, metadata);
        this.items = items;
        this.recommendations = recommendations;
        this.tutorials = tutorials;
        this.nurtureMessages = nurtureMessages;
        this.invoiceMeta = {
            docNumber: invoiceMeta?.docNumber || id,
            txnDate: invoiceMeta?.txnDate || new Date().toISOString().split('T')[0],
            dueDate: invoiceMeta?.dueDate || '',
            status: invoiceMeta?.status || 'Open',
            currency: invoiceMeta?.currency || 'USD',
            customerName: invoiceMeta?.customerName || 'Customer',
            customerEmail: invoiceMeta?.customerEmail || '',
            billAddress: invoiceMeta?.billAddress || { line1: '', line2: '', city: '', state: '', zip: '', country: '' },
            shipAddress: invoiceMeta?.shipAddress || { line1: '', line2: '', city: '', state: '', zip: '', country: '' },
        };
        
        this.calculateTotals(erpTotals);
    }

    /**
     * Use real ERP totals when available; fall back to item-level calculation.
     */
    public calculateTotals(erpTotals?: { subtotal?: number; tax?: number; total?: number }): void {
        if (erpTotals?.total) {
            this.total = erpTotals.total;
            this.tax = erpTotals.tax ?? 0;
            this.subtotal = erpTotals.subtotal ?? (this.total - this.tax);
        } else {
            this.subtotal = this.items.reduce((acc, item) => acc + (item.price * item.qty), 0);
            this.tax = this.subtotal * 0.08;
            this.total = this.subtotal + this.tax;
        }
    }

    public addItem(item: LineItem): void {
        this.items.push(item);
        this.calculateTotals();
    }

    public removeItem(itemId: number): void {
        this.items = this.items.filter(i => i.id !== itemId);
        this.calculateTotals();
    }

    /**
     * Map raw payload from ERP/Webhook to SmartInvoice model.
     *
     * Data Source Priority:
     * 1. `payload.items` – Pre-normalized LineItem[] (from mock data, recovery batches, or pre-processed payloads)
     * 2. `payload.Line`  – Raw QuickBooks Invoice.Line[] (from QBOProvider.getEntity enrichment)
     * 3. Empty array      – Graceful fallback
     *
     * QuickBooks Line format reference:
     * ```json
     * { "DetailType": "SalesItemLineDetail", "Amount": 34.99,
     *   "SalesItemLineDetail": { "ItemRef": { "name": "Widget", "value": "37" }, "Qty": 1, "UnitPrice": 34.99 } }
     * ```
     */
    public static fromPayload(id: string, theme: SmartDocumentTheme, config: SmartDocumentConfig, payload: any): SmartInvoice {
        const sanitizeImg = (img: string | undefined | null, fallback: string): string => {
            if (!img || img === 'unknown') return fallback;
            return img;
        };

        // ── Normalize Line Items ───────────────────────────────
        let items: LineItem[] = [];

        if (Array.isArray(payload.items) && payload.items.length > 0) {
            // Path A: Pre-normalized items (mock, recovery batch, or manual)
            items = payload.items.map((item: any, index: number) => ({
                id: index + 1,
                name: item.name || item.description || 'Product',
                sku: item.sku || 'N/A',
                qty: item.quantity || item.qty || 1,
                price: item.price || item.rate || 0,
                img: sanitizeImg(item.img || (item.metadata as any)?.img, '📦'),
                category: item.category || 'General'
            }));
        } else {
            // Path B: Raw ERP Line items (QuickBooks, Xero, Zoho)
            const rawLines: any[] = payload.Line || payload._raw?.Line || [];
            items = rawLines
                .filter((line: any) =>
                    line.DetailType === 'SalesItemLineDetail' ||
                    (line.Amount && line.DetailType !== 'SubTotalLineDetail' && line.DetailType !== 'DiscountLineDetail')
                )
                .map((line: any, index: number) => {
                    const detail = line.SalesItemLineDetail || {};
                    return {
                        id: index + 1,
                        name: detail.ItemRef?.name?.split(':').pop()?.trim() || line.Description || 'Product',
                        sku: detail.ItemRef?.value || 'N/A',
                        qty: detail.Qty || 1,
                        price: detail.UnitPrice || (line.Amount / (detail.Qty || 1)) || 0,
                        img: sanitizeImg(null, '📦'),
                        category: detail.ItemAccountRef?.name || 'General'
                    };
                });
        }

        // ── Normalize Smart Content ────────────────────────────
        // Bridge: RevenueService returns { offers: [...] }, legacy/mock data uses { recommendations: [...] }
        const rawRecs = payload.smartContent?.recommendations || [];
        const rawOffers = payload.smartContent?.offers || [];
        const mergedRecs = rawRecs.length > 0 ? rawRecs : rawOffers;

        const recommendations: Recommendation[] = mergedRecs.map((rec: any, index: number) => ({
            id: rec.id || index + 1,
            name: rec.name || rec.productName || 'Product',
            price: typeof rec.price === 'number' ? rec.price : parseFloat(rec.price) || 0,
            img: sanitizeImg(rec.img, '🛍️'),
            sku: rec.sku || `SKU-${index + 1}`,
            reason: rec.reason || rec.copy || 'Recommended',
            match: rec.match || 90,
            badge: rec.badge || (rec.reason ? 'Smart Match' : 'AI'),
            sales: rec.sales || ''
        }));

        const tutorials: Tutorial[] = (payload.smartContent?.tutorials || []).map((tut: any, index: number) => ({
            id: tut.id || index + 1,
            title: tut.title,
            duration: tut.duration || '5 mins',
            type: tut.type || 'tutorial',
            thumb: sanitizeImg(tut.thumb, '📺'),
            steps: tut.steps || [],
            forProduct: tut.forProduct || ''
        }));

        const nurtureMessages: NurtureMessage[] = (payload.smartContent?.nurtureMessages || []).map((msg: any) => ({
            ...msg,
            icon: sanitizeImg(msg.icon, '✨')
        }));

        // ── Normalize Invoice Metadata (QBO / Xero / Zoho / Manual) ───
        const normalizeAddress = (addr: any) => ({
            line1: addr?.Line1 || addr?.line1 || '',
            line2: addr?.Line2 || addr?.line2 || '',
            city: addr?.City || addr?.city || '',
            state: addr?.CountrySubDivisionCode || addr?.Region || addr?.state || '',
            zip: addr?.PostalCode || addr?.zip || '',
            country: addr?.Country || addr?.country || ''
        });

        const invoiceMeta: Partial<InvoiceMetadata> = {
            docNumber: payload.DocNumber || payload.docNumber || payload.customer?.orderId || id,
            txnDate: payload.TxnDate || payload.txnDate || payload.date || new Date().toISOString().split('T')[0],
            dueDate: payload.DueDate || payload.dueDate || '',
            status: payload.Balance === 0 ? 'Paid' : (payload.Balance > 0 ? 'Open' : (payload.status || 'Open')),
            currency: payload.CurrencyRef?.value || payload.currency || 'USD',
            customerName: payload.CustomerRef?.name || payload.customer?.name || 'Customer',
            customerEmail: payload.BillEmail?.Address || payload.customer?.email || '',
            billAddress: normalizeAddress(payload.BillAddr || payload.customer?.address),
            shipAddress: normalizeAddress(payload.ShipAddr || payload.customer?.shippingAddress || payload.BillAddr),
        };

        // ── Extract ERP Totals (prefer real amounts over calculation) ──
        const erpTotals = payload.TotalAmt ? {
            total: payload.TotalAmt,
            tax: payload.TxnTaxDetail?.TotalTax ?? 0,
            subtotal: (payload.TotalAmt || 0) - (payload.TxnTaxDetail?.TotalTax ?? 0),
        } : undefined;

        return new SmartInvoice(
            id,
            theme,
            config,
            items,
            recommendations,
            tutorials,
            nurtureMessages,
            { provider: payload.provider, originalId: payload.id },
            invoiceMeta,
            erpTotals
        );
    }

    /**
     * Returns a plain object representation for the View/Frontend.
     * This is spread into `branding.model` in the EJS render context.
     */
    public toJSON(): Record<string, any> {
        return {
            id: this.id,
            type: this.type,
            theme: this.theme,
            config: this.config,
            data: {
                items: this.items,
                subtotal: this.subtotal,
                tax: this.tax,
                total: this.total,
                recommendations: this.recommendations,
                tutorials: this.tutorials,
                nurtureMessages: this.nurtureMessages,
                invoiceMeta: this.invoiceMeta
            },
            metadata: this.metadata
        };
    }
}
