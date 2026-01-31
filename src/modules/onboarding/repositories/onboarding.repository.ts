
import { Business, OnboardingStatus } from '@prisma/client';
import { BaseRepository } from '../../../common/repositories/base.repository';

export class OnboardingRepository extends BaseRepository<Business, any, any> {
    protected modelName = 'Business';

    protected getDelegate() {
        return this.db.business;
    }

    async getStatus(businessId: string) {
        return this.db.business.findUnique({
            where: { id: businessId },
            select: { onboardingStatus: true, currentOnboardingStep: true }
        });
    }

    async updateStatus(businessId: string, status: OnboardingStatus, step: number) {
        return this.db.business.update({
            where: { id: businessId },
            data: { onboardingStatus: status, currentOnboardingStep: step }
        });
    }
}
