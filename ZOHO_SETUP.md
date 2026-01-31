# Zoho OAuth Setup Guide for Floovioo

To enable real connection with Zoho Books/CRM, you need to register your application in the Zoho Developer Console.

## 1. Register the App
1. Go to [Zoho Developer Console](https://api-console.zoho.com/).
2. Click **"Add Client"**.
3. Choose **"Server-based Applications"**.
4. Fill in the details:
   - **Client Name**: `Floovioo` (or your app name)
   - **Homepage URL**: `http://localhost:3002`
   - **Authorized Redirect URIs**: 
     ```
     http://localhost:3002/onboarding/api/business/oauth/callback/zoho
     ```
     *(Note: This MUST match exactly what is in your .env file)*

## 2. Get Credentials
1. After creation, you will see a **Client Secret** tab.
2. Copy the **Client ID**.
3. Copy the **Client Secret**.

## 3. Update Environment
Open `d:\apps\websites\saas\afs_doc_tools_source\environments\.env.development` and paste the values:

```properties
ZOHO_CLIENT_ID=1000.XXXXXXXXXXXX
ZOHO_CLIENT_SECRET=XXXXXXXXXXXX
ZOHO_REDIRECT_URI=http://localhost:3002/onboarding/api/business/oauth/callback/zoho
```

## 4. Verify
Restart your server (`npm run dev:all`) to ensure the new `.env` values are loaded.
