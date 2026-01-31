export enum BillableAction {
    AI_ANALYZE = 'ai_analyze',
    AI_DRAFT = 'ai_draft',
    AI_FORMAT = 'ai_format',
    PDF_PREVIEW = 'pdf_preview',
    PDF_CONVERT = 'pdf_convert',
    STORAGE_UPLOAD = 'storage_upload'
}

export enum ResourceType {
    COMPUTE = 'compute',
    STORAGE = 'storage',
    NETWORK = 'network',
    API_CALL = 'api_call'
}

export interface BillableRequest {
    traceId: string;
    userId: string;
    appId?: string;
    apiKeyId?: string; // If we support multiple keys per app later
    action: BillableAction | string;
    resourceType: ResourceType;
    units: number; // e.g., 1 Request, 1000 Tokens, 5 MB
    costEstimate?: number;
    metadata?: Record<string, any>;
    timestamp: Date;
    isInternal: boolean; // Was this triggered by another service?
}

export interface BillingContext {
    billable: boolean;
    reason?: string; // "Free Tier", "Quota Exceeded"
    quotaRemaining?: number;
}
