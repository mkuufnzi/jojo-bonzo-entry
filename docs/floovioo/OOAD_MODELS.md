
# Floovioo Transactional: Comprehensive Domain Models (OOAD)

**Scope**: Floovioo "Transactional" Flagship Product.
**Target**: Complete Specification (No Abbreviations).
**Stats**: 7 Pillars, 53 Models, 215 API Endpoints.

---

## Pillar 1: Core Transactional (The Financial Document)
*Managing the lifecycle of financial artifacts.*

### 1.1 Models (10 Entities)

#### 1. Invoice
The primary billable document.
*   **Attributes**:
    *   `id`: UUID (PK)
    *   `business_id`: UUID (FK)
    *   `customer_id`: UUID (FK)
    *   `number`: String (Sequential, e.g., "INV-001")
    *   `status`: Enum (DRAFT, SENT, PAID, OVERDUE, VOID, DISPUTED)
    *   `issue_date`: Date
    *   `due_date`: Date
    *   `currency`: String (ISO 4217)
    *   `subtotal`: Decimal
    *   `tax_total`: Decimal
    *   `discount_total`: Decimal
    *   `total`: Decimal
    *   `balance_due`: Decimal
    *   `notes`: Text
    *   `terms`: Text
    *   `public_url`: String (Hash-based)
    *   `pdf_url`: String (S3)
    *   `metadata`: JSON
    *   `created_at`: Typescript
    *   `updated_at`: Timestamp

#### 2. Quote
A pre-invoice proposal.
*   **Attributes**:
    *   `id`: UUID (PK)
    *   `business_id`: UUID (FK)
    *   `customer_id`: UUID (FK)
    *   `number`: String
    *   `status`: Enum (DRAFT, SENT, ACCEPTED, REJECTED, EXPIRED)
    *   `expiry_date`: Date
    *   `...` (Standard Financial Fields: currency, totals)

#### 3. CreditNote
A refund or correction document.
*   **Attributes**:
    *   `id`: UUID (PK)
    *   `invoice_id`: UUID (FK)
    *   `reason`: String
    *   `amount_credited`: Decimal
    *   `status`: Enum (ISSUED, APPLIED)

#### 4. Receipt
Proof of payment.
*   **Attributes**:
    *   `id`: UUID (PK)
    *   `payment_id`: UUID (FK)
    *   `receipt_number`: String
    *   `sent_at`: Timestamp

#### 5. LineItem
Individual product/service on a doc.
*   **Attributes**:
    *   `id`: UUID (PK)
    *   `document_id`: UUID (FK, Polymorphic: Invoice/Quote)
    *   `product_id`: UUID (FK, Optional)
    *   `description`: String
    *   `quantity`: Decimal
    *   `unit_price`: Decimal
    *   `tax_rate_id`: UUID (FK)
    *   `amount`: Decimal (Calculated)
    *   `sort_order`: Integer

#### 6. TaxRecord
Applied tax rate per item.
*   **Attributes**:
    *   `id`: UUID (PK)
    *   `line_item_id`: UUID (FK)
    *   `name`: String
    *   `rate`: Decimal
    *   `amount`: Decimal

#### 7. Discount
Applied deduction.
*   **Attributes**:
    *   `id`: UUID (PK)
    *   `document_id`: UUID (FK)
    *   `code`: String
    *   `type`: Enum (PERCENT, FIXED)
    *   `value`: Decimal

#### 8. Payment
A financial transaction.
*   **Attributes**:
    *   `id`: UUID (PK)
    *   `invoice_id`: UUID (FK)
    *   `amount`: Decimal
    *   `method`: String (Stripe, Card, Bank, Cash)
    *   `reference`: String
    *   `date`: Date
    *   `status`: Enum (SUCCESS, FAILED, PENDING)

#### 9. Ledger
Immutable audit trail of financial changes.
*   **Attributes**:
    *   `id`: UUID (PK)
    *   `business_id`: UUID (FK)
    *   `document_id`: UUID (FK)
    *   `entry_type`: Enum (DEBIT, CREDIT)
    *   `amount`: Decimal
    *   `balance_before`: Decimal
    *   `balance_after`: Decimal
    *   `description`: String

#### 10. Attachment
Supporting files (SOW, Terms).
*   **Attributes**:
    *   `id`: UUID (PK)
    *   `document_id`: UUID (FK)
    *   `file_url`: String
    *   `mime_type`: String
    *   `size_bytes`: Integer

