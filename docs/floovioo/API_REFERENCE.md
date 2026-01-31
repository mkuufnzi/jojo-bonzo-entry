
# Floovioo Enterprise API Reference

## 1. Authentication
All API requests require an **API Key** passed in the header.
*   **Header**: `Authorization: Bearer <sk_live_...>`
*   **Context**: Keys are scoped to a specific `User` (and mapped to `Business`).

## 2. Transactional API
*Target Audience: Automated Systems (n8n, Internal Microservices)*

### POST `/api/v1/transactional/generate/:type`
Generates a branded document (PDF) based on the tenant's configured *Brand Identity* and *Voice*.

**Parameters:**
*   `type` (path): Document type. E.g., `invoice`, `receipt`, `proposal`.

**Headers:**
*   `Idempotency-Key` (Optional): Unique string (e.g., UUID). Prevents duplicate processing if retried within 5 minutes.

**Body (JSON):**
```json
{
  "data": {
    "amount": 100.00,
    "items": [...],
    "customer": { "name": "Acme Corp" }
  },
  "options": {
    "draft": false
  }
}
```

**Response:**
*   **Success (200)**: returns PDF Binary stream (`application/pdf`) OR JSON metadata (if requested).
*   **Conflict (409)**: If `Idempotency-Key` was already seen.
*   **Error (4xx/5xx)**: Standard error format.

## 3. Operations API (Meta)
*Target Audience: Dashboard, CLI, Billing Systems*

### GET `/api/me`
Returns context about the current API Key.
*   **Response**: `{ "context": "user", "user": { "id": "...", "email": "..." } }`

### GET `/api/usage`
Returns current billing cycle usage vs quotas.
*   **Response**:
    ```json
    {
      "plan": { "name": "Pro", "pdfQuota": 1000 },
      "usage": { 
        "total": { "count": 45, "cost": 0.05 },
        "pdf": { "count": 40 },
        "ai": { "count": 5 }
      }
    }
    ```

### GET `/api/services`
Lists active services and their unit pricing.

## 4. Integration Internal API (Architecture)
*Internal Use Only (n8n)*

### GET `/api/internal/integrations/:businessId/:provider`
Retrieves decrypted access tokens for 3rd party tools (Zoho, QBO, Xero).
*   **Security**: Protected by `x-internal-api-key`.
*   **Logic**: Auto-refreshes tokens before returning.
