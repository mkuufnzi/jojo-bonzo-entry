
export interface DunningStep {
    day: number;
    action: 'email' | 'sms' | 'crm' | 'workflow';
    templateId?: string;
    customSubject?: string; // Custom email subject per step
    customBody?: string; // For overriding the template
    metadata?: Record<string, any>; // For CRM actions (e.g. { offerCode: 'SAVE10' })
}

export interface RecoveryActionRequest {
    businessId: string;
    externalInvoiceId: string;
    customerEmail: string;
    customerName?: string;
    amount: number;
    currency: string;
    dueDate: Date;
    userId?: string;
    actionId?: string; // Links to DebtCollectionAction
}

export interface RecoveryStatus {
    totalOverdue: number;
    pendingReminders: number;
    recoveredAmount: number;
    recoveredCount: number;
    activeSessions: number;
    totalSessions: number;
    untrackedOverdue: number;
    trackedSessions?: number;
    /** Percentage of invoices recovered after being subjected to recovery sequences */
    successRate: number;
    /** Total outstanding balance across all unpaid invoices under management */
    totalOutstanding: number;
    // Collections
    recentSessions?: any[];
    sequences?: any[];
    customerSessions?: any[];
    // Integration Health Stats (from normalized DebtCollectionInvoice table)
    totalInvoices?: number;
    unpaidInvoices?: number;
    overdueInvoices?: number;
    sequence?: any;
}

// ── API Request/Response Types ──

export interface PaginationParams {
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
    data: T[];
    meta: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

export interface SessionDetailResponse {
    session: any;
    actions: any[];
    sequence: any;
    timeline: TimelineEntry[];
}

export interface TimelineEntry {
    timestamp: Date;
    type: 'session_created' | 'action_queued' | 'action_sent' | 'action_failed' | 'step_advanced' | 'session_paused' | 'session_resumed' | 'session_terminated' | 'session_recovered';
    description: string;
    metadata?: any;
}

export interface BulkActionRequest {
    action: 'pause' | 'resume' | 'terminate';
    sessionIds: string[];
}

export interface BulkActionResponse {
    success: boolean;
    affected: number;
    errors: { sessionId: string; error: string }[];
}

export interface InvoiceRiskAnalysis {
    invoiceId: string;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    riskScore: number; // 0-100
    factors: { name: string; impact: number; description: string }[];
    recommendedAction: string;
    estimatedRecoveryProbability: number;
}

export interface RecoveryAnalyticsOverview {
    recoveryRate: number;
    totalRecovered: number;
    totalOutstanding: number;
    activeSessions: number;
    actionStats: {
        total: number;
        sent: number;
        failed: number;
        queued: number;
        skipped: number;
    };
    trend: { date: string; recovered: number; newOverdue: number }[];
}

export interface CreateSequenceRequest {
    name: string;
    steps: DunningStep[];
    isActive?: boolean;
    isDefault?: boolean;
    rules?: any;
    settings?: {
        gracePeriod?: number;
        brandVoice?: string;
        maxAttempts?: number;
    };
}

// ════════════════════════════════════════════════════════════
// ██  n8n WEBHOOK CONTRACT — Outgoing & Incoming
//
// These are the strict, versioned interfaces for the n8n
// integration. n8n workflows MUST conform to these types.
// Do NOT add fields without updating both sides.
// ════════════════════════════════════════════════════════════

/** Events Floovioo emits to n8n */
export type RecoveryOutboundEvent =
    | 'recovery.email.send'
    | 'recovery.sms.send'
    | 'recovery.call.review'
    | 'recovery.batch.send';

/** Status values n8n reports back to Floovioo */
export type RecoveryCallbackStatus =
    | 'sent'
    | 'delivered'
    | 'failed'
    | 'bounced'
    | 'opened';

/**
 * Payload Floovioo sends TO n8n for each dunning action.
 * Mirrors the `envelope.recovery` block set in WorkflowService.executeAction().
 */
export interface RecoveryWebhookOutbound {
    /** Discriminator that n8n uses to route to the correct sub-workflow */
    event: RecoveryOutboundEvent;

    /** Tracking IDs n8n MUST echo back in the callback */
    trackingId: string;      // == actionId (single mode)
    sessionId: string | null;
    actionIds?: string[];    // Batch mode only
    sessionIds?: string[];   // Batch mode only
    batchMode: boolean;

    businessId: string;
    customer: {
        id: string;
        name: string;
        email: string;
    };
    invoice: {
        id: string;
        balance: number;
        dueDate: string;         // ISO-8601
        currency: string;
    };
    sequence: {
        id: string;
        name: string;
        currentStep: number;     // 0-indexed
        totalSteps: number;
    };

    /**
     * URL Floovioo exposes for n8n to POST the result.
     * Format: `${APP_URL}/api/callbacks/recovery/action`
     * 
     * n8n MUST POST to this URL after completing the action
     * so Floovioo can advance the session step.
     */
    callbackUrl: string;

    timestamp: string;           // ISO-8601 dispatch time
}

/**
 * Payload n8n sends BACK to Floovioo after executing the dunning action.
 * n8n workflow must POST this to `callbackUrl`.
 */
export interface RecoveryWebhookCallback {
    /** Echo of the trackingId from the outbound payload (== actionId) */
    trackingId: string;

    /** Echo of sessionId from outbound payload */
    sessionId: string | null;

    /** For batch mode — array of actionIds that were processed */
    actionIds?: string[];

    /** Delivery outcome */
    status: RecoveryCallbackStatus;

    /** Provider-specific delivery metadata */
    deliveryMetadata?: {
        messageId?: string;      // e.g. SendGrid Message-ID
        provider?: string;       // e.g. 'sendgrid', 'mailgun'
        recipientEmail?: string;
        openedAt?: string;       // ISO-8601
        bouncedAt?: string;      // ISO-8601
        bounceReason?: string;
    };

    /** Human-readable error if status == 'failed' | 'bounced' */
    error?: string;

    /** ISO-8601 — when n8n completed the action */
    timestamp: string;
}

/**
 * Shape stored in DebtCollectionAction.metadata after a callback is received.
 * This is what the action detail page reads.
 */
export interface RecoveryActionMetadata {
    // Outbound
    dispatchedAt?: string;
    webhookUrl?: string;
    payloadSummary?: Partial<RecoveryWebhookOutbound>;

    // Inbound (callback)
    callbackReceivedAt?: string;
    callbackStatus?: RecoveryCallbackStatus;
    deliveryMetadata?: RecoveryWebhookCallback['deliveryMetadata'];
    callbackError?: string;
}
