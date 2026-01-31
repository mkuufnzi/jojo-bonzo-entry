# E2E Browser Test Checklist

## Test Credentials
- Email: bwj.floovioo.test@gmail.com
- Password: 37V@9bCX7z

## Web Routes to Test

### Landing & Public
- [ ] / (Homepage)
- [ ] /pricing
- [ ] /docs
- [ ] /privacy

### Authentication
- [ ] /auth/login (Login flow)
- [ ] /auth/register (Registration page)
- [ ] /auth/logout

### Dashboard (Protected)
- [ ] /dashboard (Main dashboard)
- [ ] /dashboard/apps (App management)

### Services (Protected + Quota Check)
- [ ] /services/ai-doc-generator
- [ ] /services/html-pdf

### Profile & Subscription
- [ ] /profile
- [ ] /subscription

## API Routes for Reference
- GET /api/usage
- POST /api/ai/generate
- POST /api/pdf/convert
- GET /api/jobs/:id

## Test Status: IN_PROGRESS
