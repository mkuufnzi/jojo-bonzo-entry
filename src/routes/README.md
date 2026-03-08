# Smart Document Webhooks

This directory defines the inbound connection points for Floovioo's **Discovery Pipeline**.

## Webhook Architecture

The `webhook.routes.ts` file manages different types of inbound events that trigger the Smart Document cycle.

### ERP Webhooks (`/erp/:provider/:userId`)
- **Purpose**: Captures new invoices, orders, or quotes directly from the user's ERP (Zoho, QuickBooks, etc.).
- **Smart Trigger**: Upon receiving a valid ERP payload, the system automatically:
  1. Resolves the `userId` and `businessId`.
  2. Normalizes the data using the `SmartInvoice` model.
  3. Triggers the `WorkflowService` to re-brand the document and generate interactive links.
  4. Dispatches the "Smart Version" via the configured communication channel (mostly via n8n).

### Stripe Webhooks (`/stripe`)
- **Purpose**: Handles payment-related events for one-click checkout and automated dunning.
- **Workflow**: 
  - `invoice.payment_succeeded`: Triggers a thank-you note and loyalty points update.
  - `invoice.payment_failed`: Triggers the high-conversion Dunning Portal link.

### Provider-Specific Routes
- Specialized handlers for `zoho/invoice` and `quickbooks/notification` ensure that provider-specific authentication and signature verification are handled before passing the normalized payload to the `WorkflowService`.
