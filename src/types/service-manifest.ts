export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface ServiceAction {
    key: string;              // Internal key (e.g., 'analyze', 'draft')
    label: string;            // Human-readable label (e.g., 'Analyze Request')
    description?: string;     // Description for UI/Docs
    endpoint: string;         // Internal route suffix (e.g., '/analyze')
    method: HttpMethod;       // HTTP Method
    requiredFeature?: string; // Feature flag key required to access this action
    isBillable?: boolean;     // Whether this action counts against quota
}

export interface ServiceManifest {
    slug: string;             // Unique Service Identifier (matches DB slug)
    name: string;             // Display Name
    description?: string;
    version: string;
    actions: ServiceAction[]; // List of exposed capabilities
    externalCalls?: {         // Declared external dependencies
        domain: string;
        purpose: string;
    }[];
    endpoints?: {             // API Enpoints exposed by this service
        path: string;
        method: HttpMethod;
        description?: string;
        billable?: boolean;
    }[];
}
