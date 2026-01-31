# Floovioo : The Ultimate Production Deployment & Operations Guide

## Table of Contents
1. **Introduction & Vision**
2. **Phase 1: Environment & Infrastructure Provisioning**
    - 2.1 Virtual Private Server (VPS) Selection
    - 2.2 Host OS Hardening
    - 2.3 Docker Engine & Compose Residency
3. **Phase 2: The Environment Matrix (Detailed Config)**
    - 3.1 Understanding `.env.production`
    - 3.2 Security & Secrets Management
4. **Phase 3: Service Orchestration**
    - 4.1 The App Service (Express/Node.js)
    - 4.2 The Worker Service (Puppeteer/Task Execution)
    - 4.3 The Redis Cache (Persistence & Queuing)
5. **Phase 4: Database Provisioning & Evolution**
    - 5.1 PostgreSQL Connectivity & Networks
    - 5.2 Prisma Schema Synchronization
    - 5.3 Seeding the SaaS Foundation
6. **Phase 5: The Edge Layer (Reverse Proxy & SSL)**
    - 6.1 Nginx Proxy Manager Mastery
    - 6.2 SSL Termination & Certificate Management
    - 6.3 Header Optimization for WebSockets & Sessions
7. **Phase 6: External Integrations (Stripe & Social Auth)**
    - 7.1 Stripe Webhook & Product Syncing
    - 7.2 Google, Facebook, and X OAuth Configuration
8. **Phase 7: The Production Deployment Pipeline (Manual & ZIP)**
    - 8.1 Packaging for Success
    - 8.2 The Remote Rebuild Sequence
9. **Critical Challenges & Expert Resolutions**
    - 9.1 Disk Space & Build Cache Bloat
    - 9.2 Prisma Schema Mismatches
    - 9.3 Social Auth `redirect_uri_mismatch`
    - 9.4 Memory Exhaustion during PDF Processing
10. **Maintenance, Monitoring & Backup Strategy**

---

## 1. Introduction & Vision
Deploying a modern SaaS like **Floovioo ** is more than just moving files to a server; it is about orchestrating a multi-service stack that remains resilient under load. This application combines high-performance PDF processing via Puppeteer, AI content generation, and a complex billing/subscription engine. This guide is built from the "scars" of real-world deployments on VPS environments, specifically focusing on how to avoid the "works on my machine" syndrome and ensuring a 99.9% uptime for your end users.

---

## 2. Phase 1: Environment & Infrastructure Provisioning

### 2.1 Virtual Private Server (VPS) Selection
For Floovioo , choosing the right hardware is paramount. Because we use Puppeteer to render PDFs, the application spawns headless Chrome instances. These are CPU and RAM intensive.
- **Recommended**: 4 vCPUs and 8GB RAM.
- **Minimum**: 2 vCPUs and 4GB RAM (may struggle with heavy PDF rendering).
- **Storage**: SSD or NVMe is mandatory. Prisma and PostgreSQL performance depends on high IOPS for log writing and query execution.

### 2.2 Host OS Hardening
Before running Docker, ensure your host OS (Ubuntu 22.04 LTS recommended) is up to date:
```bash
sudo apt update && sudo apt upgrade -y
```
Setup a UFW firewall to block all traffic except ports 80 (HTTP), 443 (HTTPS), and your SSH port.

### 2.3 Docker Engine & Compose Residency
Install the latest Docker engine. Avoid the "snap" version of Docker as it can have permission issues with volumes.
```bash
# Correct install sequence
sudo apt-get install ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
# ... Add repository and install docker-ce, docker-ce-cli, containerd.io, docker-buildx-plugin, docker-compose-plugin
```

---

## 3. Phase 2: The Environment Matrix (Detailed Config)

### 3.1 Understanding `.env.production`
Every variable in this file is a lever that changes application behavior.

#### A. Core Application Settings
- `PORT=3002`: The internal port the container listens on. Match this in your Docker Compose `expose` section.
- `APP_URL`: Must be the absolute HTTPS URL (e.g., `https://afs-tools.com`). If this ends in a trailing slash, some OAuth providers may fail. **Be consistent.**

