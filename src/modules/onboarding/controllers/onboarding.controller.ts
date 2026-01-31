
import { Request, Response } from 'express';
import { OnboardingService } from '../services/onboarding.service';
import { AuthRequest } from '../../../middleware/auth.middleware';

export class OnboardingController {
    static async checkStatus(req: Request, res: Response) {
        const authReq = req as AuthRequest;
        const service = new OnboardingService();

        try {
            const result = await service.getOnboardingStatus({
                userId: authReq.user?.id,
                businessId: authReq.user?.businessId, // User must belong to a business
                appId: authReq.currentApp?.id,
                email: authReq.user?.email
            });

            return res.json(result);
        } catch (error: any) {
            const status = error.statusCode || 500;
            return res.status(status).json({ error: error.message });
        }
    }
}