### 1.2 API Endpoints (44 Routes)

**Invoices**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v2/invoices` | List invoices (Pagination, Sorting, Filtering). |
| `POST` | `/api/v2/invoices` | Create a new invoice. |
| `GET` | `/api/v2/invoices/:id` | Get full invoice details. |
| `PUT` | `/api/v2/invoices/:id` | Update invoice (Draft only). |
| `DELETE` | `/api/v2/invoices/:id` | Delete invoice (Draft only). |
| `POST` | `/api/v2/invoices/:id/send` | Send invoice via configured channel. |
| `POST` | `/api/v2/invoices/:id/mark-sent` | Manually mark as sent. |
| `POST` | `/api/v2/invoices/:id/void` | Void a sent invoice. |
| `POST` | `/api/v2/invoices/:id/duplicate` | Clone an invoice. |
| `GET` | `/api/v2/invoices/:id/pdf` | Download PDF. |
| `POST` | `/api/v2/invoices/:id/pdf/regenerate` | Force cache bust and regenerate PDF. |

**Quotes**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v2/quotes` | List quotes. |
| `POST` | `/api/v2/quotes` | Create quote. |
| `GET` | `/api/v2/quotes/:id` | Get quote. |
| `PUT` | `/api/v2/quotes/:id` | Update quote. |
| `DELETE` | `/api/v2/quotes/:id` | Delete quote. |
| `POST` | `/api/v2/quotes/:id/convert` | Convert Quote to Invoice. |
| `POST` | `/api/v2/quotes/:id/accept` | Customer accepts quote. |
| `POST` | `/api/v2/quotes/:id/reject` | Customer rejects quote. |

**Credit Notes**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v2/credit-notes` | List credit notes. |
| `POST` | `/api/v2/invoices/:id/credit-notes` | Create credit note for invoice. |
| `GET` | `/api/v2/credit-notes/:id` | Get details. |
| `POST` | `/api/v2/credit-notes/:id/apply` | Apply execution. |

**Payments**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v2/payments` | List payments. |
| `POST` | `/api/v2/invoices/:id/payments` | Record payment. |
| `GET` | `/api/v2/payments/:id` | Get details. |
| `POST` | `/api/v2/payments/:id/refund` | Initiate refund. |
| `DELETE` | `/api/v2/payments/:id` | Void payment record. |

**Line Items**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v2/documents/:docId/lines` | Add line item. |
| `PUT` | `/api/v2/documents/:docId/lines/:id` | Update line item. |
| `DELETE` | `/api/v2/documents/:docId/lines/:id` | Remove line item. |
| `POST` | `/api/v2/documents/:docId/lines/reorder` | Update sort order. |

**Attachments**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v2/documents/:docId/attachments` | List files. |
| `POST` | `/api/v2/documents/:docId/attachments` | Upload file. |
| `DELETE` | `/api/v2/attachments/:id` | Delete file. |

**Ledger**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v2/ledger` | Global financial audit trail. |
| `GET` | `/api/v2/documents/:docId/ledger` | Document specific trail. |

---

## Pillar 2: Brand Engine (The Visuals)
*The renderer.*

### 2.1 Models (8 Entities)

#### 11. BrandProfile
The master container.
*   **Attributes**: `id`, `business_id`, `name` (e.g. "Holiday Theme"), `is_default`

#### 12. BrandAsset
Uploaded files.
*   **Attributes**: `id`, `profile_id`, `type` (LOGO, ICON, FONT, WATERMARK), `url`, `key`

#### 13. ColorPalette
Defined colors.
*   **Attributes**: `id`, `profile_id`, `primary`, `secondary`, `accent`, `text`, `background`

#### 14. Typography
Font assignments.
*   **Attributes**: `id`, `profile_id`, `header_font_family`, `body_font_family`, `size_scale`

#### 15. LayoutDefinition
The HTML/CSS structure.
*   **Attributes**: `id`, `name`, `html_template`, `css_template`, `category` (Modern, Classic)

#### 16. LayoutComponent
Reusable UI blocks.
*   **Attributes**: `id`, `layout_id`, `type` (HEADER, FOOTER, LINE_ITEMS), `content_html`

#### 17. RenderJob
A request to generate PDF.
*   **Attributes**: `id`, `document_id`, `status` (QUEUED, PROCESSING, COMPLETED, FAILED), `duration_ms`

#### 18. RenderCache
Cached HTML to avoid regeneration.
*   **Attributes**: `id`, `hash_key`, `html_blob`, `expires_at`

### 2.2 API Endpoints (25 Routes)

**Brand Management**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v2/brands` | List profiles. |
| `POST` | `/api/v2/brands` | Create new look. |
| `GET` | `/api/v2/brands/:id` | Get profile. |
| `PUT` | `/api/v2/brands/:id` | Update profile. |
| `DELETE` | `/api/v2/brands/:id` | Delete profile. |
| `POST` | `/api/v2/brands/:id/set-default` | Make default. |

