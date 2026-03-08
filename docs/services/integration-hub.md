# Integration Hub Service

Enterprise Hub for managing external ERP/CRM connectivity, data normalization, and sync orchestration.

## Overview

The Integration Hub acts as the central gateway for all external data sources. it handles OAuth flows, data normalization via the `NormalizationEngine`, and manages the lifecycle of `Integration` records for each Business.

## Service Configuration

- **Slug**: `floovioo_integration-hub`
- **Tier**: `core`
- **Required Feature**: `integration_sync`

## API Endpoints

All API calls must include `X-API-Key` and the user/app must have the `floovioo_integration-hub` service enabled.

| Endpoint | Method | Description | Billable |
|----------|--------|-------------|----------|
| `/api/v1/integration-hub/catalog` | GET | List supported integration providers. | No |
| `/api/v1/integration-hub/connections` | GET | List active integrations for the business. | No |
| `/api/v1/integration-hub/{provider}/status` | GET | Check health and sync status of a provider. | No |
| `/api/v1/integration-hub/{provider}/sync` | POST | Trigger a manual data synchronization. | **Yes** |
| `/api/v1/integration-hub/{provider}/disconnect` | POST | Remove an integration. | No |

## Data Normalization

The service automatically normalizes data from providers (QuickBooks, Xero, Shopify, etc.) into the following Unified Models:

- `UnifiedCustomer`
- `UnifiedInvoice`
- `UnifiedOrder` (with `totalAmount`, `totalPaid`)
- `UnifiedProduct` (with `quantity`, `category`)
- `UnifiedPayment`

## Quota Management

The `sync` action is categorized as a billable event. Each successful sync operation decrements the `integration_sync` quota (if applicable) or is logged for usage-based billing.
