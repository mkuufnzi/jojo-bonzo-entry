# Optimization & Scaling Guide

## 1. Architecture Overview
This application is designed to run in a containerized environment, connecting to shared infrastructure services (`postgres`, `redis`) on an external Docker network (`db_net`).

### Critical External Dependencies
- **Postgres**: Primary database.
- **Redis**: Used for Session Management, Caching, and Rate Limiting.

---

## 2. Guest User Optimization (High Priority)
**Problem**: tracking usage for "Guest" users via database `COUNT(*)` queries creates massive lock contention and performance degradation under load.

**Solution**: Switch to **Ephemeral Redis-based Session Tracking**.

### Implementation Strategy
1.  **Identify Guests**: Use `express-session` ID or a signed cookie.
2.  **Track Usage in Redis**:
    - Key: `rate_limit:guest:{sessionId}`
    - Value: `integer` (incremented on each request)
    - TTLinSeconds: `86400` (1 day) or `3600` (1 hour) for reset.
3.  **Bypass Database**:
    - Modify middleware to check Redis *before* touching the Database.
    - Only sync to DB (if needed) asynchronously via a background job, or effectively treat guest data as ephemeral logs.

### Recommended `GuestLimiterMiddleware` Logic
```typescript
import { redisClient } from '../lib/redis'; // Assumed redis client wrapper

const GUEST_LIMIT = 5;

export const guestLimiter = async (req, res, next) => {
  if (req.user) return next(); // Skip for logged-in users

  const sessionId = req.sessionID; 
  const key = `guest:usage:${sessionId}`;

  const currentUsage = await redisClient.incr(key);
  
  if (currentUsage === 1) {
    await redisClient.expire(key, 86400); // Set expiry on first use
  }

  if (currentUsage > GUEST_LIMIT) {
    return res.status(429).json({ error: "Guest limit reached. Please sign up." });
  }

  next();
};
```

---

## 3. Scaling & Performance

### Application (Stateless)
- The Node.js app is stateless (sessions stored in Redis).
- **Scale Out**: You can run multiple replicas of the `app` container behind a load balancer (e.g., Nginx, Traefik).
- **Graceful Shutdown**: Ensure `SIGTERM` signals are handled to close DB connections and finish pending requests.

### Database (Postgres)
- **Connection Pooling**: Use `PgBouncer` (transaction pooling) if connection limits become untameable.
- **Indexes**: Ensure `Authorization`, `UsageLog`, and `Session` tables are properly indexed.

### Job Queue (PDF Generation)
**Risk**: Puppeteer is resource-heavy. Heavy concurrent use will crash the API container.
**Fix**: Offload PDF generation to a worker.

1.  **Producer (API)**:
    - Instead of `await pdfService.generate()`, do `await pdfQueue.add({ url, options })`.
    - Return a `jobId` to the client.
2.  **Consumer (Worker)**:
    - Separate Node.js process listening to `pdfQueue`.
    - Runs Puppeteer in a controlled environment (limiting concurrency to 1-2 browser instances per worker).
3.  **Client Polling**:
    - Client polls `/api/jobs/:id` to check for completion and download the URL.

---

## 4. Docker Network Configuration
Ensure your externally managed services are on `db_net` and aliases are set correctly.

**Example External Redis**:
- Host: `redis` (container name)
- Port: `6379`

**Example External Postgres**:
- Host: `postgres` (or `db`)
- Port: `5432`
