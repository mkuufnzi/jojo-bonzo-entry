# Floovioo Technical Specification & Maintainer's Guide
> **Version**: 2.1 (Draft Implementation)
> **Date**: Feb 2026
> **Architecture**: Modular Monolith (Transitioning to SOA)
> **Core Vision**: The "Branded House" Enterprise Platform

---

## 1. Executive Summary: The "Branded House"
Floovioo is not a single tool; it is an **Enterprise Platform** hosting a suite of four specialized products (Pillars). All products rely on a shared "Transactional Engine" and "Design Engine" to deliver branded experiences.

### The 4 Product Pillars
1.  **Floovioo Transactional (Flagship)**: Automates financial documents (Invoices, Quotes). Transforms them from static PDFs into "Revenue Generating Assets" via AI upsells.
2.  **Floovioo Sales (Planned)**: AI-driven proposal generation and interactive deal rooms.
3.  **Floovioo Content (Planned)**: Marketing asset automation (Social, Ad Creatives) based on brand voice.
4.  **Floovioo Retention (Planned)**: Automated dunning (collections) and support document generation with "Empathic AI".

---

## 2. System Architecture

### 2.1 The "Level 1" Platform (Shared Core)
The foundation upon which all pillars are built. Uses a **"Filter-Dispatch-Sync"** pattern to delegate complex logic to external orchestrators (n8n).
*   **Identity**: `User`, `Business` (Tenancy), `Permissions`.
*   **Connectivity**: `Integration` (OAuth with QuickBooks, Xero, Zoho).
*   **Billing**: Stripe Subscriptions for the Floovioo service itself.
*   **Orchestration**: `WorkflowService` + `n8n` (The Brain).

### 2.2 The "Level 2" Engines (V2 Spec)
Specialized logic blocks that power the specific products.
*   **Brand Engine**: Renders HTML/CSS templates into PDFs (`PdfService`).
*   **Revenue Engine**: Analyzes Invoice Lines -> Matches Rules -> Injects `Offer` into Metadata (Schema exists, Logic impending).
*   **Recovery Engine**: Dunning logic. Listens for `invoice.overdue` -> Schedules Email Sequence (Schema exists).
*   **Intelligence Engine**: Analytics accumulator (`AnalyticsEvent`, `BusinessMetric`).

### 2.3 Data Flow: The Transactional Loop
1.  **Trigger**: ERP (e.g., QuickBooks) sends `invoice.created` webhook.
2.  **Ingest (`WebhookController`)**: Valiates signature → Pushes to `WorkflowService`.
3.  **Filter (`WorkflowService`)**:
    *   Checks Quota (`QuotaService`).
    *   Checks Subscription Status.
    *   Loads `Business` context.
4.  **Dispatch (`n8n`)**:
    *   Payload constructed via `N8nPayloadFactory`.
    *   Sent to n8n Webhook for processing (e.g., "Generate Brand PDF").
5.  **Sync (`ProcessedDocument`)**:
    *   n8n calls back with `{ pdfUrl, status: 'success' }`.
    *   System updates `ProcessedDocument` record.
    *   Dashboard updates real-time stats.

---

## 3. Technology Stack (Lowest Level)

### 3.1 Backend Core
*   **Runtime**: Node.js (v18+)
*   **Framework**: Express.js
*   **Language**: TypeScript (Strict Mode)
*   **Process Manager**: PM2 (Production), Nodemailer (Dev)
*   **Entry Point**: `src/index.ts` -> `src/app.ts` (BootManager)

### 3.2 Database Layer
*   **Primary DB**: PostgreSQL (Production).
*   **ORM**: Prisma (Schema: `prisma/schema.prisma`).
*   **Key Models**:
    *   `Business`: The tenant root.
    *   `Integration`: Stores OAuth tokens (`access_token`, `refresh_token`).
    *   `Workflow`: Defines trigger/action pairs (`triggerType: 'webhook'`, `actionConfig: { type: 'apply_branding' }`).
    *   `ProcessedDocument`: The audit trail of every generation.
    *   `RevenueRule`, `Campaign`, `Offer`: Revenue Engine configurations.

### 3.3 Infrastructure & Workers
*   **Queue**: BullMQ (`src/workers/index.ts`) backed by Redis.
*   **Cache**: Redis (Sessions, API Rate Limits, Computed Stats).
*   **PDF Engine**: Puppeteer (Headless Chrome) managed via `PdfService`.

### 3.4 Frontend
*   **Templating**: EJS (Server-Side Rendering).
*   **Styling**: TailwindCSS (Utility-first).
*   **Auth**: Session-based (`express-session` with Redis Store).

---

## 4. API Specification & Route Inventory

