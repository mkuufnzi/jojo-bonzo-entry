# Floovioo Directory Structure

This document maps the project's folder structure to its role in the Floovioo Enterprise architecture.

## Primary Folders (`src/`)

-   **`src/controllers/`**: Handles incoming HTTP requests, performs basic validation, and orchestrates services.
    -   `transactional.controller.ts`: Primary entry for Transactional Branding.
    -   `business-analytics.controller.ts`: Handles metrics and reporting.
-   **`src/services/`**: Contains core domain logic and third-party integrations.
    -   `design-engine.service.ts`: The central branding and rendering core.
    -   `integration.service.ts`: Manages OAuth connections (Zoho, Xero, QB).
    -   `n8n/`: Contains the `N8nPayloadFactory` for normalized data sync.
-   **`src/domain-events/`**: Defines the standardized event types used across Floovioo and sent to n8n.
-   **`src/middleware/`**: Shared guards for auth, quotas, logging, and billing.
-   **`src/workers/`**: BullMQ workers for background tasks.
    -   `analytics.processor.ts`: Aggregates usage data into reports.
    -   `sync.processor.ts`: Handles long-running ERP data synchronization.
-   **`src/views/`**: EJS templates for the dashboard and service hubs.
    -   `dashboard/`: Core navigational and overview pages.
    -   `services/`: Specialized hubs for each Floovioo Pillar.

## Support & Tooling

-   **`prisma/`**: Database schema and migration history.
-   **`n8n/`**: (Informational) Local reference for n8n workflows and JSON descriptors.
-   **`scripts/`**: DevOps and maintenance scripts (Seeders, Fixes, Tests).
-   **`docs/floovioo/`**: The definitive documentation for the new architecture.

## Legacy & Deprecated (Subject to Cleanup)
-   `src/services/ai-doc-generator/`: Replaced by the unified Design Engine.
-   `src/views/services/ai-doc-generator.ejs`: Replaced by Transactional flows.
