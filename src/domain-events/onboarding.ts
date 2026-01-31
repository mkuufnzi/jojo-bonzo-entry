import { EventDomain, GlobalNamespace } from './global';

/**
 * Onboarding Actions
 * Specific steps in the onboarding lifecycle.
 */
export const OnboardingAction = {
    PROFILE: 'business_profile',
    CONNECTION: 'integration_connected',
    BRAND: 'brand_settings',
    DATA_SYNC: 'data_sync', // The Unified Data Sync
    COMPLETE: 'complete'
} as const;

export type OnboardingActionType = typeof OnboardingAction[keyof typeof OnboardingAction];

/**
 * Helper to construct the standardized event string
 * Format: "{Namespace}_{Domain}_{Action}"
 * Example: "floovioo_onboarding_business_profile"
 */
export const OnboardingEventTypes = {
    PROFILE: `${GlobalNamespace}_${EventDomain.ONBOARDING}_${OnboardingAction.PROFILE}`,
    CONNECTION: `${GlobalNamespace}_${EventDomain.ONBOARDING}_${OnboardingAction.CONNECTION}`,
    BRAND: `${GlobalNamespace}_${EventDomain.ONBOARDING}_${OnboardingAction.BRAND}`,
    DATA_SYNC: `${GlobalNamespace}_${EventDomain.ONBOARDING}_${OnboardingAction.DATA_SYNC}`,
    COMPLETE: `${GlobalNamespace}_${EventDomain.ONBOARDING}_${OnboardingAction.COMPLETE}`
};
