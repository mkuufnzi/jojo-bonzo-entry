// Master Identity Table
export interface FlooviooMaster {
    floovioo_id: string;        // Primary Key (e.g. "TechCorp")
    org_name: string;           // e.g. "Tech Corp Inc."
    primary_contact_email: string;
    subscription_tier: 'Starter' | 'Pro' | 'Enterprise';
    created_at: string;
}

// CRM Links
export interface FlooviooCRM {
    floovioo_id: string;
    crm_provider: 'HubSpot' | 'Salesforce' | 'Zoho';
    crm_account_id: string;
    crm_link_hash: string;
}

// Tenant Configuration (Branding & Settings)
export interface TenantConfig {
    floovioo_id: string;
    config_id: string;          // Unique Config Key
    ui_theme: string;           // e.g. "Dark Mode"
    feature_flags: string;      // JSON string or comma-separated
    max_users: number;
    api_rate_limit: number;
}

// Data Sources (Connections)
export interface TenantDataSource {
    floovioo_id: string;
    config_id: string;
    data_source_id: string;     // Unique Source Key (e.g. "drive_source_1")
    source_type: 'Google Drive' | 'AWS S3' | 'Salesforce';
    auth_endpoint: string;
    username: string;
    access_token_hash: string;
}

// Data Resources (Files/Objects)
export interface TenantResource {
    floovioo_id: string;
    config_id: string;
    data_source_id: string;
    data_resource_id: string;   // Unique Resource Key
    type: string;               // e.g. "Google Sheet", "Sales Report"
    folder_url: string;
    file_url: string;
    mime_type: string;
    hash: string;
}

// Access Logs
export interface TenantAccessLog {
    floovioo_id: string;
    config_id: string;
    data_source_id: string;
    data_resource_id: string;
    hash: string;
    timestamp: string;
    status_code: number;
    error?: string;
    data?: any;
}
