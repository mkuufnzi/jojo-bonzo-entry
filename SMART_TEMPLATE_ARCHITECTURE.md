# Smart Template Architecture

This document details the technical architecture of the **Floovioo Smart Template System**, including the registry pattern, manifest schema, and the "Smart Engine" rendering pipeline.

## 1. High-Level Overview

The system is designed to decouple **Brand Identity** (colors, fonts, logos) from **Document Structure** (Invoices, Quotes). It uses a "Hybrid Rendering" approach:

1.  **Server-Side (EJS)**: Handles feature toggles (`enabled: true/false`), access control, and initial layout injection.
2.  **Client-Side (Alpine.js)**: Handles reactivity, theme injection (`:style`), and dynamic data binding (`x-text`).
3.  **Post-Process (Paginator)**: Splits the rendered DOM into A4 print pages.

```mermaid
graph TD
    A[Registry Service] -->|Scans| B[Templates Directory]
    B -->|Loads| C[manifest.json]
    D[Brand Editor] -->|Reads| C
    D -->|Configures| E[User Profile]
    E -->|Injects| F[Controller]
    F -->|Renders| G[index.ejs]
    G -->|Hydrates| H[Smart Engine (Alpine)]
    H -->|Splits| I[Paginator (DOM)]
```

## 2. Directory Structure

Templates are organized by **Type** -> **Variant**.

```text
src/views/templates/
├── invoice/
│   ├── classic/
│   │   ├── manifest.json       # Configuration
│   │   └── index.ejs           # Entry Point
│   └── smart-invoice-v1/       # "Smart" Template
│       ├── manifest.json
│       ├── index.ejs
│       └── components/         # Local partials
│           ├── header.ejs
│           └── footer.ejs
└── components/
    └── smart-widgets/          # Shared Global Widgets
        ├── banner.ejs
        └── tutorials.ejs
```

## 3. The Manifest Protocol (`manifest.json`)

Every template **MUST** have a `manifest.json`. This source validity drives the **Brand Editor UI**.

### Schema Reference
```typescript
interface SmartTemplateManifest {
  id: string;          // Unique ID (e.g., "smart_invoice_v1")
  name: string;        // Display Name
  type: string;        // INVOICE, QUOTE, RECEIPT
  version: string;     // SemVer
  description: string;
  features: Feature[]; // UI Toggle Configurations
}

interface Feature {
  id: string;              // Key used in EJS (branding.components[id])
  name: string;            // Label in Editor
  type: 'toggle' | 'input';
  defaultEnabled: boolean;
  required?: boolean;      // If true, cannot be disabled
  badge?: string;          // UI Tag (e.g., "Retention", "Marketing")
  description?: string;    // Tooltip help text
}
```

### Example Manifest
```json
{
    "id": "smart_invoice_v1",
    "name": "Smart Invoice",
    "type": "INVOICE",
    "features": [
        {
            "id": "product_recommendations",
            "name": "Product Recommendations",
            "type": "toggle",
            "defaultEnabled": true,
            "badge": "Conversion"
        }
    ]
}
```

## 4. Render Pipeline (`index.ejs`)

The EJS template is the bridge between the Server Config and the Client Engine.

### 4.1. Configuration Block
Hidden div used by the Paginator to read page specs.
```html
<div id="doc-config" 
    data-page-size="A4" 
    data-margin-top="50" 
    class="hidden"></div>
```

### 4.2. Feature Switch Logic
Server-side EJS controls **existence** of nodes (keeping DOM light).
```ejs
<% if (branding.components?.product_recommendations?.enabled) { %>
    <div class="doc-section mb-8" data-split="true">
        <%- include('../../../components/smart-widgets/product-recommendations') %>
    </div>
<% } %>
```

### 4.3. Data Binding (Alpine)
Client-side Alpine controls **appearance** and **text**.
```html
<!-- Theme Injection -->
<div :style="'background: ' + theme.primary">...</div>

<!-- Data Injection -->
<span x-text="document.total"></span>
```

## 5. The "Smart Engine" Stack

### 5.1. `smart-document-logic.ejs`
Contains the base Alpine data object (`x-data`). It merges:
1.  `theme`: From `branding.themeData` (Server).
2.  `document`: From `branding.model` (Server).
3.  `state`: Local UI state.

### 5.2. `paginator-v1.js` (Enterprise Paginator)
Responsibilities:
1.  **Wait**: Listens for `smart-engine:ready` event (500ms delay).
2.  **Measure**: clones the DOM into an invisible container.
3.  **Split**: Moves nodes to new Pages (divs) when they exceed 1123px (A4).
4.  **Sanitize**: Recursively strips `x-` attributes from clones to prevent Alpine errors on static pages.

## 6. Template Registry Service
Located at `src/services/template-registry.service.ts`.
*   **Startup**: Recursively scans `src/views/templates`.
*   **Load**: Parses `manifest.json` and calculates relative `viewPath`.
*   **Serve**: Provides manifests to the Controller for the "Template Gallery" and "Editor" views.
