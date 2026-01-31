# Floovioo Enterprise Engine: SaaS Architecture (V2)

## 1. Executive Summary
This document specifies the architecture for the **Floovioo Enterprise Engine**, a comprehensive SaaS backend orchestrator powered by n8n.
Unlike a simple task runner, this engine provides full Business Process Automation (BPA) capabilities, acting as a:
*   **CDP (Customer Data Platform):** Aggregating contact and interaction history.
*   **DAM (Digital Asset Management):** Storing brand assets and generated documents.
*   **CMS (Content Management System):** Managing brand voice and templates.
*   **Commerce Engine:** Managing product catalog and intelligent upsell rules.

The system is designed to be **Database-Agnostic**, running on Google Sheets for MVP agility but structured strictly for PostgreSQL migration.

---

## 2. Domain Model (OOAD)
The system is built around 5 Core Domains.

### Domain A: Identity & Configuration
*The "Brain" of the tenant.*
1.  **`Tenants`**: The subscription unit.
2.  **`Integrations`**: Credentials for ERPs (QB, Xero), CRMs, and Communication channels.
3.  **`Schedules`**: Configuration for periodic tasks (e.g., "Monthly Statement Run").

### Domain B: Brand Experience
*The "Soul" of the tenant.*
4.  **`Brand_Identity`**: Visual assets (Logos, Fonts, Colors) used for template rendering.
5.  **`Brand_Voice`**: AI Persona definitions (Tone, Rules, Audience) for content generation.

### Domain C: Commerce & CRM
*The "Market" of the tenant.*
6.  **`Contacts_Cache`**: Synced customer directory (from ERP) for routing and history.
7.  **`Products_Cache`**: Synced inventory (from ERP) + Logic for Recommendation Engine.

### Domain D: Operations
*The "hands" of the tenant.*
8.  **`Documents` (DAM)**: The immutable record of generated artifacts (PDFs).
9.  **`Jobs` (Queue)**: The async workload manager.

---

## 3. Data Schema (The Source of Truth)
*Designed for Relational Integrity (PK/FK).*

#### 1. Tenants Registry (`tenants`)
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | PK. |
| `floovioo_id` | String | Slug for routing. |
| `name` | String | Organization Name. |
| `status` | Enum | `active`, `onboarding`, `suspended`. |
| `config_json` | JSON | Feature flags, defaults. |

#### 2. Brand Identity (`brand_identity`)
| Column | Type | Description |
| :--- | :--- | :--- |
| `tenant_id` | UUID | FK. |
| `logo_url` | URL | S3/Drive Link to transparent PNG/SVG. |
| `primary_color` | Hex | Main Brand Color. |
| `secondary_color` | Hex | Accent Color. |
| `font_heading` | String | Font Family for Headers. |
| `font_body` | String | Font Family for Text. |
| `templates_json` | JSON | Map of DocType -> TemplateID. |

#### 3. Brand Voice (`brand_voice`)
| Column | Type | Description |
| :--- | :--- | :--- |
| `tenant_id` | UUID | FK. |
| `persona` | String | "The Helpful Expert", "The Strict Auditor". |
| `tone_adjectives` | Array | ["Professional", "Warm", "Concise"]. |
| `ai_rules` | Text | System Prompt instructions for LLM. |
| `email_signature` | HTML | Standard footer. |

#### 4. Contacts Cache (`contacts`)
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | PK. |
| `tenant_id` | UUID | FK. |
| `source_id` | String | External ID (e.g., QBO Customer ID). |
| `name` | String | Full Name / Company Name. |
| `email` | String | Primary Delivery Email. |
| `lifetime_value` | Float | Total Invoiced (for segmentation). |
| `last_synced` | Timestamp | |

#### 5. Products Cache (`products`)
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | PK. |
| `tenant_id` | UUID | FK. |
| `sku` | String | Product Code. |
| `name` | String | Display Name. |
| `description` | Text | Marketing Copy. |
| `price` | Float | Unit Price. |
| `image_url` | URL | Thumbnail for "Recommended for You" section. |
| `category` | String | For recommendation grouping. |

#### 6. Document Repository (`documents`)
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | PK. |
| `tenant_id` | UUID | FK. |
| `contact_id` | UUID | FK (Who received it?). |
| `type` | Enum | `invoice`, `statement`, `proposal`. |
| `file_url` | URL | **Permanent Link** to PDF. |
| `metadata_json` | JSON | { "invoice_amount": 500, "upsells_shown": ["sku_1"] }. |
| `created_at` | Timestamp | |

#### 7. Job Queue (`jobs`)
*(Same as V1, but expanded payload support)*

---

## 4. System Modules (The Logic)

### Module A: The "Syncer" (Data Freshness)
*Goal: Ensure n8n has local access to CRM/Product data without hitting ERP limits.*
*   **Triggers:** Webhook (Real-time) OR Nightly Cron.
*   **Logic:**
    1.  Fetch changes from ERP (QBO/Xero).
    2.  Transform to standard `Contact` / `Product` schema.
    3.  **Upsert** to `contacts` / `products` tables.

### Module B: The "Brand Engine" (Content Generation)
*Goal: Generate unique, branded assets.*
*   **Input:** Data Object (e.g. Invoice Data).
*   **Pipeline:**
    1.  **Context Loading:** Fetch `Brand_Identity` & `Brand_Voice`.
    2.  **AI Copywriting:** Use `Brand_Voice` to generate email subject/body & upsell copy.
    3.  **Recommendation Agent:**
        *   Input: Invoice Items + `Products` Catalog.
        *   Logic: Filter compatible items -> Select top 2 upsells.
    4.  **rendering:** Merge Data + Identity + Copy + Recommendations -> HTML -> PDF.
    5.  **Storage:** Upload PDF to Storage -> Create `Document` record (History).

### Module C: Communication Center (Delivery)
*Goal: Reliable delivery and tracking.*
*   **Input:** Document ID.
*   **Pipeline:**
    1.  Lookup `Contact` email.
    2.  Render Email Template (using `Brand_Voice`).
    3.  Send via SMTP/SES.
    4.  Update `Document` status to `sent`.

---

## 5. Use Case: "The Automated Invoice Journey"

1.  **Trigger**: User creates Invoice in QuickBooks.
2.  **Ingest**: Webhook hits `Dispatcher`. Job `sync_invoice` created.
3.  **Worker (Phase 1)**: Syncs Invoice Data + Customer Data to Cache. Job `generate_branded_invoice` created.
4.  **Worker (Phase 2 - Brand Engine)**:
    *   n8n pulls Brand Colors (Blue) and Voice (Friendly).
    *   n8n notices Invoice contains "Web Design Service".
    *   n8n queries `Products` table -> Recommends "SEO Package" (Upsell).
    *   n8n generates PDF with "Blue" header and "Friendly" intro.
    *   n8n uploads PDF to Drive.
    *   n8n inserts entry into `Documents` table.
5.  **Worker (Phase 3 - Delivery)**:
    *   n8n emails PDF to Customer.
6.  **Result**: Customer sees a beautiful, personalized, high-value document. History is saved for the Tenant.

---

## 6. Implementation Strategy
1.  **Initialize Storage**: Create the 7-sheet Workbook "Floovioo_Enterprise_DB".
2.  **Build "Syncer"**: Focus on Contacts/Products first (Foundation).
3.  **Build "Brand Engine"**: The Core Value Prop.
4.  **Build "Dispatcher"**: Connect the pipes.