#### B. The Database Chain
- `DATABASE_URL`: format: `postgresql://USER:PASSWORD@HOST:PORT/DB?schema=NAME`.
- **Challenge**: In Docker, `HOST` is not `localhost`. It is the service name of your database container or its network alias (e.g., `postgres`).
- **Resolution**: Use `postgres` as the hostname if the DB is in the same compose file, or use the alias assigned in your internal networks.

#### C. Billing & Identity
- `STRIPE_SECRET_KEY`: The live `sk_live_...` key.
- `STRIPE_WEBHOOK_SECRET`: Used to verify that events coming into `/webhook/stripe` are actually from Stripe. Without this, anyone could spoof a "payment successful" event.

### 3.2 Security & Secrets Management
- `SESSION_SECRET`: A 32+ character random string. Changing this in production will log out every active user.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: Generated in Google Cloud Console. These must exactly match the "Web Application" credentials type.

---

## 4. Phase 3: Service Orchestration

### 4.1 The App Service (Express/Node.js)
The `app` service is the "brain." It handles sessions, renders EJS templates, and provides the API. 
- **Configuration**: `app.set('trust proxy', 1)` is crucial here. Since Nginx handles SSL and then forwards traffic to the App, Express needs to know it can trust the headers like `X-Forwarded-Proto`.

### 4.2 The Worker Service (Puppeteer)
The `worker` service is our "muscle." It listens to the Redis queue for conversion jobs.
- **Challenge**: "Browser Disconnected" errors.
- **Resolution**: The `Dockerfile` must install `google-chrome-stable` and all its dependencies. Our Dockerfile leverages `node:18-slim` and manually adds Chromium to keep the image size manageable while ensuring it has the required shared libraries (`libxss1`, `libatk-bridge`, etc.).

### 4.3 The Redis Cache
Redis acts as the central nervous system.
- **Queuing**: BullMQ uses Redis to manage jobs.
- **Sessions**: Using `connect-redis` ensures that even if you restart the `app` container, users don't get logged out.

---

## 5. Phase 4: Database Provisioning & Evolution

### 5.1 Prisma Schema Synchronization
Prisma is the core of our data integrity. 
- **The Challenge**: You add a `currency` column to the `Plan` model. You deploy. The application crashes because the SQL table doesn't have that column.
- **The Resolution**: Post-deployment, always verify the schema.
```bash
docker exec afs-tools npx prisma db push --accept-data-loss
```
This command maps your `schema.prisma` directly to the SQL database. The `--accept-data-loss` flag is often needed if you are making non-null columns without defaults, but use it with **extreme caution** on live data.

### 5.2 Seeding
Seeding is not just for development. In production, it ensures your system features correspond to your Stripe prices.
```bash
docker exec afs-tools npm run db:seed
```
This script populates the `Service`, `Plan`, and `PlanFeature` tables. If you don't run this, users will log into an empty dashboard with "No Services Available."

---

## 6. Phase 5: The Edge Layer (Reverse Proxy & SSL)

### 6.1 Nginx Proxy Manager (NPM) Mastery
NPM is the most user-friendly way to manage production SSL.
1. Create a `Proxy Host`.
2. Connect it to `afs_doc_tools` on port `3002`.
3. Select "Websockets Support" (important for real-time status updates).

### 6.2 SSL Termination
Use Let's Encrypt certificates. **Challenge**: Certificate renewal failures.
**Resolution**: Ensure port 80 is open to the internet. Let's Encrypt needs to hit your server via port 80 to verify ownership before it issues a certificate for 443.

---

## 7. Phase 6: External Integrations

### 7.1 Stripe Webhook & Product Syncing
1. Go to Stripe Dashboard -> Developers -> Webhooks.
2. Add an endpoint: `https://yourdomain.com/webhook/stripe`.
3. Select events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`.
4. Grab the "Signing Secret" and put it in your `.env.production`.

### 7.2 Social Auth Nuances
- **Facebook**: Requires a valid Privacy Policy URL strictly matching the domain.
- **Google**: Requires "Authorized JavaScript Origins" to list both `https://domain.com` and `https://www.domain.com`.

---

## 8. Phase 7: The Production Deployment Pipeline

### 8.1 Packaging for Success
A manual ZIP-based flow is robust for VPS environments.
```powershell
# PowerShell script to package source only
$exclude = @("node_modules", "dist", ".git", "deploy.zip", ".env.development")
Compress-Archive -Path (Get-ChildItem -Path * -Exclude $exclude) -DestinationPath deploy.zip -Force
```