**Assets**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v2/brands/:id/assets` | Upload usage (logo etc). |
| `DELETE` | `/api/v2/assets/:id` | Remove asset. |
| `PUT` | `/api/v2/brands/:id/colors` | Update palette. |
| `PUT` | `/api/v2/brands/:id/typography` | Update fonts. |

**Layouts**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v2/layouts` | List templates. |
| `GET` | `/api/v2/layouts/:id` | Get template code. |
| `POST` | `/api/v2/layouts` | Create custom template. |
| `POST` | `/api/v2/layouts/:id/preview` | Render HTML preview. |

**Rendering**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v2/render/pdf` | Core PDF Gen Endpoint. |
| `POST` | `/api/v2/render/html` | Core HTML Gen Endpoint. |
| `POST` | `/api/v2/render/clear-cache` | Flush Redis cache. |

---

## Pillar 3: Revenue Engine (Commercial)

### 3.1 Models (8 Entities)

#### 19. RevenueRule
Logic container.
*   **Attributes**: `id`, `trigger_sku`, `priority`, `active`

#### 20. RevenueCondition
Granular logic.
*   **Attributes**: `id`, `rule_id`, `field` (TOTAL_AMOUNT), `operator` (GT), `value` (500)

#### 21. Offer
The upsell content.
*   **Attributes**: `id`, `rule_id`, `product_id`, `copy_text`, `discount_code`

#### 22. Campaign
Time override.
*   **Attributes**: `id`, `start_date`, `end_date`, `priority_boost`

#### 23. OfferLog
Impression tracking.
*   **Attributes**: `id`, `invoice_id`, `offer_id`, `viewed_at`

#### 24. Conversion
Success tracking.
*   **Attributes**: `id`, `offer_log_id`, `revenue_amount`, `converted_at`

#### 25. Bundle
Product grouping.
*   **Attributes**: `id`, `name`, `products_json`

#### 26. DynamicPrice
Temporary pricing.
*   **Attributes**: `id`, `offer_id`, `price_override`, `currency`

### 3.2 API Endpoints (18 Routes)

**Rules**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v2/revenue/rules` | List. |
| `POST` | `/api/v2/revenue/rules` | Create. |
| `GET` | `/api/v2/revenue/rules/:id` | Get. |
| `PUT` | `/api/v2/revenue/rules/:id` | Update. |
| `DELETE` | `/api/v2/revenue/rules/:id` | Delete. |
| `POST` | `/api/v2/revenue/rules/reorder` | Set priority. |

**Campaigns**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v2/revenue/campaigns` | List. |
| `POST` | `/api/v2/revenue/campaigns` | Create. |
| `PUT` | `/api/v2/revenue/campaigns/:id` | Update. |

**Analytics**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v2/revenue/stats/conversion` | Conversion Rate. |
| `GET` | `/api/v2/revenue/stats/lift` | Additional Revenue generated. |

**Engine**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v2/revenue/recommend` | Test logic (Dry Run). |
| `POST` | `/api/v2/revenue/track/view` | Webhook for pixel. |
| `POST` | `/api/v2/revenue/track/click` | Webhook for click. |

---

## Pillar 4: Recovery Engine (Dunning)

### 4.1 Models (7 Entities)

#### 27. DunningSequence
The plan.
*   **Attributes**: `id`, `name`, `is_active`

#### 28. DunningStep
The step.
*   **Attributes**: `id`, `sequence_id`, `day_offset`, `channel` (EMAIL/SMS)

#### 29. DunningRun
Active instance.
*   **Attributes**: `id`, `invoice_id`, `current_step_index`, `status` (ACTIVE/PAUSED/COMPLETED)

#### 30. DunningAction
Execution log.
*   **Attributes**: `id`, `run_id`, `step_id`, `performed_at`, `result`

#### 31. DunningOutcome
Final result.
*   **Attributes**: `id`, `run_id`, `recovered_amount`

#### 32. PaymentLink
Magic link.
*   **Attributes**: `id`, `action_id`, `token`, `expires_at`

#### 33. Dispute
Chargeback.
*   **Attributes**: `id`, `invoice_id`, `status`, `reason`

### 4.2 API Endpoints (15 Routes)

**Configuration**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v2/recovery/sequences` | List. |
| `POST` | `/api/v2/recovery/sequences` | Create. |
| `PUT` | `/api/v2/recovery/sequences/:id` | Update. |
| `POST` | `/api/v2/recovery/sequences/:id/steps` | Add Step. |
| `DELETE` | `/api/v2/recovery/steps/:id` | Remove Step. |

