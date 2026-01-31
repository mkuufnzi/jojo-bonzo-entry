# Middleware

This directory contains Express middleware functions that intercept requests before they reach the controllers.

## Files

-   `auth.middleware.ts`: Handles API Key authentication for API routes.
-   `session.middleware.ts`: Handles session-based authentication for the dashboard (requires login).
-   `error.middleware.ts`: Global error handling middleware.
-   `rateLimit.middleware.ts`: Implements rate limiting to prevent abuse.
-   `upload.middleware.ts`: Configures `multer` for handling file uploads.
-   `quota.middleware.ts`: Checks user subscription quotas before allowing API usage.
-   `logging.middleware.ts`: Logs API usage to the database.
-   `notification.middleware.ts`: Injects notification counts into views.
