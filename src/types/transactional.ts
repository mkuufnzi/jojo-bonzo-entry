/**
 * Floovioo Transactional Service - Type Definitions
 * Phase 1 Standardization
 */

// ==========================================
// 1. BRAND & VISUAL IDENTITY
// ==========================================

export interface BrandingTheme {
  name: string;           // Business Name to display
  logo?: string;          // URL or SVG/Emoji
  tagline?: string;       // Brand slogan
  
  // Colors
  primary: string;        // Hex
  secondary: string;      // Hex
  accent?: string;        // Hex
  background?: string;    // Hex or Pattern URL
  text: string;           // Hex
  
  // Typography
  fontFamily?: string;    // e.g. 'Inter', 'Playfair Display'
  
  // Advanced
  cssVariables?: Record<string, string>; // Custom CSS vars injection
}

export interface GlobalConfig {
  dateFormat: string;      // e.g., 'MM/DD/YYYY'
  currencySymbol: string;  // e.g., '$'
  locale: string;         // e.g., 'en-US'
  watermarkEnabled: boolean;
}

// ==========================================
// 2. COMPONENT & WIDGET CONFIGURATION
// ==========================================

export interface ComponentState {
  enabled: boolean;
  config?: Record<string, any>; // Widget-specific settings (e.g. upsell algorithm)
}

export interface ComponentMap {
  [key: string]: ComponentState;
  // Common Keys:
  // 'header', 'footer', 'line_items', 'upsell', 'banner', 'tutorials', 'support'
}

// ==========================================
// 3. TRANSACTIONAL DATA MODELS (The Injection)
// ==========================================

export interface LineItem {
  id: string | number;
  name: string;
  description?: string;
  sku?: string;
  qty: number;
  price: number;
  total: number;
  image?: string;       // Thumbnail for visual receipts
  category?: string;    // Used for upsell matching
}

export interface Recommendation {
  id: string | number;
  name: string;
  price: number;
  img: string;          // Emoji or URL
  reason: string;       // AI generated reason
  matchScore?: number;  // 0-100
  badge?: string;       // "Best Value", "Trending"
}

export interface TransactionalDocument {
  id: string;               // Invoice Number / Quote ID
  type: 'INVOICE' | 'RECEIPT' | 'QUOTE';
  
  // Dates
  issuedAt: string;         // ISO Date
  dueAt?: string;           // ISO Date
  
  // Parties
  customer: {
    name: string;
    email?: string;
    address?: string[];
  };
  
  merchant: {
    name: string;
    address?: string[];
    taxId?: string;
  };

  // Financials
  items: LineItem[];
  subtotal: number;
  tax: number;
  discount?: number;
  total: number;
  currency: string;
  status: string;           // 'paid', 'pending', 'overdue'

  // Enrichment (AI Generated)
  recommendations?: Recommendation[];
  nurtureMessages?: Array<{ icon: string; headline: string; body: string }>;
  tutorials?: Array<{ title: string; duration: string; url: string; thumb: string }>;
}

// ==========================================
// 4. SESSION CONTEXT (State Management)
// ==========================================

export interface SessionContext {
  // Who is editing?
  userId: string;
  businessId: string;
  
  // What does the brand look like? (Persisted)
  profile: {
    id: string;
    theme: BrandingTheme;
    components: ComponentMap;
  };

  // What template is active?
  activeTemplateId: string;
  
  // What data are we previewing?
  document: TransactionalDocument; // Real or Mock
}

// ==========================================
// 5. TEMPLATE REGISTRY (Manifests)
// ==========================================

export interface TemplateFeatureDef {
  id: string;
  name: string;
  type: 'toggle' | 'select' | 'color';
  defaultEnabled?: boolean;
}

export interface TemplateManifest {
  id: string;
  name: string;
  type: 'INVOICE' | 'RECEIPT' | 'QUOTE';
  description?: string;
  tags?: string[];
  version?: string;
  author?: string;
  
  // Configuration
  features: TemplateFeatureDef[];
  viewPath?: string; // Override default path
}
