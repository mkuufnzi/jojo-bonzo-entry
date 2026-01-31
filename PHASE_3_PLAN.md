# Phase 3: Business Logic Layer Implementation Plan

This plan details the steps to implement the Service Layer, moving business logic out of controllers and ensuring a clean separation of concerns.

## 1. AuthService Implementation
- [ ] **Create `src/services/auth.service.ts`**
    - Dependencies: `UserRepository`
    - Methods:
        - `register(data: RegisterDTO): Promise<User>`
            - Check if email exists.
            - Hash password.
            - Create user via `UserRepository`.
        - `login(data: LoginDTO): Promise<{ user: User, token: string }>` (or session handling)
            - Find user by email.
            - Verify password.
            - Return user (and token if API).
        - `validateUser(id: string): Promise<User | null>`
- [ ] **Refactor `src/controllers/auth.controller.ts`**
    - Inject `AuthService`.
    - Replace direct Prisma/Repository calls with `AuthService` methods.

## 2. AppService Implementation
- [ ] **Create `src/services/app.service.ts`**
    - Dependencies: `AppRepository`, `ServiceRepository`
    - Methods:
        - `createApp(userId: string, name: string, description?: string): Promise<App>`
            - Generate API Key.
            - Create app via `AppRepository`.
        - `regenerateApiKey(appId: string, userId: string): Promise<App>`
            - Verify ownership.
            - Generate new key.
            - Update app.
        - `enableService(appId: string, serviceId: string, userId: string): Promise<void>`
            - Verify ownership.
            - Link service to app.
- [ ] **Refactor `src/controllers/app.controller.ts`**
    - Inject `AppService`.
    - Replace logic with service calls.

## 3. UsageService Implementation
- [ ] **Create `src/services/usage.service.ts`**
    - Dependencies: `LogRepository`, `SubscriptionRepository`
    - Methods:
        - `trackUsage(appId: string, serviceId: string, tokens: number): Promise<void>`
        - `getUsageStats(userId: string, startDate: Date, endDate: Date): Promise<UsageStats>`
- [ ] **Refactor `src/controllers/analytics.controller.ts`**
    - Inject `UsageService`.

## 4. PDFService Implementation
- [ ] **Create `src/services/pdf.service.ts`**
    - Methods:
        - `processPdf(file: Buffer, options: any): Promise<Result>`
        - (Abstracts away the specific PDF library used)

## 5. Dependency Injection & Cleanup
- [ ] Ensure all services are properly instantiated (Singleton or per-request).
- [ ] Verify no direct Prisma calls remain in Controllers.
