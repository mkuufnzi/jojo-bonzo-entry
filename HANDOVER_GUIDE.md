# Floovioo  - Technical Maintainer's Guide

## 1. System Overview

This documentation provides a comprehensive technical deep-dive into the Floovioo  SaaS application. It is designed to facilitate a complete handover to maintenance engineers, covering every aspect of infrastructure, security, data architecture, and scalability strategies.

### High-Level Architecture
The application is a **Tiered Monolith** built on Node.js/Express, designed with clear separation between the API Server (HTTP) and Worker Processes (Background Jobs).

**Core Components:**
1.  **API Gateway (Express)**: Handles all incoming HTTP requests, authentication, validation, and job scheduling.
2.  **Job Queue (Redis/BullMQ)**: Acts as the asynchronous bridge between the API and Workers.
3.  **Worker Pool (Node.js)**: Consumes jobs from Redis to perform CPU-intensive tasks (PDF generation) or high-latency tasks (Webhooks) without blocking the API.
4.  **Database (PostgreSQL)**: Stores persistent relational data (Users, Apps, Usage Logs).
5.  **Cache/Session Store (Redis)**: Handles ephemeral data like user sessions and API rate limit counters.

---

## 2. Infrastructure & Configuration

### 2.1 Environmental Configuration (`src/config/env.ts`)
The application uses strict runtime environment validation using `zod`. This ensures the application cannot start unless all required infrastructure connections are valid.

*   **Loading Strategy**: `.env` file is loaded via `dotenv`, but production environments are expected to inject variables directly into the container scope.
*   **Validation**: The `envSchema` object in `src/config/env.ts` defines the contract. Any missing strict key causes the process to exit with status 1.

**Key Variables:**
*   `REDIS_URL`: Critical for queues and rate limiting. Falls back to in-memory only in development (not suitable for prod).
*   `DATABASE_URL`: Connection string for Prisma/PostgreSQL.
*   `STRIPE_*`: Payment gateway secrets.
*   `N8N_WEBHOOK_URL`: Integrated external automation hook.

### 2.2 Redis Infrastructure
Redis is the "nervous system" of this SaaS. It is not just a cache; it is a primary infrastructure component.

**Usage Scopes:**
1.  **Job Queues (BullMQ)**: The `pdf-generation` queue manages the backlog of conversion requests. Docker service name: `redis`.
2.  **Rate Limiting**: Public API endpoints use Redis counters (`public_limit:${ip}`) to enforce a strict 20 req/hour limit for guests, preventing abuse without database hits.
3.  **Session Store**: User login sessions are persisted here to allow horizontal scaling of the API tier (stateless API nodes).

### 2.3 Process Management (PM2)
The application uses PM2 (`ecosystem.config.js`) for process orchestration in production.

*   **Cluster Mode**: The API can run in cluster mode to utilize multiple cores, though the current config targets a single instance per container for Docker simplicity.
*   **Worker Separation**: The `npm run worker` command is typically run as a separate service (or container) to ensure CPU spikes from PDF generation do not starve the HTTP API event loop.

### 2.4 Tool Execution Strategy
The application supports multiple execution strategies for tools, defined in the `Service` database model (`executionType` field):

*   **`local`/`internal`**: Executed directly within the worker process (e.g., Puppeteer).
*   **`http_sync`**: The worker calls an external API and waits (not currently used but supported).
*   **`webhook_async`**: The worker triggers an external process and expects a callback (future implementation).

**PDF Generation Strategy:**
1.  **Engine**: Puppeteer (Headless Chrome).
2.  **Optimization**: Flags `--no-sandbox` and `--disable-dev-shm-usage` are critical for running in Docker/Alpine environments.
3.  **Browser Management**: The `PdfService` maintains a singleton browser instance (`getBrowser()`) to avoid the overhead of launching Chrome for every request.

---

## 3. Security & Validation Layer

