
export interface SmartDocumentTheme {
    name: string;
    primary: string;
    secondary: string;
    accent: string;
    light: string;
    text: string;
    pattern: string;
    logo: string;
    tagline: string;
    gradient: string;
}

export interface SmartDocumentConfig {
    upsellEnabled: boolean;
    contentConfig: Record<string, any>;
}

export abstract class SmartDocument {
    public id: string;
    public type: string;
    public theme: SmartDocumentTheme;
    public config: SmartDocumentConfig;
    public metadata: Record<string, any>;

    constructor(
        id: string,
        type: string,
        theme: SmartDocumentTheme,
        config: SmartDocumentConfig,
        metadata: Record<string, any> = {}
    ) {
        this.id = id;
        this.type = type;
        this.theme = theme;
        this.config = config;
        this.metadata = metadata;
    }

    /**
     * Calculates financial totals (Tax, Subtotal, Grand Total).
     * Must be implemented by concrete classes.
     */
    abstract calculateTotals(): void;

    /**
     * Serializes the document data for storage or frontend consumption.
     */
    abstract toJSON(): Record<string, any>;
}
