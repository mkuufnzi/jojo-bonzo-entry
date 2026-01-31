export const ROLES = {
    ROOT: 'ROOT',
    CEO: 'CEO',
    COO: 'COO',
    DEVOPS: 'DEVOPS',
    MARKETING: 'MARKETING',
    SUPPORT: 'SUPPORT',
    USER: 'USER'
};

export const PERMISSIONS = {
    // System
    VIEW_LOGS: 'view_logs',
    MANAGE_SYSTEM: 'manage_system',
    
    // Revenue
    VIEW_REVENUE: 'view_revenue',
    MANAGE_PLANS: 'manage_plans',
    
    // Analytics
    VIEW_BILLING: 'view_billing',
    VIEW_SUBSCRIPTIONS: 'view_subscriptions',
    VIEW_ANALYTICS: 'view_analytics',
    
    // Users
    VIEW_USERS: 'view_users',
    MANAGE_USERS: 'manage_users', // Ban, Edit
    IMPERSONATE: 'impersonate_user',
    
    // Features
    VIEW_FEATURES: 'view_features',
    MANAGE_FEATURES: 'manage_features', // Toggles
    DELETE_FEATURES: 'delete_features',
    
    // Services
    MANAGE_SERVICES: 'manage_services' // Webhooks, Config
};

export const ROLE_PERMISSIONS: Record<string, string[]> = {
    [ROLES.ROOT]: [...Object.values(PERMISSIONS)], // All permissions
    
    [ROLES.CEO]: [
        PERMISSIONS.VIEW_REVENUE,
        PERMISSIONS.VIEW_BILLING,
        PERMISSIONS.VIEW_SUBSCRIPTIONS,
        PERMISSIONS.VIEW_ANALYTICS,
        PERMISSIONS.VIEW_USERS,
        PERMISSIONS.VIEW_LOGS,
        PERMISSIONS.VIEW_FEATURES
    ],
    
    [ROLES.COO]: [
        PERMISSIONS.VIEW_REVENUE,
        PERMISSIONS.VIEW_SUBSCRIPTIONS,
        PERMISSIONS.VIEW_ANALYTICS,
        PERMISSIONS.VIEW_USERS,
        PERMISSIONS.VIEW_FEATURES
    ],
    
    [ROLES.DEVOPS]: [
        PERMISSIONS.VIEW_LOGS,
        PERMISSIONS.VIEW_ANALYTICS,
        PERMISSIONS.MANAGE_SYSTEM,
        PERMISSIONS.MANAGE_SERVICES,
        PERMISSIONS.VIEW_USERS
    ],
    
    [ROLES.MARKETING]: [
        PERMISSIONS.VIEW_ANALYTICS,
        PERMISSIONS.VIEW_FEATURES,
        PERMISSIONS.MANAGE_FEATURES,
        PERMISSIONS.MANAGE_PLANS,
        PERMISSIONS.VIEW_USERS
    ],
    
    [ROLES.SUPPORT]: [
        PERMISSIONS.VIEW_USERS,
        PERMISSIONS.IMPERSONATE // Maybe?
    ],
    
    [ROLES.USER]: []
};