The security architecture is applied in layers: Global -> Public/Guest -> Authenticated API -> Scope/Quota.

### 3.1 Authentication Hierarchies

**Layer 1: Public Guest Access (`src/middleware/public-auth.middleware.ts`)**
*   **Trigger**: Presence of `X-Public-Guest-Token` header.
*   **Mechanism**: Validates the token (currently static) and checks Redis Rate Limits (`public_limit`).
*   **Identity**: Assigns a "Virtual Identity" (`currentApp` = `public-guest-app`) to the request.
*   **Bypass**: If the token is present, it skips subsequent Database Auth checks.

**Layer 2: API Key Authentication (`src/middleware/auth.middleware.ts`)**
*   **Trigger**: `X-API-Key` header.
*   **Mechanism**:
    1.  Queries `Prisma.App` for the exact API key.
    2.  **Deep Validation**: Checks `app.isActive`, `app.user.isActive`, and `app.apiKeyExpiresAt`.
    3.  **Context Inflation**: Populates `req.user` (Owner) and `req.currentApp` (Context) for downstream controllers.
*   **Security Note**: This middleware *must* run before any resource access logic.

### 3.2 Service Authorization (`src/middleware/service.middleware.ts`)
Authentication proves who you are; Authorization proves what you can do.

*   **Middleware**: `requireServiceAccess(slug)`
*   **Logic**:
    1.  Checks if `req.currentApp` exists.
    2.  Verifies if `serviceSlug` is present in `req.currentApp.services`.
    3.  If valid, fetches Service config from DB and attaches to `req.service`.
*   **Defense in Depth**: Even if a user has a valid API Key, they cannot access the "docx-to-pdf" tool unless that specific tool is enabled in their `AppService` table.

### 3.3 Input Validation
*   **Schema Validation**: Zod is used (`src/schemas/pdf.schema.ts`) to strictly validate payloads (URLs, HTML content, landscape flags) *before* they reach the worker.
*   **Security Sanitization**: `SecurityService.validateUrl` is called to prevent SSRF (Server-Side Request Forgery) attacks via the PDF generator (e.g., blocking `file://`, `localhost`, or internal IP ranges).

---

## 4. Data Architecture

### 4.1 Multi-Tenancy Implementation
The system uses a **Row-Level Security** model within a shared Database.

*   **Tenant Root**: `User` (The billing entity).
*   **Logical Container**: `App` (The project/context).
*   **Access Control**: All critical tables (`App`, `UsageLog`, `Subscription`) have a `userId` foreign key.
*   **Middleware Enforcement**: All queries in repositories are scoped by `userId` derived from the Auth token, ensuring Tenant A never sees Tenant B's data.

### 4.2 Logging Patterns
Logging is bifurcated into "Business" and "Debug" streams:

1.  **Usage Logs (`UsageLog` Model)**:
    *   **Purpose**: Billing and Quota tracking.
    *   **Trigger**: Successful completion of a tool execution (in `PdfService.processPdfRequestSync`).
    *   **Data**: Stores `duration`, `cost` (calculated from `Service.pricePerRequest`), and resource type.
    *   **Criticality**: High. This data drives the monetization.

2.  **API Request Logs (`ApiRequestLog` Model)**:
    *   **Purpose**: Debugging and Audit.
    *   **Trigger**: `request-logger.middleware.ts`.
    *   **Data**: HTTP method, Path, User Agent, IP, Response Time.

### 4.3 Redis Data Structures
*   **Queues**: `bull:pdf-generation:id`, `bull:pdf-generation:jobs`, etc. (Managed by BullMQ).
*   **Rate Limits**: `public_limit:127.0.0.1` (Integer, TTL 3600s).

---

## 5. Scalability & Production Readiness

### 5.1 Asynchronous Polling Strategy
To support high request volumes without timing out HTTP connections (common with PDF generation taking 5-30s), the system uses an **Async-Polling Pattern**:

