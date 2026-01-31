# Floovioo Design Engine: Technical Specification

The **Design Engine** is the specialized rendering core of the Floovioo platform. It is responsible for the transition from raw data to high-fidelity, branded visual assets.

## Core Responsibilities

1.  **Context Resolution**: Identifying the active App, Service, and User context for every request to ensure proper branding and billing attribution.
2.  **Workflow Delegation**: Orchestrating complex logic via **n8n** webhooks for AI-driven design decisions and layout optimizations.
3.  **Asset Generation**: Producing final artifacts (HTML, PDF, Images) using standardized templates and tenant-specific design tokens.

## Functional Actions

### 1. `compose`
- **Input**: Raw Data (e.g., Invoice JSON) + Service Context.
- **Process**: Fetches the tenant's `BrandingProfile`, applies layout rules, and generates an Intermediate Representation (IR).
- **Output**: Layout JSON or enriched context for rendering.

### 2. `generate` (Transactional Priority)
- **Input**: Normalized ERP Data (Invoices, Receipts).
- **Process**: Full pipeline execution (Normalize -> Brand -> Annotate -> Render).
- **Output**: Base64 PDF or Hosted Link.

### 3. `extract_styles`
- **Input**: URL or Image/PDF.
- **Process**: AI-powered analysis of visual inputs to identify primary colors, typography, and voice patterns.
- **Output**: `BrandingProfile` payload ready for tenant approval.

## Interface: `ServiceManifest`

The Design Engine exposes itself via a `ServiceManifest`, allowing other services (like the `TransactionalController`) to discover its capabilities dynamically through the `ServiceRegistry`.

```typescript
const deManifest = designEngineService.getManifest();
// Includes actions: [compose, generate, render, extract_styles, ping]
```

## Security & Billing

- **Scoping**: Only Apps with the `advanced_branding` scope can invoke `generate` and `render` actions.
- **Traceability**: All calls must include a valid `requestId` for idempotency and a `floovioo_id` for user-level billing aggregation.
- **Sanitization**: All configurations passed to the frontend are sanitized to remove sensitive internal webhook URLs.
