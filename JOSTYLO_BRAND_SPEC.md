# Jostylo Application UI & Brand Specification

**Version:** 2.0 (SaaS UI Focus)
**Status:** DRAFT
**Date:** 2026-01-18

---

## 1. Core Positioning: "The Operating System for Business Expression"
Jostylo is not a "tool" you visit to do a task; it is a **system** you configure to run your business. The UI must reflect this shift from "creation" to "governance".

*   **Old Mental Model (Tool):** "I need to design an invoice."
*   **New Mental Model (System):** "I need to ensure all my invoices follow the system."

### The "Define, Apply, Automate" Philosophy
Every screen in the application should map to one of these three modes:
1.  **Define:** Setting the rules (Brand Standards, Templates, logic).
2.  **Apply:** Using the rules (Creating a document, sending an invoice).
3.  **Automate:** Enforcing the rules (Workflows, API integrations, bulk actions).

---

## 2. SaaS UI Philosophy

### "System over Canvas"
*   **Avoid:** Blank canvases, confusing toolbars, "creative" clutter.
*   **Embrace:** Form-based configuration, split-pane previews, rigid but beautiful structure.
*   **Why:** We are selling *consistency*, not creative freedom. The UI should feel like a cockpit, not an easel.

### "Control over Generative Chaos"
*   **Avoid:** "Generate with AI" buttons that feel like magic tricks with random results.
*   **Embrace:** "Apply Standards" or "Assemble Document" actions. AI is a background accelerator, not the protagonist.
*   **Visuals:** Use status indicators (e.g., "Brand Compliant", "Standards Applied") to reinforce the system's value.

### "Integration-First"
*   The UI should constantly acknowledge external data sources.
*   Invoices shouldn't just be "New Invoice"; they should be "Invoice #1023 from QuickBooks".
*   This builds trust that Jostylo understands the user's existing ecosystem.

---

## 3. Application Architecture & Navigation

The navigation should be organized by **Module**, not by "file type".

### Global Navigation (Sidebar/Top Bar)
1.  **Dashboard (Command Center):** High-level view of system health and activity.
2.  **Brand & Standards (Define):** Where users configure their identity.
3.  **Documents (Apply):** The comprehensive library of managed assets.
4.  **Workflows (Automate):** The mechanics of distribution and logic.
5.  **Connections (Integrate):** QuickBooks, Xero, CRM link status.

---

### Module 1: Brand & Standards ("Define")
*   **UI Metaphor:** The "Constitution" or "Rulebook".
*   **Key Screens:**
    *   **Identity Core:** Logo, Colors, Typography (presented as strict rules, not suggestions).
    *   **Tone of Voice:** Configurable rules for text generation (e.g., "Always formal", "Never use emojis").
    *   **Template Library:** The 'Master' templates. These are locked down and versioned.

### Module 2: The Document Editor ("Apply")
*   **Goal:** Assemble a compliant document as fast as possible.
*   **UI Layout:**
    *   **Left Pane (Context):** Data inputs, integration source selector (e.g., "Select Invoice from Xero"), or raw text/prompt.
    *   **Center Pane (Preview):** High-fidelity, read-only (or minimally editable) preview of the document.
    *   **Right Pane (The "Jostylo" System):** AI suggestions, brand compliance checks, styling options (constrained to the brand).
*   **Key Interaction:** User changes data on the left -> System applies rules -> Preview updates on the right.
*   **Avoid:** Drag-and-drop elements that allow users to break the grid.

### Module 3: Workflows ("Automate")
*   **UI Metaphor:** Pipelines or Flowcharts.
*   **Key Screens:**
    *   **Triggers:** "When Xero Invoice is Created..."
    *   **Actions:** "Apply 'Standard Invoice' Template" -> "Email to Client".
    *   **Logs:** Trail of every automated action for audit purposes.

---

## 4. Dashboard Design Principles
The Dashboard is the first thing they see. It must look like a **Command Center**, not a file explorer.

*   **Status, not just Recent Files:** Show "System Status" (e.g., "All Brand Standards Active", "QuickBooks Connected").
*   **Activity Feed:** "generated Invoice #204", "Updated Brand Colors", "Workflow 'Monthly Report' executed".
*   **Value Metrics:** "142 Documents Standardized this month", "30 hours saved".
*   **Quick Actions:** "Create New...", "Update Standards".

---

## 5. UI Terminology Guide
Words matter. Use language that reinforces the "System" positioning.

| Don't Use | Do Use | Why? |
| :--- | :--- | :--- |
| **New Project** | **New Document** | Projects imply unique, one-off effort. Documents imply standard assets. |
| **Design / Create** | **Assemble / Compose** | We are assembling data into a brand, not designing art. |
| **Generate** | **Apply Standards** | "Generate" sounds ephemeral/AI-hype. "Apply" sounds reliable. |
| **My Brand** | **Brand Standards** | "Standards" implies governance and enforcement. |
| **Settings** | **System Config** | Elevates the importance of the configuration. |

---

## 6. Visual Interface Guidance

### Color & Typography
*   **Primary Interface:** Neutral, dark-mode friendly "IDE-like" or "Professional" aesthetic (Clean Whites, Cool Greys).
*   **Accent Color:** Uses the user's *own* brand color for highlights if possible, or a "Jostylo Blue/Teal" to signify *System* actions.
*   **Typography:** Monospaced fonts for data/IDs (e.g., Invoice Numbers) to feel technical. Clean sans-serif for UI.

### Components
*   **Status Badges:** Use them liberally (e.g., "Synced", "Compliant", "Draft", "Published").
*   **Split Views:** Crucial for showing "Data" vs "Result".
*   **Data Tables:** Dense, information-rich tables for document lists (like Stripe or Linear), not card grids (like Canva).
