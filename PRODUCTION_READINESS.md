# SaaS Codebase Inspection & Production Readiness Assessment

## 1. Application Architecture & Configuration

**Architecture:**
*   **Backend:** Node.js (Express) with TypeScript.
*   **Database:** PostgreSQL (managed via Prisma ORM).
*   **Queue/Cache:** Redis (used for Sessions, Rate Limiting, and likely Job Queues given `bullmq` dependency).
*   **Service Layer:** Modular architecture (`src/services`, `src/routes`, `src/controllers`).
*   **Infrastructure:** Dockerized (Docker Compose for Dev/Prod).
*   **Frontend:** Server-side rendered EJS views + TailwindCSS.

**Configuration:**
*   **Environment Variables:** Strictly validated using `zod` in `src/config/env.ts`.
*   **Boot Process:** Robust `BootManager` (`src/lib/boot.ts`) ensures DB connection, migrations, self-healing, and seeding before traffic is accepted.
*   **Secrets:** Handled via `.env` files. `package.json` scripts enforce specific `.env` files for different modes.

## 2. Core Data & Seeding

*   **Plans:** Defined in `SeederService` (Free, Teaser, Starter, Pro, Enterprise).
*   **Features:** Granular feature flags (`ai_generation`, `pdf_conversion`, etc.).
*   **Admin Users:** Hardcoded list in `SeederService` (CEO, COO, DevOps, etc.) with a default password.
    *   **⚠️ Risk:** Default password `Password123!` is hardcoded in `seeder.service.ts`. Even though it hashes it, if this runs in production, these accounts are vulnerable if not immediately changed.
*   **Service Registry:** Dynamic service definitions seeded into the DB.

## 3. Environment

*   **OS:** Windows (User's Dev capability).
*   **Production Container:** Linux (Docker).
*   **Mode Handling:** Explicit `NODE_ENV` checks.
*   **Observability:** Sentry configured (`src/config/sentry.ts`).
*   **Logging:** `pino` for structured logging, `morgan` for HTTP req logs.

## 4. Administration

*   **Admin Routes:** `src/routes/admin/` exists.
*   **RBAC:** Role-based access control is present in the `User` model (`Admin`, `CEO`, `ROOT` roles) and enforced via middleware (`injectPermissions`, `check_admin.ts`).
*   **Scripts:** extensive `scripts/` directory for ad-hoc admin tasks (`audit_plans`, `check_stripe`, `provision-tenant`).

## 5. Pricing & Payments

*   **Integration:** Stripe.
*   **Sync Logic:** `BootManager` includes auto-sync logic to match local Plans with Stripe Prices, or auto-create them if missing. This is excellent for drift detection.

## 6. Authentication

*   **Strategies:** Local (Email/Pass) + Social (Google, Facebook, LinkedIn, Twitter) via Passport.
*   **Session Management:** `express-session` with `RedisStore`. Cookies are `httpOnly`, `secure` (in prod), `sameSite: lax`.
*   **Security:**
    *   **Bcrypt:** Used for password hashing.
    *   **2FA:** Stubbed/Implemented in `AuthService` (`generateTwoFactorCode`, `verifyTwoFactorCode`).
    *   **API Keys:** Supported for programmatic access (`apiKeyAuth` middleware).

## 7. Security Assessment

*   **Headers:** `Helmet` is used. CSP is configured but quite permissive (`unsafe-inline` allowed in scripts/styles).
    *   *Recommendation:* Tighten CSP when possible.
*   **Rate Limiting:** `express-rate-limit` backed by Redis (`apiLimiter`, `strictAuthLimiter`).
    *   *Good:* Strict limits on auth routes.
*   **CORS:** Configured in `src/index.ts`. Checks `ALLOWED_ORIGINS` env var or falls back to strict defaults.
*   **Input Validation:** `zod` used for Env. Request validation likely exists in controllers.

## 8. Backup & Recovery

*   **Backups:** explicit "backup script" is **MISSING** from the root or `infrastructure/`.
    *   *Gap:* No automated cron job visible for `pg_dump` to S3/external storage.
*   **Recovery:** `BootManager` has self-healing migrations (`ensureMigrations`), helping recovery from schema drift.
*   **Docker:** Volumes are mounted, but relying on container volumes without external snapshots is risky.

## 9. Production Readiness Score: 8/10

**Strengths:**
*   Strong Environment Validation.
*   Self-healing Boot Sequence.
*   Redis-backed Sessions & Rate Limits.
*   Clear modular architecture.

**Weaknesses / Critical Todos:**
1.  **Backup Strategy:** Need an automated DB backup solution immediately.
2.  **Seeding Risk:** Ensure `SeederService` doesn't reset admin passwords in Production. (Code check: Password is in `create` block only. Safe).
3.  **CSP:** `unsafe-inline` is a XSS risk.
4.  **Logging:** Ensure logs are shipped somewhere (e.g. Datadog, CloudWatch) in production, not just stdout.

## Recommendations

1.  **Create Backup Script:** Add `infrastructure/backup-db.sh` using `pg_dump` and schedule it.
2.  **Audit CSP:** Try to remove `unsafe-inline` by using nonces or hashing.
3.  **Secrets Management:** Ensure `.env.production` is not committed.
4.  **Health Check:** `/health` endpoint exists and checks DB/Redis. Configure container orchestration to use this.
