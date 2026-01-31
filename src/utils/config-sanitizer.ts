/**
 * Config Sanitizer
 * 
 * Filters service config for safe frontend consumption.
 * Works with the config structure defined in seeder.service.ts:
 * {
 *   webhooks: { [key]: { url, method, label, description } },
 *   endpoints: [...],
 *   paths: [...],
 *   dependencies: [...]
 * }
 * 
 * SECURITY: Never exposes webhook URLs, API keys, or secrets to frontend.
 */

export interface FrontendAction {
    key: string;
    label: string;
    description: string;
    method: string;
}

export interface FrontendServiceConfig {
    // Available actions (derived from webhooks, URLs stripped)
    actions: FrontendAction[];
    
    // Document types this service supports
    documentTypes: string[];
    
    // Feature flags based on configured webhooks
    features: {
        canAnalyze: boolean;
        canGenerate: boolean;
        canConvert: boolean;
    };
    
    // Limits
    limits: {
        maxFiles: number;
        maxFileSize: number;
    };
    
    // Dependent services (for UI display, no endpoints)
    dependencies: Array<{
        service: string;
        purpose: string;
    }>;
    
    // Billable paths (for frontend to know which actions cost)
    billablePaths: string[];
}

/**
 * Sanitize full service config for frontend consumption
 * @param config - Raw config from Service.config (DB)
 * @returns Sanitized config safe for frontend
 */
export function sanitizeConfigForFrontend(config: any): FrontendServiceConfig {
    if (!config || typeof config !== 'object') {
        return getDefaultConfig();
    }

    const webhooks = config.webhooks || {};
    const paths = config.paths || [];
    const dependencies = config.dependencies || [];
    
    // Extract actions from webhooks (strip URLs)
    const actions: FrontendAction[] = Object.entries(webhooks).map(([key, value]: [string, any]) => {
        if (typeof value === 'string') {
            // Legacy format: just URL string
            return { key, label: formatLabel(key), description: '', method: 'POST' };
        }
        // New format: object with metadata
        return {
            key,
            label: value.label || formatLabel(key),
            description: value.description || '',
            method: value.method || 'POST'
        };
    });

    // Determine feature flags from available webhooks
    const hasWebhook = (key: string) => !!webhooks[key];
    
    return {
        actions,
        documentTypes: config.supportedDocTypes || [],
        features: {
            canAnalyze: hasWebhook('analyze'),
            canGenerate: hasWebhook('generate'),
            canConvert: dependencies.some((d: any) => d.service === 'html-to-pdf')
        },
        limits: {
            maxFiles: config.maxFiles || 3,
            maxFileSize: config.maxFileSize || 10 * 1024 * 1024 // 10MB
        },
        dependencies: dependencies.map((d: any) => ({
            service: d.service,
            purpose: d.purpose
        })),
        billablePaths: paths
            .filter((p: any) => p.billable)
            .map((p: any) => p.path)
    };
}

/**
 * Get default config for services without config
 */
function getDefaultConfig(): FrontendServiceConfig {
    return {
        actions: [],
        documentTypes: [],
        features: { canAnalyze: false, canGenerate: false, canConvert: false },
        limits: { maxFiles: 1, maxFileSize: 5 * 1024 * 1024 },
        dependencies: [],
        billablePaths: []
    };
}

/**
 * Format action key to human-readable label
 */
function formatLabel(key: string): string {
    return key
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}
