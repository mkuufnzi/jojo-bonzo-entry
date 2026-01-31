export interface ServiceAccessContext {
    user: {
        id: string;
        email: string;
        plan: {
            name: string;
            aiQuota: number;
            pdfQuota: number;
        };
        subscriptionStatus: 'active' | 'canceling' | 'past_due' | 'unpaid' | 'trialing' | 'paused' | 'incomplete' | 'incomplete_expired' | 'none';
    };
    app?: {
        id: string;
        name: string;
        isActive: boolean;
        services: string[]; // List of enabled service slugs
        apiKey?: string;
    };
    service: {
        id: string;
        slug: string;
        name: string;
        isRestricted: boolean; // Requires App Context (AI/PDF)
        requiredFeatureKey?: string;
    };
    quota: {
        remaining: number;
        isLimitReached: boolean;
        limitType: 'ai' | 'pdf' | 'none';
        resetDate?: Date;
    };
    lockState: {
        isLocked: boolean;
        reason: 'none' | 'no_app_context' | 'service_disabled' | 'quota_reached' | 'subscription_required' | 'guest_restricted' | 'maintenance';
        message?: string;
        softLock: boolean; // If true, allow GET but flag UI. If false, Hard Block.
    };
    requestId: string; // Trace ID for logging
}

export type LockReason = ServiceAccessContext['lockState']['reason'];
