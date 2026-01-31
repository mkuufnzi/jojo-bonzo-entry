
# Floovioo Revenue Engine: End-to-End Walkthrough

This document explains how the **V2 Revenue Engine** components interact to turn a standard invoice into a revenue-generating asset.

## 1. The High-Level Flow (Mermaid)

```mermaid
sequenceDiagram
    participant API as Transactional API
    participant EB as EventBus (Redis)
    participant W as RevenueWorker (BullMQ)
    participant S as RevenueService
    participant DB as Database

    Note over API: 1. Ingestion
    API->>API: Receive Invoice Payload
    API->>EB: Publish "invoice.created"
    
    Note over EB: 2. Async Decoupling
    EB->>W: Enqueue "generate-recommendations" Job
    
    Note over W: 3. Processing
    W->>S: getRecommendations(items, context)
    
    Note over S: 4. Logic Execution
    S->>DB: Fetch Active Rules
    DB-->>S: Return Rules
    S->>S: Execute Matching (SKU vs Triggers)
    S-->>W: Return [Offer1, Offer2]
    
    Note over W: 5. Result
    W->>DB: Save/Cache Offers (for PDF Injection)
```

## 2. Component Deep Dive

### A. The "Nervous System" (EventBus)
*   **File**: `src/modules/transactional/events/event.bus.ts`
*   **Role**: Decouples the API from the heavy lifting. The API responds fast (200 OK), while the engine works in the background.
*   **Technology**: Redis Pub/Sub.

### B. The "Muscle" (RevenueWorker)
*   **File**: `src/modules/transactional/workers/revenue.worker.ts`
*   **Role**: Handles background tasks. It listens to the queue and executes jobs so the main web server doesn't freeze.
*   **Technology**: BullMQ (Redis-based Queue).

### C. The "Brain" (RevenueService)
*   **File**: `src/modules/transactional/revenue/revenue.service.ts`
*   **Role**: Contains the business logic.
    1.  **Fetches Rules**: specific to the Tenant (`businessId`).
    2.  **Matches Triggers**: Does this invoice contain `BASIC-PLAN`?
    3.  **Generates Offers**: "Upgrade to Premium for $99".

### D. The Data (Prisma Schema)
*   **Models**:
    *   `RecommendationRule`: The logic (If X -> Suggest Y).
    *   `Campaign`: Time-based overrides (Black Friday Promo).

## 3. How to Verify It Works
We created a script that mimics this entire flow without needing the frontend:
`src/modules/transactional/scripts/verify-revenue-engine.ts`

1.  It creates a dummy **Business** and **Product**.
2.  It creates a **RecommendationRule** ("If Basic -> Upsell Premium").
3.  It calls the **RevenueService** with a dummy invoice containing "Basic".
4.  It asserts that the Service returns the "Premium" offer.

## 4. Next Step: Wiring the API
Currently, the components exist, but `TransactionalController` needs to call `EventBus.publish()`.
**Coming Up**: We will update `src/controllers/transactional.controller.ts` to emit the event.