### 4.1 Integration & Connectivity (`/dashboard/connections`)
*   `GET /` -> List available integrations.
*   `GET /:provider/auth` -> Start OAuth flow (QuickBooks, Zoho).
*   `GET /:provider/callback` -> Handle OAuth code exchange.

### 4.2 Workflows (`/dashboard/workflows`)
*   `GET /` -> `WorkflowsController.index`: List active automations.
*   `GET /:id` -> `WorkflowsController.show`: Detail view + Execution History.
*   `POST /:id/toggle` -> Pause/Resume workflow.
*   `POST /:id/test` -> Manual Trigger (Dry Run).

### 4.3 Webhooks (`/api/v1/webhooks`)
*   `POST /:provider/:businessId` -> `WebhookController.handle`: Ingest ERP events.
    *   **Logic**: Verifies signature -> Looks up `Integration` -> Delegates to `WorkflowService`.

### 4.4 Internal API (`/api/*`)
*   `POST /pdf/convert` -> `PdfController`: Raw HTML-to-PDF.
*   `GET /jobs/:id` -> Poll status of async operations.
*   `POST /ai/generate` -> AI text generation (used by Revenue Engine/Dunning).

---

## 5. E2E User Journeys

### Journey 1: The "Zero-Touch" Setup
1.  **User** signs up -> Onboarding Wizard (`/onboarding`).
2.  **User** connects QuickBooks (`/dashboard/connections/quickbooks/auth`).
3.  **System** receives OAuth Token -> Creates `Integration` record.
4.  **System** (`WorkflowService.ensureDefaultWorkflow`) automatically creates:
    *   "Auto-Brand Invoice" Workflow.
    *   "Auto-Brand Quote" Workflow.
5.  **User** is done. No drag-and-drop required.

### Journey 2: The "Revenue Machine" (V2 Logic)
1.  **ERP** creates Invoice with `LineItem: "MacBook Pro"`.
2.  **Floovioo** receives webhook.
3.  **Revenue Engine** sees Rule: `Trigger: "Laptop"` -> `Target: "Laptop Bag"`.
4.  **System** injects Metadata into PDF context: `upsell: { title: "Need a bag?", discount: "BAG10" }`.
5.  **Brand Engine** renders PDF with a beautiful "Recommended for you" section.
6.  **End Customer** clicks link on PDF -> Buys Bag.

---

## 6. Implementation Status (Gap Analysis)

| Feature Pillar | Status | Code Location |
| :--- | :--- | :--- |
| **Identity & Auth** | Done | `src/services/auth.service.ts` |
| **Integration Layer** | Done | `src/services/integrations/providers/` |
| **Workflow Engine** | Done | `src/services/workflow.service.ts` |
| **Brand Engine (PDF)** | Done | `src/services/pdf.service.ts` |
| **Revenue Engine** | **Schema Only** | `prisma/schema.prisma` (Lines 551+) |
| **Recovery Engine** | **Schema Only** | `prisma/schema.prisma` (Lines 585+) |
| **Dashboard UI** | Partial | `src/views/dashboard/` |

---

## 7. Maintenance & Developer Guide

### 7.1 Key Directories
*   `src/services/workflow.service.ts`: **The Core**. Read this to understand how events are routed.
*   `src/lib/n8n/`: Contains `n8n-payload.factory.ts`. Crucial for formatting data sent to n8n.
*   `src/routes/`: Route definitions. Grouped by Feature (e.g. `billing`, `workflows`).

### 7.2 Database Management
*   **Schema**: `prisma/schema.prisma`.
*   **Migrations**: Always run `npx prisma migrate dev` after schema changes.
*   **Seeding**: `prisma/seed.ts` loads default Plans and Features.

### 7.3 Environmental Variables (`.env`)
*   `DATABASE_URL`: Postgres Connection.
*   `REDIS_URL`: BullMQ/Session connection.
*   `N8N_WEBHOOK_URL_BASE`: Base URL for the n8n instance.
*   `ENCRYPTION_KEY`: For securing OAuth tokens.

### 7.4 Common Debugging
*   **"Workflow not triggering"**:
    1.  Check `WorkflowExecutionLog` in DB.
    2.  Check `Integration` status (is token expired?).
    3.  Verify `N8N_WEBHOOK_URL_BASE` is reachable.
*   **"PDF is blank"**:
    1.  Check `PdfService` logs.
    2.  Ensure `APP_URL` is accessible by Puppeteer (Docker networking issue).

---

## 8. Conclusion
This codebase is a **hybrid**: a robust, production-ready Platform Core ("Level 1") hosting the schema and early implementation of the advanced "V2 Engines". The immediate roadmap involves fleshing out the logic for the Revenue and Recovery engines to fully realize the "Branded House" vision.
