
import { BaseService, ServiceContext } from '../../../common/services/base.service';
import { OnboardingRepository } from '../repositories/onboarding.repository';
import { AppError } from '../../../lib/AppError';

export class OnboardingService extends BaseService {
    protected serviceName = 'OnboardingService';
    private repository: OnboardingRepository;

    constructor() {
        super();
        this.repository = new OnboardingRepository();
    }

    async getOnboardingStatus(context: ServiceContext) {
        this.validateContext(context);
        
        if (!context.businessId) {
            throw new AppError('Business ID required for onboarding check', 400);
        }

        const status = await this.repository.getStatus(context.businessId);
        
        if (!status) {
            throw new AppError('Business not found', 404);
        }

        // Logic: Return redirect URL based on step
        let redirectUrl: string | null = null;
        const s = status as any; // Cast to any to bypass stale IDE types
        if (s.onboardingStatus !== 'COMPLETED') {
             redirectUrl = `/onboarding/step/${s.currentOnboardingStep + 1}`;
        }

        return {
            status: s.onboardingStatus,
            step: s.currentOnboardingStep,
            redirectUrl
        };
    }
    /**
     * Update onboarding status and sync if necessary
     */
    async updateStatus(context: ServiceContext, status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED', step: number) {
        this.validateContext(context);
        if (!context.businessId) throw new AppError('Business ID required', 400);

        await this.repository.updateStatus(context.businessId, status, step);
        
        this.logSuccess('Updated onboarding status', context, { 
            businessId: context.businessId, 
            status, 
            step 
        });

        // Trigger n8n Sync if Complete
        if (status === 'COMPLETED') {
             try {
                // Dynamically import to avoid circular dependency if any
                const { designEngineService } = await import('../../../services/design-engine.service');
                // OR simpler if path is different. 
                // However, DesignEngine is in src/services. 
                // We should use the service registry in a real microservice, but here monolithic import is fine.
             } catch (e) {
                 // ignore for now until fully wired
             }
        }
    }
}
