# Smart Document Models

This directory contains the core data models for Floovioo's **Smart Document Delivery Pipeline**.

## SmartInvoice Model

`SmartInvoice` is the primary model for representing transaction documents (Invoices, Receipts, Quotes) in a normalized, actionable format.

### Key Features
- **Centralized Normalization**: The `SmartInvoice.fromPayload()` static method handles the transformation of raw ERP or webhook payloads into a structured model.
- **Dynamic Theming**: Integrates Branding Profile data (colors, logos, patterns) into the document context.
- **Smart Enrichment**: Injects `recommendations`, `tutorials`, and `nurture` messages based on the document content.
- **Interactive Links**: Supports `portal_url` and `interactive_link` for transitioning from static emails/PDFs to the Interactive Portal.

### Usage Example
```typescript
const smartInvoice = SmartInvoice.fromPayload(
    docId,
    branding.themeData,
    branding.config,
    rawPayload
);

const data = smartInvoice.toJSON(); // Ready for EJS rendering
```

### Data Structure
- `data.items`: The normalized list of line items from the source transaction.
- `data.recommendations`: Up to 3 AI-suggested products from the business inventory.
- `data.tutorials`: Context-aware guides related to the products in the document.
- `data.nurture`: Sequential messaging for customer retention.
