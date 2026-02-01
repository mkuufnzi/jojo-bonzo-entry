import { z } from 'zod';

/**
 * ----------------------------------------------------------------------------
 * PRIMITIVES & VALUE OBJECTS
 * ----------------------------------------------------------------------------
 */

export const UUID = z.string().uuid().describe('Universal Unique Identifier');
export const ISODate = z.string().datetime().describe('ISO 8601 Date String');
export const Email = z.string().email().describe('Valid Email Address');
export const CurrencyCode = z.string().length(3).regex(/^[A-Z]{3}$/).describe('ISO 4217 Currency Code (e.g., USD)');
export const CountryCode = z.string().length(2).regex(/^[A-Z]{2}$/).describe('ISO 3166-1 alpha-2 Country Code');
export const Amount = z.number().describe('Monetary Amount');
export const Percentage = z.number().min(0).max(100).describe('Percentage Value (0-100)');

export const AddressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().optional(),
  postalCode: z.string().min(1),
  country: CountryCode,
}).describe('Physical or Mailing Address');

export const ContactSchema = z.object({
  id: UUID.optional(),
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  email: Email.optional(),
  phone: z.string().optional(),
  role: z.string().optional(),
}).describe('Person Contact Details');

export const MoneySchema = z.object({
  amount: Amount,
  currency: CurrencyCode,
}).describe('Money Value Object');

/**
 * ----------------------------------------------------------------------------
 * ENTITIES: CUSTOMER & VENDOR
 * ----------------------------------------------------------------------------
 */

export const TaxIdSchema = z.object({
  type: z.enum(['VAT', 'EIN', 'SSN', 'ABN', 'GST', 'UNKNOWN']),
  value: z.string().min(1),
  country: CountryCode,
}).describe('Tax Logic Identification');

export const CustomerMetadataSchema = z.record(z.string(), z.unknown()).describe('Flexible Metadata for Customer');

export const CustomerSchema = z.object({
  id: UUID.optional(),
  externalId: z.string().describe('ID in External ERP/CRM'),
  name: z.string().min(1),
  email: Email.optional(),
  billingAddress: AddressSchema.optional(),
  shippingAddress: AddressSchema.optional(),
  taxId: TaxIdSchema.optional(),
  contacts: z.array(ContactSchema).optional(),
  metadata: CustomerMetadataSchema.optional(),
}).describe('Customer Entity');

export const VendorSchema = CustomerSchema.extend({
  paymentTerms: z.string().optional(),
}).describe('Vendor Entity');

/**
 * ----------------------------------------------------------------------------
 * DOCUMENT COMPONENTS: ITEMS, TAX, DISCOUNTS
 * ----------------------------------------------------------------------------
 */

export const TaxDetailSchema = z.object({
  name: z.string(),
  rate: Percentage,
  amount: Amount,
  taxId: z.string().optional(),
}).describe('Tax Breakdown per Item or Global');

export const DiscountSchema = z.object({
  type: z.enum(['percentage', 'fixed']),
  value: z.number().min(0),
  description: z.string().optional(),
  code: z.string().optional(), // Coupon Code
}).describe('Discount Applied');

