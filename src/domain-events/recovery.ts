import { EventDomain, GlobalNamespace } from './global';

/**
 * Debt Collection / Recovery Actions
 * Specific steps in the debt collection lifecycle.
 */
export const RecoveryAction = {
    BATCH_DISPATCH: 'batch_dispatch', // Dispatching a batch of actions (emails/SMS)
    SESSION_CREATED: 'session_created',
    SESSION_PAUSED: 'session_paused',
    SESSION_RESUMED: 'session_resumed',
    SESSION_ESCALATED: 'session_escalated',
    SESSION_RECOVERED: 'session_recovered'
} as const;

export type RecoveryActionType = typeof RecoveryAction[keyof typeof RecoveryAction];

/**
 * Helper to construct the standardized event string
 * Format: "{Namespace}_{Domain}_{Action}"
 * Example: "floovioo_transactional_batch_dispatch"
 */
export const RecoveryEventTypes = {
    BATCH_DISPATCH: `${GlobalNamespace}_${EventDomain.TRANSACTIONAL}_${RecoveryAction.BATCH_DISPATCH}`,
    SESSION_CREATED: `${GlobalNamespace}_${EventDomain.TRANSACTIONAL}_${RecoveryAction.SESSION_CREATED}`,
    SESSION_PAUSED: `${GlobalNamespace}_${EventDomain.TRANSACTIONAL}_${RecoveryAction.SESSION_PAUSED}`,
    SESSION_RESUMED: `${GlobalNamespace}_${EventDomain.TRANSACTIONAL}_${RecoveryAction.SESSION_RESUMED}`,
    SESSION_ESCALATED: `${GlobalNamespace}_${EventDomain.TRANSACTIONAL}_${RecoveryAction.SESSION_ESCALATED}`,
    SESSION_RECOVERED: `${GlobalNamespace}_${EventDomain.TRANSACTIONAL}_${RecoveryAction.SESSION_RECOVERED}`
};
