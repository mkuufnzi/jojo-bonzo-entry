# Services

This directory contains the core business logic of the application. Services are reusable and independent of the HTTP layer.

## Files

-   `pdf.service.ts`: Encapsulates the logic for generating PDFs using Puppeteer. Handles browser management, page rendering, and PDF options.
-   `security.service.ts`: Provides security-related utility functions, such as validating URLs to prevent SSRF attacks.
-   `auth.service.ts`: Handles user registration, login, and email verification logic.
-   `email.service.ts`: Manages sending transactional emails (verification, notifications) using Nodemailer.
-   `webhook.service.ts`: Handles sending HTTP POST triggers to external services (e.g., n8n) for events like new leads or signups.
-   `usage.service.ts`: Tracks and retrieves API usage statistics for the dashboard.