export const LineItemSchema = z.object({
  id: z.string().optional(),
  sku: z.string().optional(),
  description: z.string(),
  quantity: z.number().min(0),
  unitPrice: Amount,
  amount: Amount,
  tax: TaxDetailSchema.optional(),
  discount: DiscountSchema.optional(),
  category: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).describe('Invoice Single Line Item');

export const ShippingDetailsSchema = z.object({
  address: AddressSchema,
  method: z.string().optional(),
  cost: Amount.optional(),
  trackingNumber: z.string().optional(),
  carrier: z.string().optional(),
}).describe('Shipping Information');

/**
 * ----------------------------------------------------------------------------
 * DOCUMENTS: INVOICE, QUOTE, CREDIT NOTE
 * ----------------------------------------------------------------------------
 */

export const DocumentStatusSchema = z.enum([
  'draft', 'sent', 'viewed', 'paid', 'partial', 'overdue', 'voided', 'disputed', 'unknown'
]);

export const BaseDocumentSchema = z.object({
  id: UUID.optional(),
  externalId: z.string(),
  number: z.string(),
  date: ISODate,
  currency: CurrencyCode,
  total: Amount,
  subtotal: Amount.optional(),
  taxTotal: Amount.optional(),
  status: DocumentStatusSchema,
  notes: z.string().optional(),
  terms: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const UnifiedInvoiceSchema = BaseDocumentSchema.extend({
  type: z.literal('invoice').default('invoice'),
  dueDate: ISODate.optional(),
  customer: CustomerSchema,
  items: z.array(LineItemSchema),
  shipping: ShippingDetailsSchema.optional(),
  amountDue: Amount.optional(),
  amountPaid: Amount.optional(),
  normalizedAt: z.date().or(z.string()).optional(),
}).describe('Unified Invoice Model');

export const UnifiedQuoteSchema = BaseDocumentSchema.extend({
  type: z.literal('quote'),
  validUntil: ISODate.optional(),
  customer: CustomerSchema,
  items: z.array(LineItemSchema),
}).describe('Unified Quote Model');

export const UnifiedCreditNoteSchema = BaseDocumentSchema.extend({
  type: z.literal('credit_note'),
  referenceInvoiceId: z.string().optional(),
  customer: CustomerSchema,
  items: z.array(LineItemSchema),
}).describe('Unified Credit Note');

/**
 * ----------------------------------------------------------------------------
 * DELIVERY & WORKFLOW
 * ----------------------------------------------------------------------------
 */

export const DeliveryChannelSchema = z.enum(['email', 'webhook', 'sms', 'whatsapp', 'slack', 'print', 's3']);
export const DeliveryStatusSchema = z.enum(['queued', 'sending', 'delivered', 'failed', 'bounced', 'opened', 'clicked']);

export const EmailConfigSchema = z.object({
  to: z.array(Email),
  cc: z.array(Email).optional(),
  bcc: z.array(Email).optional(),
  subject: z.string().optional(),
  replyTo: Email.optional(),
});

export const WebhookConfigSchema = z.object({
  url: z.string().url(),
  method: z.enum(['POST', 'PUT', 'GET']).default('POST'),
  headers: z.record(z.string()).optional(),
  secret: z.string().optional(),
});

export const DeliveryConfigSchema = z.union([
  z.object({ channel: z.literal('email'), config: EmailConfigSchema }),
  z.object({ channel: z.literal('webhook'), config: WebhookConfigSchema }),
  // Add other unions as implemented
]);

export const WorkflowActionSchema = z.object({
  id: z.string(),
  type: z.string(), // e.g., 'pdf.generate', 'email.send'
  config: z.record(z.string(), z.unknown()),
  nextValues: z.array(z.string()).optional(), // Edges
});

/**
 * ----------------------------------------------------------------------------
 * API REQUESTS & RESPONSES
 * ----------------------------------------------------------------------------
 */

export const PaginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export const FilterSchema = z.object({
  dateRange: z.object({ start: ISODate.optional(), end: ISODate.optional() }).optional(),
  status: z.array(DocumentStatusSchema).optional(),
  customerName: z.string().optional(),
  minAmount: Amount.optional(),
  maxAmount: Amount.optional(),
});

// V2 Specific Requests

export const PreviewRequestSchema = z.object({
  invoiceId: z.string().min(1),
  templateId: z.string().optional(),
  options: z.record(z.string(), z.unknown()).optional(), // Rendering options
});

export const SendRequestSchema = z.object({
  invoiceId: z.string().min(1),
  channel: DeliveryChannelSchema,
  workflowId: UUID.optional(),
  overrideConfig: z.record(z.string(), z.unknown()).optional(),
});

export const DeliveryRequestSchema = z.object({
  payload: z.record(z.string(), z.unknown()),
  userId: UUID,
  eventType: z.string().optional(), // 'invoice.send', 'order.created'
  workflowId: UUID.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * ----------------------------------------------------------------------------
 * SYSTEM & AUDIT
 * ----------------------------------------------------------------------------
 */

export const AuditLogSchema = z.object({
  id: UUID,
  userId: UUID,
  action: z.string(),
  resource: z.string(),
  resourceId: z.string().optional(),
  timestamp: ISODate,
  meta: z.record(z.string(), z.unknown()).optional(),
  ipAddress: z.string().ip().optional(),
});

export const HealthStatusSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  timestamp: ISODate,
  services: z.record(z.string(), z.enum(['up', 'down'])),
  version: z.string(),
});
