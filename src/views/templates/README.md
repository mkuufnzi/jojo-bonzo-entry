# Smart Document Templates

This directory houses the EJS templates for all business documents, designed to be both "print-perfect" (PDF) and "portal-ready" (Web).

## Smart Invoice v1 (`invoice/smart-invoice-v1/`)
Our flagship premium document template.

### Features
- **Widget Registry Pattern**: A deterministic layout engine that renders components in the exact `layoutOrder` specified by the Branding Profile.
- **Dynamic Layout Switch**: Uses `<% layout(branding.layout || 'layouts/document-master') %>` to automatically switch between PDF (Pagination) and Portal (Standard) layouts.
- **Interactive Anchors**: Includes a footer CTA with the document's unique `interactive_link` to bridge the gap from email to portal.
- **CSS Variable Bridge**: Avoids IDE linting errors by providing dynamic theme colors via CSS variables on the root container, rather than using EJS tags inside the `<style>` block.

### Components
- **Line Items**: Smart tables with interactive product highlights.
- **Smart Widgets**: `banner`, `recommendations`, `tutorials`, and `support-card` are seamlessly integrated via the registry.
- **Paginator Hooks**: Includes meta-data for `paginator-v1.js` to handle multi-page PDF generation accurately.
