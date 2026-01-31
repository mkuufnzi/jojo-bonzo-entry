/**
 * Global Event System
 * Base definitions for all system events.
 */

export const GlobalNamespace = 'floovioo';

export enum EventDomain {
    ONBOARDING = 'onboarding',
    TRANSACTIONAL = 'transactional',
    SYSTEM = 'system',
    // Future domains...
}

export interface GlobalEvent {
    domain: EventDomain;
    action: string;
    // Standard versioning for all events
    version: string; 
}