---

## 9. Critical Challenges & Expert Resolutions

### 9.1 Disk Space & Build Cache Bloat
Docker builds on VPS servers with limited storage will eventually fail. 
- **Challenge**: Every time you run `--build`, Docker creates layers. These consume GBs over time.
- **Resolution**: Daily or per-deploy cleanup:
```bash
docker system prune -f
docker builder prune -f
```

### 9.2 Social Auth `redirect_uri_mismatch`
This is the single most common error in production.
- **Challenge**: Google sees a request from `http://72.62...` but expects `https://domain.com`.
- **Resolution**: Set `APP_URL` correctly AND check `trust proxy` in `index.ts`. If the proxy isn't trusted, Passport believes the secure connection ended at the Nginx level and defaults to `http`.

---

## 10. Maintenance, Monitoring & Backup Strategy

### 10.1 Logging & Observability
In a production environment, logs are your only window into the "black box" of your containers.
- **Docker Logs**: Use `docker logs -f afs-tools --tail 100` to monitor live traffic. Look for `[SAE Audit]` lines to verify cost attribution and `[ServiceAccess]` lines to verify security gates.
- **Persistent Log Storage**: By default, Docker logs can grow until they fill the disk. Configure log rotation in `/etc/docker/daemon.json`:
  ```json
  {
    "log-driver": "json-file",
    "log-opts": {
      "max-size": "10m",
      "max-file": "3"
    }
  }
  ```

### 10.2 Database Backups & Disaster Recovery
Never rely solely on Docker volumes. If a container is pruned or a volume is mapped incorrectly, data is at risk.
- **Local SQL Dumps**: Create a cron job on the VPS that executes `pg_dump` inside the container:
  ```bash
  # Example Cron Job (runs at 2 AM daily)
  0 2 * * * docker exec afs-db pg_dump -U saas_admin saas_db > /backups/db_$(date +\%F).sql
  ```
- **Off-site Backups**: Use a tool like `rclone` to sync the `/backups` directory to an Amazon S3 bucket or Google Cloud Storage.

### 10.3 Performance Monitoring
Monitor the RAM usage of the `worker` service.
- **Challenge**: Multiple simultaneous heavy PDF renders can cause the container to exceed its RAM limit, leading to an OOM (Out Of Memory) kill.
- **Resolution**: Adjust the `deploy: resources: limits:` section in your Docker Compose if you find the worker restarting frequently.

---

## 11. Operational Excellence: The SaaS Lifecycle

### 11.1 Patching & Dependency Updates
SaaS applications are targets for security vulnerabilities. Monthly, you should:
1. Update local dependencies: `npm update`.
2. Re-test all authentication flows.
3. Deploy to production using the ZIP flow, ensuring a `--build --no-cache` run to pull updated base images (like `node:18-slim` security patches).

### 11.2 SSL Certificate Lifecycle
Nginx Proxy Manager handles Let's Encrypt renewals, but you must ensure that your DNS provider (Cloudflare, GoDaddy, etc.) still points correctly to your VPS IP. If you change IPs, your certificates will fail to renew, causing a total site outage.

### 11.3 Rate Limiting & DDOS Protection
We use `express-rate-limit` backed by Redis.
- **In Production**: If you find legitimate users being blocked, increase the `max` requests in `src/middleware/rateLimit.middleware.ts`.
- **Bot Mitigation**: If you see thousands of requests from a single IP in your logs, use NPM's "Access Lists" or "Block List" features to shield the application.

---

## 12. Conclusion & Operational Checklist

Provisioning Floovioo  is a journey that starts with infrastructure and ends with user satisfaction. By adhering to the principles of **Environmental Consistency**, **Automatic Schema Syncing**, and **Proactive Monitoring**, you transition from a "developer with a server" to a "SaaS Operator."

### The "Golden Rule" of Deployment
> **Never modify production files directly.**
> Always make changes locally, commit to git, package a fresh ZIP, and deploy via the established rebuild pipeline. This ensures your local development environment and production state remain twins, making debugging significantly easier.

---
*End of Deployment Guide. Version 2.0 - Finalized Documentation.*

