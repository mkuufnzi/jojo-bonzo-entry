# Floovioo  - SaaS Platform

A comprehensive document processing and automation SaaS platform. Built with Node.js, Express, TypeScript, Prisma, and EJS.

## 🚀 Features

### 🛠️ Tools & Services
1.  **HTML to PDF Converter** (Live)
    -   Convert raw HTML or URLs to pixel-perfect PDFs.
    -   Full support for CSS, custom fonts, and layout options.
    -   API access for developers.

2.  **Chat with Page** (Coming Soon)
    -   Interactive AI chat for documents (PDF, DOCX) and URLs.
    -   Summarization and Q&A capabilities.

3.  **BrandWithJojo** (Coming Soon)
    -   Automated brand asset generation.
    -   Visual identity management.

### 🔐 Authentication & User Management
-   **Secure Signup/Login**: Email & Password authentication using `bcrypt`.
-   **Email Verification**: Mandatory email verification flow before full access.
-   **Forced Signup**: Advanced features require user registration.
-   **Dashboard**: User-specific dashboard to manage API keys, view usage, and access tools.

### ⚙️ Integrations & Automation
-   **n8n Webhooks**:
    -   `new_lead`: Triggered when a user submits interest on a "Coming Soon" page.
    -   `user_registered`: Triggered when a new user signs up.
-   **Email Notifications**: Transactional emails for verification and notifications (via Nodemailer).

## 🏗️ Tech Stack

-   **Backend**: Node.js, Express.js, TypeScript
-   **Database**: SQLite (Dev) / PostgreSQL (Prod), Prisma ORM
-   **Queue/Cache**: Redis (BullMQ, Ratelimiting, Sessions)
-   **Frontend**: Server-side rendered EJS templates, TailwindCSS
-   **PDF Engine**: Puppeteer
-   **Email**: Nodemailer (SMTP)

## 🛠️ Setup & Installation

1.  **Clone the repository**
    ```bash
    git clone <repository-url>
    cd afs_doc_tools
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Environment Configuration**
    Create a `.env` file in the root directory:
    ```env
    PORT=3002
    DATABASE_URL="file:./dev.db"
    SESSION_SECRET="your-super-secret-key"
    
    # Email Configuration (Gmail App Password recommended for Dev)
    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=587
    SMTP_USER=your-email@gmail.com
    SMTP_PASS=your-app-password
    FROM_EMAIL=no-reply@afstools.com
    
    # n8n Integration
    N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/...
    ```

4.  **Database Setup**
    ```bash
    # Generate Prisma Client
    npx prisma generate

    # Run Migrations
    npx prisma migrate dev

    # Seed Database (Optional)
    npx ts-node prisma/seed.ts
    ```

5.  **Run the Application**
    ```bash
    # Development Mode
    npm run dev

    # Production Build
    npm run build
    npm start
    ```

## 📡 API Documentation

### Authentication
API requests require an `X-API-Key` header. You can generate an API key from your dashboard.

```http
X-API-Key: afs_...
```

### Endpoints (Asynchronous)

**Important**: Large operations like PDF conversion are asynchronous.

#### `POST /api/pdf/convert`
Initiates a PDF conversion job.

**Response (202 Accepted):**
```json
{
  "status": "pending",
  "jobId": "job_12345",
  "message": "PDF generation started. Poll /api/jobs/:id for result."
}
```

#### `GET /api/jobs/:id`
Checks the status of a job.

**Response:**
- **Status (200)**: `{ status: "active", progress: 50 }`
- **Complete (200)**: Returns binary PDF file.

See `API_GUIDE.md` for full details.

## 🔄 Webhooks (n8n)

The application sends POST requests to the configured `N8N_WEBHOOK_URL` for the following events:

-   **Event**: `new_lead`
    -   **Payload**: `{ email, interest, source }`
-   **Event**: `user_registered`
    -   **Payload**: `{ id, email, name, createdAt }`

## 📂 Project Structure

-   `src/controllers`: Request handlers.
-   `src/middleware`: Auth, validation, error handling.
-   `src/routes`: API route definitions.
-   `src/services`: Business logic (Puppeteer, Security).
-   `src/schemas`: Zod validation schemas.
-   `src/lib`: Shared utilities (Prisma client).
-   `prisma/`: Database schema and migrations.

## License

ISC

---

## 🤖 For AI Agents & Developers

This project is managed via an **Agentic Protocol** utilizing a Redis Knowledge Graph ("The Codex").

**Before contributing:**
1.  Read `.agent/instructions.md`.
2.  Run `npx ts-node scripts/codex/cli.ts scan` to understand active constraints.
3.  Use the `scripts/codex/` tools to synchronize your knowledge.
