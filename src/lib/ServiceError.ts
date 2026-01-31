export class AppError extends Error {
    constructor(public message: string, public statusCode: number = 500) {
        super(message);
        this.name = 'AppError';
    }
}

export class ServiceError extends AppError {
    public readonly code: string;
    public readonly reason: string;
    public readonly lockState?: any;

    constructor(message: string, code: string, reason: string, lockState?: any) {
        super(message, 403);
        this.code = code;
        this.reason = reason;
        this.lockState = lockState;
        this.name = 'ServiceError';
    }

    static SubscriptionRequired(status: string) {
        return new ServiceError(
            `Subscription error: Status is ${status}.`, 
            'SUBSCRIPTION_REQUIRED', 
            'subscription_required',
            { requestedStatus: 'active', currentStatus: status }
        );
    }

    static AppContextRequired() {
        return new ServiceError(
            'Access Denied: App Context Required.', 
            'APP_CONTEXT_REQUIRED', 
            'no_app_context'
        );
    }

    static ServiceDisabled(serviceName: string) {
        return new ServiceError(
            `Service '${serviceName}' is disabled for this App.`, 
            'SERVICE_DISABLED', 
            'service_disabled'
        );
    }

    static QuotaReached(limitType: string) {
        return new ServiceError(
            `Monthly ${limitType} quota reached.`, 
            'QUOTA_REACHED', 
            'quota_reached',
            { limitType }
        );
    }

    static FeatureNotIncluded(featureKey: string) {
        return new ServiceError(
            `Your plan does not include the ${featureKey} feature.`, 
            'FEATURE_NOT_INCLUDED', 
            'feature_not_included',
            { featureKey }
        );
    }
}