1.  **Submission**: Client POSTs to `/api/pdf/convert`.
2.  **Queuing**: Controller adds job to Redis (BullMQ) and immediately returns `202 Accepted` + `{ jobId: "..." }`.
3.  **Processing**: Worker picks up job, launches Puppeteer, generates Buffer.
4.  **Completion**: Worker returns data to Redis.
5.  **Polling**: Client loops GET requests to `/api/jobs/:id`.
    *   Response: `{ status: "active", progress: 0 }`
    *   Response: `{ status: "completed", result: { ... } }`
6.  **Retrieval**: Once completed, the client downloads the PDF.

**Why this is scalable**:
*   The HTTP API never waits. It can handle thousands of submissions per second (limited only by Redis write speed).
*   The Worker pool can be scaled independently. If the queue backlog grows, you add more Worker containers without touching the API.

### 5.2 Worker Concurrency
*   **File**: `src/workers/index.ts`
*   **Config**: `concurrency: config.NODE_ENV === 'production' ? 5 : 2`
*   **Tuning**: Each concurrent job requires a dedicated Chrome tab. A 2GB container usually handles 3-5 concurrent renders. Setting this too high will crash the container (OOM).

---

## 6. Codebase Guide for Handover

### 6.1 Key Directory Structure
*   `src/config`: Environment and static configuration.
*   `src/controllers`: HTTP handlers. purely orchestrates Req/Res. **Logic should not live here.**
*   `src/dtos`: Data Transfer Objects (Interfaces for API responses).
*   `src/lib`: Core utilities (Queue factory, Logger, Prisma singleton, Redis singleton).
*   `src/middleware`: Interceptors for Auth, Logging, Validation.
*   `src/repositories`: Database abstraction layer. **All direct Prisma calls happen here.**
*   `src/services`: Business logic. Orchestrates Repositories and External Tools (Puppeteer).
*   `src/views`: Server-side rendered templates (EJS) for the landing page and demos.
*   `src/workers`: The background process logic.

### 6.2 Critical Files Checklist
*   `prisma/schema.prisma`: The Source of Truth for the data model.
*   `src/workers/pdf.processor.ts`: The "Brain" of the PDF engine.
*   `ecosystem.config.js`: The "Commander" for production deployment.

### 6.3 Maintenance Tasks
*   **Database Migrations**: Run `npx prisma migrate deploy` after any schema change.
*   **Queue Monitoring**: Monitor Redis memory usage (`redis-cli info memory`). If it fills up, jobs will fail.
*   **Browser Cache**: Puppeteer can accumulate temp files. Ensure the Docker container `/tmp` folder is cleared or the container is restarted periodically if using local temp storage.

This guide covers the operational DNA of the "Floovioo " system. Validating the "API Key per Request" is handled via the `apiKeyAuth` middleware in almost every API route chain, ensuring zero-trust security for tool access.

---

## 7. Agentic Protocols (The Codex)

To ensure long-term maintainability and prevent regressions by AI Agents, this project utilizes a **Redis-based Knowledge Graph** (The Codex).

### 7.1 The Golden Rule for Agents
**Before modifying any feature, you MUST check the Codex for constraints.**

```bash
# 1. Scan for features
npx ts-node scripts/codex/cli.ts scan

# 2. Get Context for the feature you are working on
npx ts-node scripts/codex/cli.ts get-context ai-doc-generator
```

### 7.2 Codex Structure
*   **Features (`codex:feature:*`)**: High-level grouping of files and logic.
*   **Constraints (`codex:constraint:*`)**: Inviolable technical rules (e.g., "HITL Flow").
*   **File Contexts (`codex:file:*`)**: Fragility warnings for specific files.

### 7.3 Managing Context
If you solve a complex bug or refactor a system, you **MUST** update the Codex using the CLI tools.

See `scripts/codex/cli.ts` source code for all available commands (`save-feature`, `save-constraint`, etc.).
