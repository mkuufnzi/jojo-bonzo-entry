# Floovioo Deployment & Configuration Guide

> **For**: DevOps Engineers, System Administrators, On-Call Engineers
> **Last Updated**: 2026-02-02
> **Architecture**: Modular Monolith (Node.js/Express + PostgreSQL + Redis)

---

## 1. Infrastructure Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PRODUCTION STACK                                  │
├─────────────────────────────────────────────────────────────────────────┤
│   Load Balancer (NGINX/Cloudflare)                                      │
│         ↓                                                                │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  Floovioo App (Node.js:18)  - Port 3002                         │   │
│   │    ├── Express Server                                            │   │
│   │    ├── EJS Templates (SSR)                                       │   │
│   │    └── Puppeteer (Headless Chrome for PDF)                       │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│         ↓              ↓               ↓                                │
│   PostgreSQL       Redis           n8n (External)                       │
│   (Primary DB)     (Sessions/      (Workflow Orchestration)             │
│                    Cache/Queue)                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Environment Variables

All environment variables are validated via Zod schema in `src/config/env.ts`.

### 2.1 Required Variables

| Variable | Description | Example |
|:---------|:------------|:--------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/floovioo?schema=public` |
| `SESSION_SECRET` | Express session encryption key (min 32 chars) | `your-super-secret-session-key-here` |
| `STRIPE_SECRET_KEY` | Stripe API secret key | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | `whsec_...` |
| `STRIPE_PUBLIC_KEY` | Stripe publishable key | `pk_live_...` |

### 2.2 Application Settings

| Variable | Default | Description |
|:---------|:--------|:------------|
| `NODE_ENV` | `development` | Environment mode (`development`, `production`, `test`) |
| `PORT` | `3002` | HTTP server port |
| `APP_URL` | `http://localhost:3002` | Public-facing URL (used for OAuth, emails, PDFs) |
| `ARCHITECTURE_VERSION` | `v1` | Feature flag: `v1` (legacy) or `v2` (new engines) |

### 2.3 Redis (Optional but Recommended)

| Variable | Default | Description |
|:---------|:--------|:------------|
| `REDIS_URL` | (none) | Redis connection URL. Falls back to in-memory if not provided. |

> **Production Warning**: Without Redis, sessions won't persist across restarts and rate limiting will be process-local.

### 2.4 QuickBooks Online Integration

| Variable | Description |
|:---------|:------------|
| `QBO_CLIENT_ID` | QuickBooks OAuth App Client ID |
| `QBO_CLIENT_SECRET` | QuickBooks OAuth App Client Secret |
| `QBO_WEBHOOK_VERIFIER_TOKEN` | Token for verifying QBO webhook payloads |

### 2.5 Email (SMTP)

| Variable | Default | Description |
|:---------|:--------|:------------|
| `SMTP_HOST` | (none) | SMTP server hostname |
| `SMTP_PORT` | (none) | SMTP port (usually 587 for TLS) |
| `SMTP_USER` | (none) | SMTP authentication username |
| `SMTP_PASS` | (none) | SMTP authentication password |
| `FROM_EMAIL` | `no-reply@floovioo.com` | Sender email address |
| `FROM_NAME` | `Floovioo` | Sender display name |

### 2.6 n8n / AI Webhooks

| Variable | Description |
|:---------|:------------|
| `TRANSACTIONAL_WEBHOOK_URL` | Default n8n webhook for transactional events |
| `AI_GENERATION_WEBHOOK_URL` | n8n webhook for AI document generation |
| `AI_WEBHOOK_SECRET` | Shared secret for n8n callback authentication |

### 2.7 Social Auth (All Optional)

| Variable | Description |
|:---------|:------------|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` | Facebook OAuth |
| `LINKEDIN_KEY` / `LINKEDIN_SECRET` | LinkedIn OAuth |

### 2.8 Security & Monitoring

| Variable | Description |
|:---------|:------------|
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins |
| `SENTRY_DSN` | Sentry error tracking DSN |
| `INITIAL_ADMIN_PASSWORD` | Password for seeded admin accounts (optional, auto-generated if missing) |

---

## 3. Database Management

### 3.1 Connection String Format
```
postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=${DB_SCHEMA}
```

In production, SSL is auto-appended: `?sslmode=require`

### 3.2 Migrations
```bash
# Check migration status
npx prisma migrate status

# Apply pending migrations
npx prisma migrate deploy

# Generate Prisma Client after schema changes
npx prisma generate
```

### 3.3 Database Seeding
```bash
# Full seed (Plans, Features, Services, Admin Users)
npx prisma db seed

# Specific transactional service seed
npx ts-node scripts/seed-transactional-service.ts
```

### 3.4 What Gets Seeded

| Entity | Count | Notes |
|:-------|:------|:------|
| **Plans** | 6 | Free, Teaser, Starter, Pro, Enterprise, BrandWithJojo |
| **Features** | 4 | ai_generation, pdf_conversion, api_access, unlimited_pdf |
| **Admin Users** | 6 | ROOT, CEO, COO, DEVOPS, MARKETING, SUPPORT roles |
| **Services** | 18+ | Core services including `transactional-branding`, `ai-doc-generator`, `html-to-pdf` |
| **Guest User** | 1 | For public landing page demos |

### 3.5 Backup & Restore
```bash
# Export all tables to JSON
npx ts-node scripts/export-db.ts
# Output: backups/db_export_<timestamp>.json