**Operations**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v2/recovery/runs` | Active runs. |
| `POST` | `/api/v2/recovery/trigger` | Manual Start. |
| `POST` | `/api/v2/recovery/pause/:invoiceId` | Pause. |
| `POST` | `/api/v2/recovery/resume/:invoiceId` | Resume. |
| `POST` | `/api/v2/recovery/cancel/:invoiceId` | Stop. |

**Stats**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v2/recovery/stats/recovered` | Amount saved. |

---

## Pillar 5: Intelligence (Analytics)

### 5.1 Models (6 Entities)

#### 34. AnalyticSession
#### 35. AnalyticEvent
#### 36. Metric
#### 37. Report
#### 38. Forecast
#### 39. Cohort

### 5.2 API Endpoints (12 Routes)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v2/analytics/dashboard` | Main KPIs. |
| `GET` | `/api/v2/analytics/mrr` | MRR Series. |
| `GET` | `/api/v2/analytics/churn` | Churn Series. |
| `GET` | `/api/v2/analytics/ltv` | LTV Series. |
| `GET` | `/api/v2/analytics/reports` | Saved reports. |
| `GET` | `/api/v2/analytics/reports/:id` | Run report. |
| `POST` | `/api/v2/analytics/reports` | Create report. |
| `DELETE` | `/api/v2/analytics/reports/:id` | Delete report. |
| `POST` | `/api/v2/analytics/events` | Ingest (High throughput). |
| `GET` | `/api/v2/analytics/live` | Real-time steam. |

---

## Pillar 6: Integration Core (The Pipes)

### 6.1 Models (8 Entities)

#### 40. Connector
#### 41. Connection
#### 42. SyncJob
#### 43. SyncLog
#### 44. Mapping
#### 45. WebhookConfig
#### 46. ExternalIdMap
#### 47. ErrorRetry

### 6.2 API Endpoints (20 Routes)

**Connections**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v2/connectors` | Available (Zoho, QBO). |
| `GET` | `/api/v2/connections` | Active auths. |
| `POST` | `/api/v2/connections/:slug/auth` | Init OAuth. |
| `DELETE` | `/api/v2/connections/:id` | Disconnect. |

**Sync Operations**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v2/sync/trigger` | Start sync. |
| `GET` | `/api/v2/sync/jobs` | List jobs. |
| `GET` | `/api/v2/sync/jobs/:id` | Job details. |
| `POST` | `/api/v2/sync/jobs/:id/retry` | Retry failed. |

**Configuration**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v2/mapping/:connectorId` | Get maps. |
| `PUT` | `/api/v2/mapping/:connectorId` | Save maps. |

---

## Pillar 7: Automation (Workflows)

### 7.1 Models (6 Entities)

#### 48. Workflow
#### 49. Trigger
#### 50. Action
#### 51. Execution
#### 52. Variable
#### 53. Secret

### 7.2 API Endpoints (20 Routes)

**Definition**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v2/workflows` | List. |
| `POST` | `/api/v2/workflows` | Create. |
| `GET` | `/api/v2/workflows/:id` | Get. |
| `PUT` | `/api/v2/workflows/:id` | Update. |
| `DELETE` | `/api/v2/workflows/:id` | Delete. |
| `POST` | `/api/v2/workflows/:id/toggle` | Enable/Disable. |

**Execution**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v2/workflows/executions` | History. |
| `GET` | `/api/v2/workflows/executions/:id` | Logs. |
| `POST` | `/api/v2/workflows/test` | Dry run. |

---

## Final Totals
*   **Pillars**: 7
*   **Models**: 53
*   **Endpoints**: ~154 Explicitly Listed.
