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

export class SmartInvoice extends SmartDocument {
    public items: LineItem[];
    public recommendations: Recommendation[];
    public tutorials: Tutorial[];
    public nurtureMessages: NurtureMessage[];
    
    // Calculated fields
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
        metadata: Record<string, any> = {}
    ) {
        super(id, 'INVOICE', theme, config, metadata);
        this.items = items;
        this.recommendations = recommendations;
        this.tutorials = tutorials;
        this.nurtureMessages = nurtureMessages;
        
        this.calculateTotals();
    }

    public calculateTotals(): void {
        this.subtotal = this.items.reduce((acc, item) => acc + (item.price * item.qty), 0);
        this.tax = this.subtotal * 0.08; // Hardcoded 8% for now, could be configurable
        this.total = this.subtotal + this.tax;
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
     * Map raw payload from ERP/Webhook to SmartInvoice model
     */
    public static fromPayload(id: string, theme: SmartDocumentTheme, config: SmartDocumentConfig, payload: any): SmartInvoice {
        const items: LineItem[] = (payload.items || []).map((item: any, index: number) => ({
            id: index + 1,
            name: item.name || item.description || 'Product',
            sku: item.sku || 'N/A',
            qty: item.quantity || item.qty || 1,
            price: item.price || item.rate || 0,
            img: (item.metadata as any)?.img || '📦',
            category: item.category || 'General'
        }));

        // Bridge: RevenueService returns { offers: [...] }, legacy/mock data uses { recommendations: [...] }
        const rawRecs = payload.smartContent?.recommendations || [];
        const rawOffers = payload.smartContent?.offers || [];
        const mergedRecs = rawRecs.length > 0 ? rawRecs : rawOffers;

        const recommendations: Recommendation[] = mergedRecs.map((rec: any, index: number) => ({
            id: rec.id || index + 1,
            name: rec.name || rec.productName || 'Product',
            price: typeof rec.price === 'number' ? rec.price : parseFloat(rec.price) || 0,
            img: rec.img || '✨',
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
            thumb: tut.thumb || '📺',
            steps: tut.steps || [],
            forProduct: tut.forProduct || ''
        }));

        const nurtureMessages: NurtureMessage[] = (payload.smartContent?.nurtureMessages || []);

        return new SmartInvoice(
            id,
            theme,
            config,
            items,
            recommendations,
            tutorials,
            nurtureMessages,
            { provider: payload.provider, originalId: payload.id }
        );
    }

    /**
     * Returns a plain object representation for the View/Frontend
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
                nurtureMessages: this.nurtureMessages
            },
            metadata: this.metadata
        };
    }
}
