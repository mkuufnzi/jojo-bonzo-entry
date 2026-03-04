# Debt Collection -> n8n Webhook Documentation

This file documents all webhook event types and payload structures dispatched from the **Floovioo Debt Collection** module to your n8n automation gateway. Use these event types to route events in an n8n **Switch Node**.

---

## 1. Webhook Endpoint Definitions

The Debt Collection service dispatches to two main URLs (configurable in the Service Registry):

* **Action Execute URL (recovery_action)**: Fired when an invoice step is activated (e.g. Day 1 Reminder).
* **Data Sync URL (data_sync)**: Fired whenever ERP data (customer/invoices) is pulled and cached in the local DB.

---

## 2. Event Types & Enums (`normalizedEventType`)

Any webhook payload sent via `workflowService.sendTrigger()` will include a `.normalizedEventType` property. **Your n8n webhook nodes should use a Switch Node on `{{ $json.body.normalizedEventType }}`** to route correctly.

### Available Event Enums

| Event Type Enum | Origin Trigger | Description |
| :--- | :--- | :--- |
| `DATA_SYNC_COMPLETE` | ERP Sync Cycle | Dispatched after a tenant's accounting software finishes syncing unpaid invoices to the CRM. Use this to update Zoho/Hubspot cache in n8n. |
| `RECOVERY_EMAIL_DISPATCH` | Orchestrator Batch | Instructs n8n to generate and send an Email. Contains all overdue invoices for a single customer. |
| `RECOVERY_SMS_DISPATCH` | Orchestrator Batch | Instructs n8n to generate and send an SMS reminder. |
| `RECOVERY_LETTER_DISPATCH` | Orchestrator Batch | Instructs n8n to trigger a physical mail API (e.g. Lob). |
| `PAYMENT_REVERSED_NSF` | ERP Sync Cycle | Dispatched when a previously paid invoice balance bounces back above $0. |

---

## 3. Payload Examples

### A) The Action Execution Payload (`RECOVERY_EMAIL_DISPATCH`)

When the orchestrator triggers a recovery action, it clusters **all outstanding invoices for that customer** into a single payload to prevent sending 5 separate emails on the same day.

```json
{
  "businessId": "b_12345",
  "integrationId": "qb_6789",
  "provider": "quickbooks",
  "customerId": "c_uuid",
  "externalCustomerId": "69",
  "customerName": "Acme Corp",
  "customerEmail": "billing@acme.com",
  "totalAmount": "USD 4500.00",
  "invoiceCount": 2,
  "normalizedEventType": "RECOVERY_EMAIL_DISPATCH",
  "batchMode": true,
  "invoices": [
    {
      "invoiceNumber": "INV-1002",
      "amount": "USD 3500.00",
      "dueDate": "10/12/2026",
      "stepName": "First Reminder"
    },
    {
       "invoiceNumber": "INV-1005",
       "amount": "USD 1000.00",
       "dueDate": "10/14/2026",
       "stepName": "Polite Nudge"
    }
  ],
  "profile": {
    "ltv": 24000,
    "riskScore": "Low",
    "clusterName": "Enterprise Tier 1"
  },
  "actionIds": ["act_1", "act_2"],
  "sessionIds": ["sess_1", "sess_2"],
  "signature": "hmac_sha256_hash",
  "timestamp": "2026-03-01T20:52:11.799Z"
}
```

**Crucial:** When n8n finishes sending the email, it MUST hit the `/api/callbacks/recovery/action` webhook passing along the exact `actionIds` array to mark them as done in the database!

### B) The Data Synchronization Payload (`DATA_SYNC_COMPLETE`)

Fired immediately after an ERP sync finishes ingesting data into the `.debtCollectionCustomer` mapping tables.

```json
{
  "businessId": "b_12345",
  "normalizedEventType": "DATA_SYNC_COMPLETE",
  "syncedCustomers": 55,
  "reconciledInvoices": 2,
  "timestamp": "2026-03-01T20:52:11.799Z"
}
```
