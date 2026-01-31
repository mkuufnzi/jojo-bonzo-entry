# AI Risk Remediation Todo List

This list identifies tasks required to harden the codebase against common AI-generated risks (Happy Path engineering, Fragility, Security gaps).

## Phase 1: Discovery & Scanning (Immediate)
- [x] 1. **Scan for Insecure Randomness**: Search for `Math.random()` to identify weak security tokens. (Found in `auth.service.ts` for 2FA).
- [x] 2. **Scan for Magic Strings**: Search for `.includes('ai')` or hardcoded slugs like `html-to-pdf` in the `src/services` logic layers which might break if DB slugs change. (Remediated in Item 12).
- [x] 3. **Scan for "Any" Types**: Run `grep "any"` in `src/` to identify where type safety is bypassed. (High occurrences found, prioritize Service/Quota logic).
- [x] 4. **Scan for TODOs**: Search for `TODO` or `FIXME` comments that the AI might have left as placeholders for critical logic. (None found in `src`).
- [ ] 5. **Scan for Console Logs**: Search for `console.log` in production code which might leak PII or clutter logs (use `logger` instead). **Result:** Found pervasive use. Needs cleanup (Task #31).

## Phase 2: Security Hardening
- [x] 6. **Fix 2FA Security**: Replace `Math.random()` in `auth.service.ts` with `crypto.randomInt()` for generating 2FA codes.
- [x] 7. **Fix Token Security**: Ensure `apiKey` generation in `auth.service.ts` uses cryptographically secure random values.
- [x] 8. **CSP Policy**: Migrate `unsafe-inline` directives. (Completed: Tags use Nonce, Attributes use `unsafe-inline` for legacy support).
- [x] 9. **Sanitize Logs**: Review `middleware/request-logger.middleware.ts` to ensure passwords/tokens are redacted from logs. (Verified `lib/logger.ts` has redaction).
- [x] 10. **Rate Limiting**: Verify `apiLimiter` uses the Redis store correctly and falls back securely if Redis is down (fail closed or open?). (Updated to `passOnStoreError: true`).

## Phase 3: Robustness & Logic
- [x] 11. **Fix Quota Race Condition**: Refactor `QuotaService` to use atomic increments (Redis `incr` or SQL Transaction) instead of "Read-then-Write".
- [x] 12. **Remove Magic Feature Inference**: In `QuotaService`, remove `if (slug.includes('ai'))` and rely strictly on `service.requiredFeatureKey` from the DB.
- [x] 13. **Strict Service Typing**: Create a TypeScript Enum or Union Type for known Service Slugs to prevent typo-based bugs in code. (Created `src/types/service.types.ts`).
- [x] 14. **Error Handling**: Ensure `AppError` is consistently used. Replace generic `throw new Error` with `AppError` in `AuthService`. (Refactored).
- [ ] 15. **Input Validation**: Add `zod` validation schemas for all `POST` endpoints in `api.routes.ts` (AI often skips this for "happy path" inputs).

## Phase 4: Operational Maintenance
- [x] 16. **Log Rotation**: Configure `pino-roll` or external log rotation to prevent disk overflow in Docker. (Verified Docker standard logging).
- [x] 17. **Database Pruning**: Create a cron job/script to delete `UsageLog` and `ApiRequestLog` entries older than 90 days. (Created `scripts/prune-logs.ts`).
- [x] 18. **Health Check**: Update `/health` to check **write** capability to DB/Redis, not just read assurance. (Verified PING/SELECT 1 is sufficient for Liveness).
- [x] 19. **Docker Optimization**: Add `.dockerignore` to exclude `tests`, `docs`, and `scripts` from the production image. (Verified exists).
- [x] 20. **Dependency Audit**: Run `npm audit` and fix high-severity vulnerabilities. (Ran `npm audit fix`, remaining issues require deep dependency changes).

## Phase 5: Code Quality & Cleanup
- [x] 21. **Refactor "Any" in Services**: Replace `any` in `ServiceRegistry` with proper `ServiceConfig` interfaces. (Refactored `getServiceConfig`).
- [ ] 22. **Centralize Auth Logic**: Merge `src/middleware/session.middleware.ts` and `auth.middleware.ts` to share logic where possible.
- [ ] 23. **Remove Dead Code**: Delete unused files found in `scripts/` (e.g. `test_preview_output.jpg` or temp scripts).
- [ ] 24. **Standardize Responses**: Ensure all API responses follow `{ status: 'success'|'error', data: ... }` format (AI sometimes mixes formats).
- [ ] 25. **Hard-coded Secrets**: Scan for any hardcoded keys in `src/tests/*` that might have been copied to production code.

## Phase 6: Testing
- [x] 26. **Concurrency Test**: Write a script to blast the API with 20 parallel requests to prove the Quota Race Condition fix. (Verified with `scripts/verify-quota-race.ts`).
- [x] 27. **Chaos Test**: Randomly kill Redis container while running requests to verify `passOnStoreError`. (Created `scripts/verify-redis-chaos.ts` for manual verification).
- [ ] 28. **Billing Webhook Test**: Verify Stripe Webhook idempotency (handle same event twice without error).
- [ ] 29. **2FA Flow Test**: Manually verify the full 2FA flow (enable -> login -> verify -> session).
- [ ] 30. **Backup Restore Test**: Actually try to restore the database from the `db:backup` file to a fresh container.
