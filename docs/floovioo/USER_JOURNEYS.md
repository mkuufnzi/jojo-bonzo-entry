
# Floovioo User Journeys

## Journey 1: The "Transactional" Onboarding & Setup
*Goal: New Tenant -> Fully Configured Brand Engine -> Connected Data*

### 1. The "Wizard" (`/onboarding/wizard`)
A 4-step guided process to configure the Tenant.
*   **Step 1: Profile**: Collects Business Name, Sector, Niche, Slogan.
    *   *System Action*: Creates `Business` record.
*   **Step 2: Connect Data**: User connects ERP (Zoho, QBO, Xero) via OAuth.
    *   *System Action*: Stores Credentials in `Integration`.
    *   *System Action*: Offers "Import Preview" via `/dashboard/connections/:slug/preview`.
*   **Step 3: Brand Identity**: User defines Colors (Primary/Secondary) and Voice Tone (Friendly, Professional).
    *   *System Action*: Saves to `Brand_Identity`.
*   **Step 4: Finish**: User selects Document support (Invoice, Quote).
    *   *System Action*: Triggers "Design Engine Generation" (seeds initial templates).

### 2. The Data Sync (`SyncWorker`)
*Goal: Keep Floovioo's Cache fresh.*
1.  **Trigger**: Webhook from ERP (e.g. `Invoice Created`) OR Manual "Import" button.
2.  **Worker**: `SyncWorker.syncBusiness(businessId)`
3.  **Extraction**: Pulls raw data from `Provider` (ZohoProvider, etc).
4.  **Normalization**: Standardizes fields (Amount, Date, Status).
5.  **Storage**: Upserts to `ExternalDocument`.
6.  **Fan-out**:
    *   Fires Internal Webhook: `transactional-branding/data_sync`.
    *   Fires User Workflows (n8n).

## Journey 2: The "Automated Invoice" (Runtime)
*Goal: Produce a branded PDF.*

1.  **Trigger**: External System (n8n) calls `POST /api/v1/transactional/generate/invoice`.
2.  **Validation**:
    *   Check API Key & Quota (`SubscriptionService`).
    *   Check Idempotency (Redis).
3.  **Context Loading**:
    *   Fetch `Brand_Identity` (Colors/Logo) for Tenant.
    *   Fetch `Brand_Voice` (Tone).
4.  **Generation (Design Engine)**:
    *   Inject Data into HTML Template.
    *   Apply CSS Variables from Brand Identity.
    *   Use AI to generate text (if configured).
5.  **Billing**:
    *   Deduct 1 credit from `pdf_conversion` Quota.
    *   Log cost to `UsageLog`.
6.  **Output**: Stream PDF back to caller.
