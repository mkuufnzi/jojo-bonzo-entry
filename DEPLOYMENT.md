# Deployment Guide - Floovioo 

This guide covers the deployment of the Floovioo  SaaS application using Docker and PostgreSQL.

## Prerequisites

- **Node.js** (v18+) (for local dev without Docker)
- **Docker** & **Docker Compose**

---

## 1. Local Development Setup (Docker)

The easiest way to run the application locally is using Docker Compose, which spins up both the application and a PostgreSQL database.

1.  **Configure Environment**:
    - Copy `.env.example` to `.env`.
    - Ensure `DATABASE_URL` matches the local setup (or let Docker Compose override it):
      ```dotenv
      # For running "npm run dev" on host:
      DATABASE_URL="postgresql://afs_user:afs_password@localhost:5432/afs_doc_tools?schema=public"
      ```

2.  **Start Services**:
    ```bash
    docker-compose up -d
    ```
    This starts:
    - `app`: The Node.js application (port 3002)
    - `db`: PostgreSQL database (port 5432)

3.  **Run Migrations**:
    Since the database is fresh, you need to push the schema:
    ```bash
    docker-compose exec app npx prisma migrate dev --name init
    ```

4.  **Access App**:
    Open `http://localhost:3002`.

---

## 2. Production Deployment (VPS)

Target Domain: `afs-tools.automation-for-smes.com`

### Step 1: Prepare the VPS
Ensure Docker and Docker Compose are installed.

### Step 2: Clone & Configure
1.  Clone the repository to your VPS.
2.  Create `.env` from `.env.example`.
3.  Update `.env` with production values.

### Step 3: Database Setup (Existing Postgres)
If you are connecting to an **existing PostgreSQL** on your VPS (as requested):

1.  **Create User and Database**:
    Log in to your Postgres instance:
    ```bash
    sudo -u postgres psql
    ```
    Run the following SQL commands:
    ```sql
    CREATE USER afs_user WITH PASSWORD 'your_secure_password';
    CREATE DATABASE afs_doc_tools;
    GRANT ALL PRIVILEGES ON DATABASE afs_doc_tools TO afs_user;
    \c afs_doc_tools
    GRANT ALL ON SCHEMA public TO afs_user;
    ```

2.  **Update Configuration**:
    - Edit `docker-compose.yml`:
      - Remove the `db` service if you don't need a new container.
      - Update `DATABASE_URL` in the `app` service environment to point to your existing DB host (e.g., host IP or network alias).
    - Or simply update `.env` and ensure `docker-compose.yml` uses it.

### Step 4: Build and Run
```bash
docker-compose up -d --build app
```

### Step 5: Database Migration
Run migrations inside the container:
```bash
docker-compose exec app npx prisma migrate deploy
```

---

## 3. Nginx Configuration (Reverse Proxy)

Set up Nginx to proxy traffic from `afstools.automation-for-smes.com` to the container.

```nginx
server {
    listen 80;
    server_name afstools.automation-for-smes.com;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

**SSL (Certbot):**
```bash
sudo certbot --nginx -d afstools.automation-for-smes.com
```
