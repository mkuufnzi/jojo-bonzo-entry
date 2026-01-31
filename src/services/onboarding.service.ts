import { createQueue, QUEUES } from '../lib/queue';
import { logger } from '../lib/logger';
import { ProviderRegistry } from './integrations/providers';

const onboardingQueue = createQueue(QUEUES.ONBOARDING_SYNC);

export class OnboardingService {
    
    /**
     * Triggers a background sync for the connected provider.
     * @param userId 
     * @param provider 
     */
    async syncProviderData(userId: string, provider: string) {
        logger.info(`[OnboardingService] Enqueueing sync job for user ${userId} / provider ${provider}`);
        await onboardingQueue.add('sync-provider-data', {
            userId,
            provider
        });
    }

    // Future methods: triggerN8nWorkflow, emailWelcome, etc.
}

export const onboardingService = new OnboardingService();
