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
