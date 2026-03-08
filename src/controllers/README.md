# Smart Document Controllers

These controllers manage the secure public interaction layer of the Smart Document pipeline.

## PublicInteractionController

Located at `public-interaction.controller.ts`, this is the entry point for all external document clicks.

- **Route**: `GET /i/:token`
- **Functionality**:
  - Verifies the HMAC-signed token using `LinkService`.
  - Logs the interaction for conversion tracking (Revenue Lift).
  - Handles specific actions like `add_to_order`, `support`, or generic `view`.
  - Redirects the user to the appropriate secure portal route.

## PublicPortalController

Located at `public-portal.controller.ts`, this controller manages the high-end Interactive Portal experience.

- **Routes**:
  - `GET /p/:token/view`: Renders the full interactive document with real-time features.
  - `GET /p/:token/support`: Displays the Support Hub with n8n Chat and Email options.
  - `GET /p/:token/status`: Shows success feedback after order updates or interaction.
- **Unified Resolution**:
  - Resolves documents from both `SmartDocument` (on-demand generated) and `ProcessedDocument` (webhook-driven) tables.
  - Uses `PublicPortalController.resolveDocumentContext` to securely verify tokens and fetch business branding.
  - Injects `generateActionLink` helper for seamless cross-portal navigation.
