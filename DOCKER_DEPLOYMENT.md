# Docker Deployment Guide

## Quick Reference

| Environment | Compose File | Env File | Use Case |
|:---|:---|:---|:---|
| **Dev in Docker** | `docker-compose.dev.yml` | `.env.development` | Development with hot reload |
| **Local Production** | `docker-compose.local-prod.yml` | `.env.production.local` | Test prod builds locally |
| **VPS Production** | `docker-compose.yml` | `.env.production` | Full production deployment |

---

## 1. Development in Docker

Run your local codebase in a container with hot-reload:

```bash
docker-compose -f docker-compose.dev.yml up --build
```

**Features:**
- Mounts source code for hot-reload
- Uses local PostgreSQL (via `host.docker.internal`)
- Includes local Redis container
- Port: `http://localhost:3002`

---

## 2. Local Production Test

Test production builds against local infrastructure:

```bash
docker-compose -f docker-compose.local-prod.yml up --build
```

**Features:**
- Production build with Chrome for PDF generation
- Connects to local PostgreSQL and Redis
- Same container behavior as VPS production

---

## 3. VPS Production Deployment

### Prerequisites
1. VPS with Docker and Docker Compose
2. Nginx Proxy Manager running
3. External networks: `proxy_net`, `db_net`

### Deploy
```bash
# On VPS
git pull origin main
docker-compose up -d --build
```

### Nginx Proxy Manager Setup
Add proxy host:
- **Source:** `afs-tools.automation-for-smes.com`
- **Destination:** `http://afs_doc_tools:3002`
- **SSL:** Let's Encrypt

---

## PostgreSQL Multi-Tenant Provisioning

For new tenants, run the provisioning script:

```bash
# Usage
./scripts/provision-tenant.sh <tenant_name> <password> [db_host] [db_port]

# Example
./scripts/provision-tenant.sh acme_corp "SecurePass123!" localhost 5432
```

This creates:
- Role: `<tenant>_admin`
- Database: `<tenant>`
- Schema: `<tenant>_schema`
- Full isolation from other tenants

---

## Environment Variables

Key variables to configure:

| Variable | Dev | Local Prod | VPS Prod |
|:---|:---|:---|:---|
| `DATABASE_URL` | Local PG | `host.docker.internal` | `postgres` container |
| `REDIS_URL` | Local Redis | `host.docker.internal` | `redis` container |
| `APP_URL` | `localhost:3002` | `localhost:3002` | HTTPS domain |
| `STRIPE_*` | Test keys | Test keys | Live keys |
