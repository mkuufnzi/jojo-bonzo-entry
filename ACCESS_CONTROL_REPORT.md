# Service access & Configuration Rules

## 1. Access Control Logic
The `requireServiceAccess` middleware acts as the central policy decision point. The evaluation flow is:

1.  **Authentication:**
    *   User must be logged in (Session) OR provide a valid API Key (`X-API-Key`).
    *   **Identities:** Request is bound to a `User` and optionally a `CurrentApp`.

2.  **Service Resolution:**
    *   Service is looked up by slug (e.g., `ai-doc-generator`).
    *   **Implemented Check:** If not in the "implemented" list, GET requests redirect to a "Coming Soon" page.

3.  **User Levels:**
    *   **Guest:** Denied access to "Restricted" services (AI, PDF conversion).
    *   **User:** Must have an `active` or `canceling` subscription status. Past due/unpaid blocks access.

4.  **App Context (The "Linkage" Rule):**
    *   For restricted services, an **App Context** is mandatory.
    *   The App must have the service **enabled** in the `AppService` join table.
    *   *Why?* This allows users to create different API keys with different permission scopes (e.g., an API Key just for PDF conversion, another for AI).
    *   If accessed via Web UI, the frontend implicitly uses the "Default App" or prompts to select one.

5.  **Quota & Features:**
    *   **Quota:** `QuotaService` checks user's monthly usage against Plan limits.
    *   **Feature Flags:** Services link to a `requiredFeatureKey`. If the User's Plan doesn't have this Feature enabled, access is denied (Upgrade Required).

## 2. Configuration Strategy
Configuration is a hybrid of Database (Dynamic) and Code (Static).

*   **Database (Prisma `Service` Model):**
    *   Stores `slug`, `name`, `pricePerRequest`, `isActive`, `requiredFeatureKey`.
    *   Stores `config` JSON: Webhook URLs, custom headers, and override settings.
    *   *Purpose:* Allows admins to toggle services, change prices, or update webhook targets without redeploying.

*   **Code (Service Registry & Manifests):**
    *   `ServiceRegistry` loads DB config at startup.
    *   Merges it with **Code Manifests** (from `ai.service.ts`, etc.).
    *   *Purpose:* Hard-coded endpoints and implementation details live here. You cannot "delete" a code endpoint via DB, preventing breakage.

## 3. Plan-App-Feature Relationship
This is the hierarchy of entitlement:

*   **Plan:** "Pro Plan" (Costs $20/mo).
    *   *Has Features:* `[ai_generation, pdf_conversion, api_access]`
*   **User:** Subscribes to "Pro Plan".
    *   *Inherits Features:* Can use AI and PDFs.
    *   *Has Quota:* 500 AI requests/mo.
*   **App:** "My Website Integration" (Owned by User).
    *   *Enables Services:* `[ai-doc-generator]` (User *could* enable `html-to-pdf` too, but chose not to).
*   **Validation:**
    *   User calls API with App Key.
    *   System Checks:
        1.  Does User have Plan? Yes.
        2.  Does Plan have `ai_generation` feature? Yes.
        3.  Does App have `ai-doc-generator` service enabled? Yes.
        4.  Is User under Quota? Yes.
    *   -> **Access Granted.**

## Recommendations for Refactoring
*   **Decouple Restricted Logic:** The list of "restricted" slugs (`ai`, `pdf`) is currently hardcoded in middleware. Move this to a database boolean flag `isRestricted` on the Service model.
*   **Refine App Context:** The requirement for "App Context" on web requests can be confusing. Ensure the "Default App" is robustly auto-selected for dashboard users.
