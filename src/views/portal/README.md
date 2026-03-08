# Interactive Portal Views

This folder contains the views for the customer-facing **Public Portal**.

## Portal Layout (`layouts/portal-layout.ejs`)
A premium, glassmorphic layout designed for interaction.
- **Tailwind-Powered**: Uses a dynamic color scheme derived from the business's `themeData`.
- **Sidebar Support**: Features a persistent status card and n8n chat integration hub.
- **Responsive**: Mobile-first design with floating action bars.

## Support Hub (`support.ejs`)
The central hub for customer assistance.
- **n8n Chat Integration**: Opens an Alpine.js-powered modal for real-time AI assistance.
- **Secure Links**: Provides pre-signed `mailto` links for document-specific inquiries.

## Action Status (`status.ejs`)
A post-interaction feedback page.
- **Success Feedback**: Branded pages confirm when a product is added to an order or a request is processed.
- **ERP Syncing Indicator**: Visually communicates that the business back-office is being updated in real-time.
