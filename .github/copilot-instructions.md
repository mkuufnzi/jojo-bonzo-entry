# Floovioo  - Agentic Protocols

This repository uses a **Redis-based Knowledge Graph ("The Codex")** to manage architectural constraints and prevent regressions.

**You MUST follow these protocols:**

## 1. Context Verification (Mandatory)
Before modifying any feature, you must query the Codex to understand critical constraints.

```bash
# Scan available features and constraints
npx ts-node scripts/codex/cli.ts scan

# Get specific context for the feature you are touching
# Example: If working on AI Doc Generator
npx ts-node scripts/codex/cli.ts get-context ai-doc-generator
```

## 2. Critical Architecture Rules
*   **HITL Flow**: The "AI Doc Generator" uses a strict two-phase flow (Analyze -> Generate). 
*   **Endpoint Separation**: The standard form submit calls `/analyze`. The Modal confirm button calls `/generate`. **NEVER** mix these.
*   **n8n Integration**: n8n returns data wrapped in a stringified `jobLog` field. The backend `AiService` must manually parse this. Do not remove this logic.
*   **Quotas**: Strict hard-stop enforcement. If quota is reached, the UI must reload to show the "Limit Reached" block.

## 3. Updating the Codex
If you discover a new constraint or fragility, you are responsible for updating the Codex.

```bash
# Save a new constraint
npx ts-node scripts/codex/cli.ts save-constraint "constraint-name" ./path/to/constraint.json
```

## 4. Documentation
See `HANDOVER_GUIDE.md` for the technical deep-dive.

---
**Failure to follow these protocols results in regressions.**
