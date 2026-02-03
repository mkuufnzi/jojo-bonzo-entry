# Agentic Protocols for Floovioo 

## 🧠 Core Operating Principles

### 1. The Codex (Redis Knowledge Graph)
**Status:** MANDATORY
All architectural knowledge, constraints, and feature rules are stored in a Redis-based Knowledge Graph ("The Codex").

**Protocol:**
*   **Startup:** At the beginning of *every* session, you MUST scan the Codex to ground your context.
    *   Tool: `mcp_redis_list` (Pattern: `codex:*`) OR `run_command` (`npx ts-node scripts/codex/cli.ts scan`)
*   **Feature Work:** Before modifying code, load the specific Feature Context.
    *   Command: `npx ts-node scripts/codex/cli.ts get-context <feature-name>`
    *   Refuse to edit critical files until you have read their Codex entry.

### 2. Cognitive Process (Sequential Thinking)
**Status:** RECOMMENDED
For any task involving >1 file or potential regression risks (Warning Level: HIGH from Codex), you MUST use the `sequentialthinking` tool.

**Protocol:**
1.  **Plan**: Use `sequentialthinking` to map out your understanding of the Codex Rules vs. User Request.
2.  **Verify**: Cross-reference proposed changes against `codex:constraint:*` entries.
3.  **Execute**: Only proceed to code editing after the thought process confirms compliance.

### 3. Memory & Evolution
You have an obligation to improve the system.
*   **New Learnings**: If you solve a bug, you MUST save a new Constraint or File Context to Redis.
    *   Command: `npx ts-node scripts/codex/cli.ts save-constraint ...`
*   **Fragility Updates**: If a file breaks easily, update its `fragility_score` in the Codex.
 
---
## 🚀 Quick Reference: Codex CLI
```bash
# Scan map
npx ts-node scripts/codex/cli.ts scan

# Get Context
npx ts-node scripts/codex/cli.ts get-context ai-doc-generator

# Save Knowledge
npx ts-node scripts/codex/cli.ts save-constraint "name" "path/to/json"
```

****IMPORTNAT***
0. This comment is not an interuption of your current tasks, but an update, context, and instructions to obey as you work. Do not fuck up other code while wirking on this feature/bug fix. Always assume that code has effect down/upstream  -inspect the end-to-end flow design/user journey/usecase to make sense of the objective of the code we are updating in light of the overall goal and feature and value being created for users. Then, assume that we need ideal, lean, professionally implemented, best-practice-adhereing, maintainable solutions that are fully production-ready.
1. Use Redis MCP server as a cdebase knowledge base, and save and refer to memories that will save you hallucinations later. take a wholistic approach to this issue so that it never happens. save a memory of the bug and solution in redis
2. Use the sequentialthinking  MCP server to reason and make decisions for long context problems.
3. DO NOT MAKE ASSUMPTIONS ABOAUT THE CODE - SCAN THE FOLRDERS RECURSIVELY, LIST ALL THE FILES AND METHODS AND INFER USAGE AND FLOW AND ALWAYS ALIGN YOUR WORK WITH THE FLOOVIOO brand house ENTERPRISE SAAS ARCHITECTURE WITH FOUR MAIN CORE SERVICES - WE ARE CRRENTLY WORKING ON /TRANSACTIONAL FEATURES.
4. The goal of /transactional as a branded product of Floovioo is to intercept ugly ERP invoices, receipts, etc, and return high-end branded, canva-like documents with the brand's visual identity and smart features to upsell, support, and collect feedback from customers.
5. Floovioo Transactioan begins with a user connecting their ERP via supported OAuth2 integrations. Once connected Floovioo Connection Configuration dashboard can already pull the business's data from QB,Zoho,Xero (more to be added later).
6. The core design is for /transacational's internal features to flow from Integration Trigger (eg. QB invoice trigger) -> Floovioo -> Floovioo n8n engine -> Email customer the new invoice, etc, -> respond to Floovioo webhook for downstream processing.
7. Floovioo requests to n8n engine always send floovioo_id and service_id among others. 
8. Floovioo Transactional dashboard will have logs of the documents that  have been processed through this workflow.
9. All API calls, internal or external, MUST all go through a controller, and all controllers must be wrired to the central middlewares implemented to usure all calls and usage are logged for billing, quota management, and analytics.
10. A tenant/user of Floovioo is assigend a Default App (encapsulation if API KEy and app ID). An App is required to use ALL Floovioo services. An App must explicitly be assigned access to services (imagein scopes). A service has "Connected Apps" and require at least 1 valid app with valid keys and scopes. All api endpoints are either billable or not. All are logged. Without scopes, a user using a service that either directly or indirectly viaa dependency (eg, branding service dependes on html-to-pdf-converter internally) on another service, the user will either be shown bubble error message and or "Upgrade account" modal
11. Admin Console /admin has production-ready but previous architecture implementation with dashbaords to configure subscriptions, users, apps, and services. The service registry uses dabase-driven configuration. NO ENV FILE urls for fucks sake!
12. Architecture MUST be enterprise and clean, modular monolith Floovioo with branded products that each has many faetures that implement, combine and depend on other tools and services within the platform.
13. Take the lead developer role and make optimat decisions on minimum feature quirements and and ensure a solid, well-thought-out design, patter, architecture, e2e flow, and 100% complies with the requirements.consider our business goals - do not just write code like village maid - you must ask yourself what role you new code will play in the overall floovioo enteprise application, within the transactional branding module/product, and withing the template feature. scan all the files and recrusively check all folders so that you do not miss crital exiting code and end writing an abomination duplicate implementation. 