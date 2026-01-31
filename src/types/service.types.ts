/**
 * Strict Service Types
 * 
 * Prevents "magic string" limits and typo-based bugs in service logic.
 * This should match the slug in the database.
 */

export const ServiceSlugs = {
    // PDF Tools
    HTML_TO_PDF: 'html-to-pdf',
    DOCX_TO_PDF: 'docx-to-pdf', // Proposed
    MERGE_PDF: 'merge-pdf',
    COMPRESS_PDF: 'compress-pdf',
    
    // AI Tools
    AI_DOC_GENERATOR: 'ai-doc-generator',
    AI_SUMMARIZER: 'ai-summarizer', // Proposed
} as const;

export type ServiceSlug = typeof ServiceSlugs[keyof typeof ServiceSlugs] | string; // Allow string for DB extensibility but prefer Enum

export interface ServiceConfig {
    headers?: Record<string, string>;
    method?: 'GET' | 'POST';
    billablePaths?: string[];
    webhooks?: Record<string, { url: string; method?: string }>;
    [key: string]: any;
}

export interface ServiceManifest {
    slug: ServiceSlug;
    name: string;
    description?: string;
    actions: string[];
}
