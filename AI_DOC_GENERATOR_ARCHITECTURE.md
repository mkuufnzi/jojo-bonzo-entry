# AI Document Generator - System Architecture & Flows

## 1. Overview
The AI Document Generator is a Human-in-the-Loop (HITL) system that allows users to generate professional HTML/PDF documents using AI. It operates in two distinct phases: warning the user about credit usage, analyzing the request, and then allowing the user to refine inputs before final generation.

**Key Features:**
*   **Two-Phase Flow:** `Analyze` (Free) -> `Generate` (Quota Deducted).
*   **Asynchronous Processing:** Uses BullMQ to offload AI tasks to background workers.
*   **N8N Integration:** Delegates the actual AI logic (Prompt Engineering, LLM interaction) to an N8N workflow via Webhooks.
*   **Persistent Context:** Uses UUIDs (`jobId`, `requestId`) to trace the conversation context across the two phases.

---

## 2. System Components

| Component | File Path | Role |
| :--- | :--- | :--- |
| **Frontend** | `src/views/services/ai-doc-generator.ejs` | UI for inputs, preview, and polling logic using `fetch`. |
| **Controller** | `src/controllers/services.controller.ts` | Handles HTTP requests, quota checks, UUID generation, and job enqueuing. |
| **Routes** | `src/routes/services.routes.ts` | Maps endpoints (`/analyze`, `/generate`, `/jobs/:id`) to Controller actions. |
| **Worker** | `src/workers/ai.processor.ts` | Background processor that picks up jobs and calls the AI Service. |
| **AI Service** | `src/services/ai.service.ts` | Wrapper for N8N Webhook calls; handles response parsing. |
| **Webhook Service** | `src/services/webhook.service.ts` | Resolves N8N URLs from Database (primary) or Env (fallback). |

---

## 3. Detailed Data Flows

### Phase 1: Analysis (HITL)
**Objective:** Parse user intent and propose a plan without charging quota.

1.  **User Action:** Clicks "Analyze" on the frontend.
2.  **Frontend (`ai-doc-generator.ejs`):**
    *   Collects inputs (Prompt, Document Type).
    *   Calls `POST /services/ai-doc-generator/analyze`.
3.  **Controller (`analyzeWithAi`):**
    *   **CRITICAL:** Generates new UUIDs: `contextJobId` (v4) and `contextRequestId` (v4).
    *   Enqueues `analyze_request` job to BullMQ (`AI_GENERATION` queue).
    *   **Returns:** JSON including `jobId` (Queue ID) AND `contextJobId` (UUID).
4.  **Frontend (Response Handler):**
    *   Receives response.
    *   **Capture:** Immediates stores `window.currentJobId = contextJobId`.
    *   Starts Polling (`pollForAnalysisOnly`).
5.  **Worker (`aiProcessor`):**
    *   Picks up job. Uses `contextJobId`.
    *   Calls N8N Webhook (`analyze` action).
6.  **N8N:**
    *   Processes prompt. Returns JSON (Summary, Clarification).
7.  **Completion:**
    *   Worker returns result.
    *   Frontend Polling finishes. Modal displays summary.

### Phase 2: Generation (Final)
**Objective:** Generate the full document using the context from Phase 1.

1.  **User Action:** Clicks "Approve & Generate" in the Review Modal.
2.  **Frontend (`confirmGenerateBtn`):**
    *   **Payload Construction:** Includes `jobId: window.currentJobId` (`3925bba8...`).
    *   Calls `POST /services/ai-doc-generator/generate`.
3.  **Controller (`generateWithAi`):**
    *   Validates Quota.
    *   Extracts `jobId` / `requestId` from body.
    *   Enqueues `generate_html` job to BullMQ, passing the UUIDs explicitly in the job data.
4.  **Worker (`aiProcessor`):**
    *   Picks up job. Prioritizes the top-level `jobId` (UUID) over the Queue ID.
    *   Calls N8N Webhook (`generate` action), passing the *same* UUIDs.
5.  **N8N:**
    *   Uses the UUIDs to recall memory/context (if vector store is used) or simply logs attribution.
    *   Generates HTML.
6.  **Completion:**
    *   Frontend polls for result.
    *   In-browser Preview updates with the generated HTML.

---

## 4. Configuration & ID Handling

### N8N Webhook Configuration
*   **Primary Source:** Database (`Service` table, `config` column). Managed via Admin Dashboard.
*   **Fallback:** `process.env.AI_GENERATION_WEBHOOK_URL` (in `.env.development`).
*   **Resolution Logic:** `WebhookService` attempts to look up `config.webhooks[action]`. If missing/invalid, it falls back to the Env Var.

### ID Propagation Strategy
To prevent ID collisions (Queue ID vs Context ID):
1.  **Generation:** Controller implies "Start of Trace" -> `crypto.randomUUID()`.
2.  **Transmission:** Sent to Frontend immediately.
3.  **Persistence:** Frontend stores in Global Window Scope (`window.currentJobId`).
4.  **Loopback:** Frontend sends it back in Phase 2 Body.
5.  **Execution:** Worker receives it and passes it to N8N.

This ensures that even if N8N or BullMQ restarts, the *Business Logic ID* remains consistent.

## 5. Known Issues & Fixes (Jan 2025)
*   **Issue:** N8N 404 "Webhook not registered".
    *   **Cause:** App was resolving to an old `webhook-test` URL via a phantom Env Var or cached config.
    *   **Fix:** Explicitly set Production URL in `.env.development` (or clean DB config).
*   **Issue:** "Wrong Job ID" in Generation.
    *   **Cause:** Frontend polling logic overwrote the UUID with the numeric Queue ID on completion.
    *   **Fix:** Updated `ai-doc-generator.ejs` to preserve the UUID if already present.
