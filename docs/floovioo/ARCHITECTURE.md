# Floovioo Architecture: The Brand House Model

Floovioo is a **modular monolith** designed to serve as an enterprise-grade SaaS for automated branding and document intelligence. The platform follows a "Brand House" architecture where a single core engine powers multiple specialized branded products.

## The 4 Pillars of Floovioo

1.  **Transactional**: Automates the branding and delivery of ERP documents (invoices, receipts, orders). "Intercept ugly ERP outputs, return high-end branded documents."
2.  **Sales**: (Future) AI-powered proposal generation and sales automation.
3.  **Content**: (Future) Branded marketing asset generation and social automation.
4.  **Retention**: (Future) Dunning sequences, feedback loops, and automated customer support.

## Core Architectural Components

### 1. App Encapsulation & Service Context
All usage in Floovioo is attributed to an **App**. 
- **API Key & App ID**: Every tenant is assigned a Default App.
- **Service Scopes**: Apps must have explicit permission (scopes) to use services.
- **Traceability**: All requests carry a `floovioo_id` (User), `service_id`, and `app_id`.

### 2. Design Engine (The Core Rendering Engine)
The Design Engine is a centralized service that handles:
- **Layout Composition**: Transforming raw data into structured visual layouts.
- **Brand Parsing**: Extracting and applying style tokens from a tenant's Brand Identity.
- **Rendering**: Transmuting layouts into terminal artifacts (HTML/PDF).

### 3. n8n Workflow Orchestration
Floovioo uses **n8n** as its heavy-lifting automation and AI engine.
- **SyncWorker**: Periodically syncs data from external ERPs (Xero, Zoho, QB) to n8n.
- **Onboarding Stream**: Multi-step sync of business profiles, branding, and connectivity verification.
- **Design Engine Coordination**: Real-time calls to n8n for complex layout optimization and AI-driven branding.

## Data Flow: Transactional Branding

1.  **ERP Trigger**: A webhook or poll detects a new document (e.g., QB Invoice).
2.  **Normalization**: Floovioo normalizes the raw ERP data into a standard JSON schema via `N8nPayloadFactory`.
3.  **Branding Layer**: Floovioo injects the tenant's `BrandingProfile` (Logo, Colors, Fonts, Voice).
4.  **n8n Processing**: The payload is sent to n8n for final "Canvas-like" document generation.
5.  **Delivery**: The branded PDF is emailed to the customer or returned to the client.

## Billing & Quota Management
Centralized middleware intercepts all controller calls to:
- Log usage metrics to `UsageLog`.
- Decrement Redis quotas.
- Assert billing eligibility (Active Subscription + Managed Quotas).
