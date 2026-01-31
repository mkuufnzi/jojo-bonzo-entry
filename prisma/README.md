# Prisma Database Configuration

This directory contains the database schema, migrations, and seeding scripts.

## Files

-   `schema.prisma`: The source of truth for the database schema. Defines models:
    -   `User`: User accounts and authentication.
    -   `App`: API keys and application settings.
    -   `UsageLog`: API usage tracking.
    -   `Plan` & `Subscription`: Billing and limits.
    -   `Lead`: Captured leads from "Coming Soon" forms.
    -   `Notification`: User notifications.
-   `seed.ts`: A script to populate the database with initial data (plans, services, test user).
-   `migrations/`: Contains the history of database schema changes.
