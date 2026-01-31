# Refactoring Plan: SaaS Architecture Hardening

This plan aims to refactor the current Node.js/TypeScript/Prisma application to meet high-standard SaaS requirements, ensuring modularity, scalability, and strict separation of concerns (MVC + Services + Repositories).

## Phase 1: Architectural Foundation & Standards

- [x] **Establish Directory Structure** <!-- id: 7 -->
    - Created `src/repositories`, `src/services`, `src/dtos`, `src/types`.
    - *Files Created*:
        - `src/repositories/base.repository.ts`
        - `src/services/base.service.ts`

- [x] **Standardize Error Handling** <!-- id: 16 -->
    - Created `AppError` class.
    - Refactored `src/middleware/error.middleware.ts`.
    - *Files Created/Edited*:
        - `src/lib/AppError.ts`
        - `src/middleware/error.middleware.ts`

## Phase 2: Data Access Layer (Repositories)
*Goal: Decouple database logic (Prisma) from business logic. No `prisma.*` calls outside this layer.*

- [x] **User & Tenant Repository** <!-- id: 26 -->
    - *Files*: `src/repositories/user.repository.ts`

- [x] **App & API Key Repository** <!-- id: 30 -->
    - *Files*: `src/repositories/app.repository.ts`

- [x] **Usage & Logging Repository** <!-- id: 34 -->
    - *Files*: `src/repositories/log.repository.ts`

- [x] **Subscription & Plan Repository** <!-- id: 38 -->
    - *Files*: `src/repositories/subscription.repository.ts`

## Phase 3: Business Logic Layer (Services)
*Goal: Handle domain logic, validation, and orchestration. No HTTP objects (`req`, `res`) here.*

- [x] **Auth Service** <!-- id: 45 -->
    - *Files*: `src/services/auth.service.ts`

- [x] **App Management Service** <!-- id: 50 -->
    - *Files*: `src/services/app.service.ts`

- [x] **Usage & Quota Service** <!-- id: 55 -->
    - *Files*: `src/services/quota.service.ts`

- [x] **PDF Service (Core Feature)** <!-- id: 60 -->
    - *Files*: `src/services/pdf.service.ts`

## Phase 4: Controller Refactoring
*Goal: Thin controllers. Parse Request -> Call Service -> Send Response.*

- [ ] **Apps Controller**
    - *Files*: `src/controllers/apps.controller.ts`
    - *Refactor*: Remove `prisma` calls. Inject `AppService`. Use `try/catch` with `next(err)`.

- [ ] **Auth Controller**
    - *Files*: `src/controllers/auth.controller.ts`
    - *Refactor*: Delegate to `AuthService`.

- [ ] **PDF Controller**
    - *Files*: `src/controllers/pdf.controller.ts`
    - *Refactor*: Delegate conversion logic to `PdfService`.

## Phase 5: Validation & DTOs
*Goal: Type-safe request validation.*

- [ ] **Implement Zod Schemas**
    - *Files*: `src/schemas/auth.schema.ts`, `src/schemas/app.schema.ts`.
    - *Action*: Create middleware to validate `req.body` against schemas.

## Phase 6: Testing & Quality Assurance

- [ ] **Unit Tests**
    - *Files*: `tests/services/app.service.test.ts`, `tests/repositories/user.repository.test.ts`.
    - *Action*: Test business logic in isolation.

- [ ] **Integration Tests**
    - *Files*: `tests/routes/api.test.ts`.
    - *Action*: Test full API flow.

## Immediate Implementation Steps
1. Create `AppError` and `BaseRepository`.
2. Implement `UserRepository` and `AppRepository`.
3. Refactor `AppsController` to use `AppService` (which uses `AppRepository`).
