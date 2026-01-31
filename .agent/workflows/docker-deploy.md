---
description: Deploy application to Docker (dev, local-prod, or VPS production)
---

# Docker Deployment Workflow

## Preflight Check (MANDATORY)

Before any Docker build, run the preflight check:

```bash
npm run preflight
```

This validates:
1. Dependencies installed
2. Prisma client generated
3. TypeScript compiles
4. Build succeeds
5. dist/index.js exists
6. dist/views exists
7. Environment file exists

// turbo-all

## Development in Docker

```bash
# Option 1: npm script (runs preflight first)
npm run docker:dev

# Option 2: Direct compose
docker-compose -f docker-compose.dev.yml up --build
```

## Local Production Test

```bash
# Test production build with local PostgreSQL/Redis
npm run docker:local-prod
```

## VPS Production Deployment

```bash
# On VPS
git pull origin main
npm run docker:prod

# Add to Nginx Proxy Manager:
# Source: afs-tools.automation-for-smes.com
# Destination: http://afs_doc_tools:3002
```

## Troubleshooting

### Prisma Client Mismatch
If you see errors about missing Prisma types:
```bash
# Stop all containers
docker-compose down

# Regenerate Prisma
npx prisma generate

# Rebuild
npm run docker:dev
```

### Permission Errors on Prisma Generate
Stop the running dev server before regenerating Prisma client:
```bash
# Ctrl+C to stop dev server
npx prisma generate
```
