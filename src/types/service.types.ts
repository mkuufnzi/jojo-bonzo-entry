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

    // Branding & Core
    TRANSACTIONAL_BRANDING: 'transactional-branding',
    DESIGN_ENGINE: 'design-engine',
} as const;

export const EventSegments = {
    PROJECT: 'floovioo',
    PRODUCT: {
        TRANSACTIONAL: 'transactional',
        AI: 'ai',
        SALES: 'sales',
        RETENTION: 'retention'
    },
    SERVICE: {
        BRANDING_AUTOMATION: 'branding_automation',
        DOC_GENERATOR: 'doc_generator'
    },
    REQUEST_TYPE: {
        REQUEST: 'request',
        EVENT: 'event',
        TASK: 'task'
    },
    ACTION: {
        APPLY: 'apply',
        CREATE: 'create',
        UPDATE: 'update',
        DELETE: 'delete',
        SYNC: 'sync'
    }
} as const;

/**
 * Builds a scoped event name following the pattern:
 * floovioo_<product_name>_<service_name>_<request_type>_<action>_<resource>
 */
export function buildScopedEventName(
    product: string,
    service: string,
    requestType: string,
    action: string,
    resource: string
): string {
    return [
        EventSegments.PROJECT,
        product,
        service,
        requestType,
        action,
        resource
    ].join('_').toLowerCase();
}

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
