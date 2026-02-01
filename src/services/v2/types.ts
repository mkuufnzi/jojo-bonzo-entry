import { z } from 'zod';
import { 
    UnifiedInvoiceSchema, 
    PreviewRequestSchema, 
    SendRequestSchema, 
    DeliveryRequestSchema 
} from './schemas';
import * as schemas from './schemas';

// Re-export Zod inferred types for use in Service Signatures
export type UnifiedInvoice = z.infer<typeof UnifiedInvoiceSchema>;
export type PreviewRequest = z.infer<typeof PreviewRequestSchema>;
export type SendRequest = z.infer<typeof SendRequestSchema>;
export type DeliveryRequest = z.infer<typeof DeliveryRequestSchema>;

export interface PreviewResponse {
    html: string;
    structure?: Record<string, unknown>; // Safer than 'any'
    cached?: boolean;
}

// Unified Contact (Customer/Vendor)
export type UnifiedContact = z.infer<typeof schemas.CustomerSchema> & {
    id: string; // Database ID
    externalId: string;
    _raw?: any;
};

// Unified Item (Product/Service)
export type UnifiedItem = z.infer<typeof schemas.LineItemSchema> & {
   id?: string;
   externalId?: string;
   _raw?: any;
};

// Generic type alias if needed
export type UnifiedDocument = UnifiedInvoice;
