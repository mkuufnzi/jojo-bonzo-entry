# Smart Document Services

The backend engine of our transactional branding features.

## LinkService (`link.service.ts`)
Generates and verifies secure, tamper-proof interaction links using Node.js `crypto`. 
- **HMAC-SHA256**: Signs a payload containing `docId` and `action`.
- **Shortened Keys**: Uses `d` (documentId), `a` (action), and `s` (sku) for compact URLs.

## TemplateGeneratorService (`template-generator.service.ts`)
The unified HTML compiler for all business documents.
- **Dual Mode**: Supports AI-only generation (via n8n) and Local EJS rendering.
- **Context Injection**: Automatically fetches business branding and enriches documents with "Smart Content" (Upsells/Support).
- **Portal Compatibility**: Injects the `portal_url` and `interactive_link` into every document footer.

## WorkflowService (`workflow.service.ts`)
Orchestrates the end-to-end delivery pipeline.
- **Discovery**: Intercepts ERP webhooks and initiates document "re-branding".
- **Tracking**: Pre-generates `trackedDocId` and creates a `ProcessedDocument` record for every transaction.
- **Dispatch**: Sends the final document payload (including links and HTML) to n8n for email dispatch.
