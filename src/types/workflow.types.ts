import { ServiceSlug } from './service.types';

/**
 * Valid trigger types supported by Floovioo Engine
 */
export type TriggerType = 'webhook' | 'invoice_overdue' | 'system';

/**
 * Filter configuration for webhook triggers
 */
export interface TriggerConfig {
    event?: string;             // Wildcard match (e.g. stripe.invoice.*)
    provider?: string;          // Provider specific filter
    source?: string;            // System source filter
    path?: string[];            // Path to value for custom filtering
    equals?: any;               // Value to match
}

/**
 * Known action types for the Floovioo automation engine.
 * Core types are listed explicitly; additional types (e.g. recovery,
 * data_sync) are allowed via the string escape hatch for extensibility.
 */
export type ActionType =
    | 'apply_branding'
    | 'brand_and_email'
    | 'email'
    | 'recovery_email'
    | 'generate_local_template'
    | 'data_sync'
    | (string & {}); // Allows extensibility without losing autocomplete

/**
 * Action configuration defining what task to execute.
 * Used by WorkflowService, RecoveryService, and DeliveryCore.
 */
export interface ActionConfig {
    type: ActionType;
    profileId?: string;         // Optional branding profile ID
    templateId?: string;        // Specific template ID for email actions
    skipN8n?: boolean;          // Whether to bypass n8n and use local engine
    steps?: Array<{ type: string; config?: Record<string, unknown> }>;
    [key: string]: unknown;     // Allow downstream services to add custom fields
}

/**
 * Normalized input payload for workflow execution
 */
export interface WebhookPayload {
    type?: string;              // Original event type
    normalizedEventType?: string; // Standardized Floovioo event
    provider?: string;          // Source provider (Stripe, QBO, etc)
    entityId?: string;          // ID of the primary resource (e.g. invoice_id)
    resourceType?: string;      // Type of resource (invoice, customer, etc)
    items?: any[];              // Document line items
    [key: string]: any;         // Catch-all for extra metadata
}

/**
 * Log entry for workflow executions
 */
export interface WorkflowExecutionResult {
    workflowId: string;
    status: 'success' | 'failed';
    result?: any;
    error?: string;
}
