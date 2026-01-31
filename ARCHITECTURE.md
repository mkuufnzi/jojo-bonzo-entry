# System Architecture: Integration Config & n8n

This document explains the architecture for managing 3rd-party integrations and how creating a data pipeline with n8n fits into the system.

## 1. Data-Driven Configuration
Instead of hardcoding provider URLs and scopes in the codebase, we store them in the database.

**Table:** `IntegrationDefinition`
| Column | Type | Description |
|--------|------|-------------|
| `slug` | String | Unique identifier (e.g., `zoho`, `quickbooks`) |
| `config` | JSON | Stores auth URLs, scopes, and environment variable mapping keys. |

**Example Config (`config` column):**
```json
{
  "provider": "zoho",
  "authUrl": "https://accounts.zoho.com/oauth/v2/auth",
  "tokenUrl": "https://accounts.zoho.com/oauth/v2/token",
  "scope": "ZohoBooks.invoices.READ",
  "env": {
    "clientId": "ZOHO_CLIENT_ID",
    "clientSecret": "ZOHO_CLIENT_SECRET",
    "redirectUri": "ZOHO_REDIRECT_URI"
  }
}
```
**Benefits:**
- You can update scopes or URLs without redeploying code.
- The UI handles any integration generically.

## 2. Token Storage
When a user connects, we store the credentials in the `Integration` table, linked to their `Business`.

**Table:** `Integration`
| Column | Type | Description |
|--------|------|-------------|
| `businessId` | UUID | The business that owns the connection. |
| `provider` | String | Matches `IntegrationDefinition.slug` (e.g., `zoho`). |
| `accessToken` | String | The short-lived token for API calls. |
| `refreshToken` | String | The long-lived token used to get new access tokens. |
| `metadata` | JSON | Extra data like `api_domain` or `realmId`. |

## 3. n8n Integration Strategy
Your n8n workflows need to fetch data (e.g., Invoices) on behalf of a specific business.

### Option A: Database Query (Direct)
n8n connects directly to your Postgres database to fetch the tokens.

**Generic Workflow Logic:**
1. **Trigger**: Webhook or Schedule.
2. **Postgres Node**: Execute SQL:
   ```sql
   SELECT "accessToken", "refreshToken", "metadata" 
   FROM "Integration" 
   WHERE "businessId" = $json["businessId"] AND "provider" = 'zoho';
   ```
3. **HTTP Request Node**: Use the `accessToken` to call Zoho API.
   - *Error Handling*: If 401 Unauthorized, use `refreshToken` to refresh, update DB, and retry.

### Option B: Internal API (Recommended)
Create a secure internal API endpoint in this app that n8n calls. This keeps encryption logic centralized.

**Endpoint:** `GET /api/internal/integrations/:businessId/:provider`
**Headers:** `x-internal-api-key: <your-secure-key>`
**Response:**
```json
{
  "accessToken": "...",
  "apiDomain": "..."
}
```
*(The backend handles token refreshing automatically before returning).*

## 4. How to Add New Integrations
1. Add rows to `IntegrationDefinition` (via Seeder or Admin UI).
2. Add secrets to `.env`.
3. The UI automatically renders the new tile.
4. The generic Controller handles the OAuth flow using the JSON config.
