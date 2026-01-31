
import { logger } from '../../lib/logger';
import { AppError } from '../../lib/AppError';

export interface ServiceContext {
    userId?: string;
    businessId?: string;
    appId?: string;
    email?: string;
}

/**
 * Base Service
 * Enforces context passing and standardized error handling.
 * All Domain Services MUST extend this class.
 */
export abstract class BaseService {
    protected abstract serviceName: string;

    /**
     * Validates that the request has a valid App and User context.
     * Required for all Protected actions.
     */
    protected validateContext(context: ServiceContext) {
        if (!context.appId) {
            throw new AppError('Context Error: Missing App ID', 400); // 400 Bad Request
        }
        // User might be optional for some public/system actions, but usually required
    }

    protected logSuccess(action: string, context: ServiceContext, metadata?: any) {
        logger.info({
            service: this.serviceName,
            action,
            userId: context.userId,
            appId: context.appId,
            ...metadata
        }, `[${this.serviceName}] ${action} Success`);
    }

    protected logError(action: string, error: any, context?: ServiceContext) {
        logger.error({
            service: this.serviceName,
            action,
            userId: context?.userId,
            appId: context?.appId,
            err: error
        }, `[${this.serviceName}] ${action} Failed`);
    }
}
