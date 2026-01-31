# n8n Webhook Configuration Guide

## 1. Webhook Trigger Setup

In your n8n workflow, configure the **Webhook** node as follows:

- **HTTP Method**: `POST`
- **Path**: The UUID part of your URL (e.g., `27d913ac-bb56-4bc2-b3df-d0669786d04e`)
- **Authentication**: `None` (We handle it manually via headers)

## 2. Authentication Logic

Our SaaS server sends a secret key in the `X-Webhook-Secret` header. You must verify this in n8n to ensure the request is coming from your server.

**Step 1: Add an "Edit Fields" (Set) Node**
Connect this immediately after the Webhook node.

**Step 2: Check the Header**
You can use an **If** node or a **Switch** node to check the header value.

- **Expression to check**: `{{ $json.headers["x-webhook-secret"] }}`
- **Expected Value**: `dev-webhook-secret-change-in-production` (This is the default value in your `.env.development` file)

> [!TIP]
> You can change this secret in your `.env` file to something more secure, just make sure to update your n8n check to match!

### 3. Webhook Trigger Configuration
- **Method**: `POST`
- **Path**: `test` (or whatever your URL path is)
- **JSON Body**: The SaaS now sends the following structured data:
```json
{
  "prompt": "Create a professional invoice for Acme Corp...",
  "context": "My company address is 123 Tech Lane...",
  "userId": "uuid-of-user",
  "documentType": "invoice",    
  "tone": "professional",       
  "theme": "blue"               
}
```
*Note: `documentType`, `tone`, and `theme` are sent by the new AI Document Generator tool. `documentType` defaults to "General" for the older tool.*

Use `{{ $json.body.prompt }}` in your LLM node (like Groq).

## 4. Response Format

Your n8n workflow **must** return JSON in this exact format using a **Respond to Webhook** node (or just the final output of the last node if using standard webhook response):

```json
{
  "success": true,
  "html": "<html><body><h1>Generated Content</h1>...</body></html>",
  "model": "llama-3.1-70b"
}
```

If generation fails, return:
```json
{
  "success": false,
  "error": "Error description"
}
```