# Manual pg_dump (if pg_dump available)
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME -F c -f backup.dump
```

---

## 4. Docker Deployment

### 4.1 Available Compose Files

| File | Purpose |
|:-----|:--------|
| `docker-compose.yml` | Base configuration |
| `docker-compose.dev.yml` | Development with hot-reload |
| `docker-compose.local-prod.yml` | Local production simulation |
| `docker-compose.postgres.yml` | PostgreSQL + pgAdmin only |
| `docker-compose.override.yml` | Local overrides (git-ignored) |

### 4.2 Quick Start (Development)
```bash
# Start all services
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# View logs
docker-compose logs -f app

# Rebuild after code changes
docker-compose build --no-cache app
```

### 4.3 Production Deploy
```bash
# Build production image
docker build -f Dockerfile.prod -t floovioo:latest .

# Deploy with production compose
docker-compose -f docker-compose.yml -f docker-compose.local-prod.yml up -d
```

---

## 5. Service Architecture

### 5.1 Core Services (Always Required)

| Service Slug | Purpose |
|:-------------|:--------|
| `transactional-core` | Core engine for ERP event processing |
| `transactional-branding` | Document branding and delivery |
| `html-to-pdf` | HTML → PDF conversion via Puppeteer |
| `ai-doc-generator` | AI-powered document creation |

### 5.2 Service Configuration

Services are stored in the `Service` table with JSON `config` containing webhook URLs:

```typescript
{
  webhooks: {
    default: { url: 'https://n8n.../webhook/...', label: 'Catch-All' },
    invoice_created: { url: '...', label: 'Invoice Handler' },
    // ... event-specific handlers
  }
}
```

### 5.3 n8n Integration

All complex logic is delegated to n8n workflows via webhooks:
1. **Filter**: Node.js validates request, checks quotas
2. **Dispatch**: Sends standardized "Envelope" to n8n webhook
3. **Sync**: n8n calls back to `/api/internal/*` with results

---

## 6. Startup Sequence

```
1. Load environment variables (src/config/env.ts)
   └── Validate via Zod schema
   └── Exit with error if invalid

2. Initialize Prisma Client (src/lib/prisma.ts)
   └── Connect to PostgreSQL

3. Initialize Redis Client (src/lib/redis.ts)
   └── Falls back to in-memory if unavailable

4. Configure Express middleware (src/index.ts)
   ├── Helmet (Security headers)
   ├── CORS (API routes only)
   ├── Session (Redis or Memory store)
   ├── Passport (OAuth strategies)
   └── Static files (/public)

5. Mount Routes
   ├── /auth (Authentication)
   ├── /dashboard (Protected UI)
   ├── /api (REST API with API key auth)
   └── /webhooks (Stripe, QBO, n8n callbacks)

6. Start HTTP Server on PORT
```

---

## 7. Health Checks

| Endpoint | Purpose |
|:---------|:--------|
| `GET /` | Landing page (confirms app is running) |
| `GET /api/me` | Auth check (returns current user or 401) |
| `GET /debug/user` | Session debug info (dev only) |

---

## 8. Common Operations

### 8.1 Reset Database (Development Only!)
```bash
# WARNING: Destroys all data
npx prisma migrate reset --force
```

### 8.2 Sync Stripe Plans
Stripe plans are the source of truth. Run the sync after changing plans in Stripe:
```bash
npx ts-node scripts/sync-stripe-plans.ts
```

### 8.3 Clear Redis Cache
```bash
redis-cli FLUSHDB
```

### 8.4 View Prisma Studio (DB GUI)
```bash
npx prisma studio
# Opens at http://localhost:5555
```

---

## 9. Troubleshooting

| Symptom | Likely Cause | Solution |
|:--------|:-------------|:---------|
| App exits immediately | Invalid env vars | Check console for Zod validation errors |
| 404 on `/dashboard/transactional/templates` | Missing `transactional-branding` service in DB | Run `npx ts-node scripts/seed-transactional-service.ts` |
| Sessions not persisting | Redis not configured | Set `REDIS_URL` or accept memory-store limitations |
| PDF generation fails | Puppeteer not installed | Ensure Chromium deps are installed in container |
| OAuth redirects fail | Incorrect `APP_URL` | Must match registered OAuth callback URL exactly |

---

## 10. File Structure (Key Paths)

```
floovioo/
├── environments/           # Environment files
│   ├── .env                # Active config (git-ignored)
│   ├── .env.development    # Dev template
│   └── .env.docker.local   # Docker local config
├── prisma/
│   ├── schema.prisma       # Database schema
│   ├── seed.ts             # Database seeder entry
│   └── migrations/         # SQL migrations
├── scripts/
│   ├── export-db.ts        # Backup script
│   ├── seed-transactional-service.ts
│   └── sync-stripe-plans.ts
├── src/
│   ├── config/env.ts       # Environment validation
│   ├── services/seeder.service.ts  # Seeding logic
│   └── index.ts            # App entry point
└── docker-compose*.yml     # Docker configurations
```

---

## 11. Quick Reference Commands

```bash
# Development
npm run dev:all          # Start app + watch mode

# Production Build
npm run build            # Compile TypeScript
npm start                # Run compiled app

# Database
npx prisma migrate deploy    # Apply migrations
npx prisma db seed           # Seed database
npx prisma studio            # Open DB GUI

# Docker
docker-compose up -d         # Start containers
docker-compose logs -f app   # Tail logs
docker-compose down          # Stop containers
```
