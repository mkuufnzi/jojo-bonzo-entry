# Controllers

This directory contains the controller classes that handle incoming HTTP requests. Controllers are responsible for:
1.  Extracting data from the request (body, query, params).
2.  Calling the appropriate services to perform business logic.
3.  Sending the appropriate HTTP response (JSON or rendered view).

## Files

-   `pdf.controller.ts`: Handles PDF generation requests. Validates input, calls `PdfService`, logs usage, and streams PDF.
-   `auth.controller.ts`: Handles user authentication flows (login, register, verify, logout).
-   `dashboard.controller.ts`: Manages the user dashboard view and data.
-   `form.controller.ts`: Handles form submissions (e.g., "Notify Me" forms) and triggers webhooks/emails.
-   `landing.controller.ts`: Renders public landing pages and tool-specific pages.
-   `user.controller.ts`: Manages user profile and settings.
-   `billing.controller.ts`: Handles billing and subscription logic.
