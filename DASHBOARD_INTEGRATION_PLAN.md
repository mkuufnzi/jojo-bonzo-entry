# Dashboard Integration Plan

## Overview
This plan outlines the integration of the previous legacy dashboard functionality (Billing, Apps, Subscriptions, Overview) into the new multi-pillar enterprise architecture. The goal is to create a unified user experience where core management tools are always accessible while maintaining the dedicated specialized dashboards.

## Identified Alignment Gaps
*   **Navigation**: Legacy dashboard used a single `sidebar` partial; new system needs a context-aware sidebar (Hub vs. Service context).
*   **Layout Resolution**: Recently fixed, but needs to be consistent across all migrated views.
*   **AI Accessibility**: AI Document Generator was a standalone page; it must now be a persistent "global utility" right sidepanel.
*   **Data Consistency**: The `UsageService` needs to provide data for the new Hub Overview to match the old `dashboard_v2` stats.
*   **Service Linkage**: The "Manage Services" logic for Apps needs to be synchronized with the new Service Registry.

## Design Decisions
1.  **Enterprise Hub (The "/dashboard" anchor)**:
    *   Migrate `dashboard_v2` content to `src/views/dashboard/hub.ejs`.
    *   Sidepanel links: Overview, Apps & Keys, Billing, Subscription.
2.  **Global AI Sidepanel**:
    *   New partial: `src/views/partials/dashboard/ai-sidepanel.ejs`.
    *   Injected into `dashboard-layout.ejs`.
    *   Triggered via a "Magic" icon in the topbar.
3.  **Route Mapping**:
    *   `/dashboard` -> Hub Overview.
    *   `/dashboard/apps` -> Integrated Apps Management.
    *   `/dashboard/billing` -> Integrated Billing (Usage/Invoices).
    *   `/dashboard/subscription` -> Integrated Subscription Management.
4.  **Component Reuse**:
    *   Reuse the logic from `apps.ejs` but skin it for the new dashboard design.
    *   Reuse Stripe integration from the legacy system for Billing/Subscription.

---

## 50-Item Todo List: Major Dashboard Refactor

### Phase 1: Foundation & Layout (Items 1-10)
1.  [ ] Update `dashboard-layout.ejs` to support a 3-column architecture (Left: Sidebar, Center: Content, Right: Global AI Sidepanel).
2.  [ ] Create `partials/dashboard/ai-sidepanel.ejs` with a minimal "Quick AI Doc" interface.
3.  [ ] Add Alpine.js state for `aiSidepanelOpen` in `dashboard-layout.ejs`.
4.  [ ] Add toggle button for AI Sidepanel in `dashboard-layout.ejs` topbar.
5.  [ ] Implement "Glassmorphism" styling for the right sidepanel to make it feel premium.
6.  [ ] Ensure responsive behavior: AI Sidepanel should become an overlay on mobile.
7.  [ ] Update `src/index.ts` to ensure all dashboard routes are protected by `isAuthenticated`.
8.  [ ] Audit `partials/head.ejs` for any missing fonts (e.g., Inter, Outfit) to match the new "WOW" aesthetics.
9.  [ ] Create a global CSS variables file specifically for the Dashboard Brand Palette.
10. [ ] Refactor `sidebar-items.ejs` to handle sub-navigation highlighting more gracefully.

### Phase 2: Hub & Overview Migration (Items 11-20)
11. [ ] Port "Account Overview" card logic from `dashboard_v2` to `hub.ejs`.
12. [ ] Integrate `Chart.js` distribution graph into the new Hub Overview.
13. [ ] Update `DashboardController.index` to fetch comprehensive stats (Usage by service, recent global logs).
14. [ ] Implement "Recently Used Tools" section in the Hub using `UsageService`.
15. [ ] Create `partials/dashboard/stat-card.ejs` for reusable dashboard metrics.
16. [ ] Add "Active Applications" summary list to the Hub Overview.
17. [ ] Ensure "Success Rate" activity indicator uses the new design system colors.
18. [ ] Style the "Recent Activity" table in `hub.ejs` with modern hover effects.
19. [ ] Add "Next Bill Date" snippet to the Hub Overview (from Subscription data).
20. [ ] Port the "Onboarding Modal" trigger to the new Hub context.

### Phase 3: Apps & API Keys Integration (Items 21-30)
21. [ ] Move `src/views/apps.ejs` to `src/views/dashboard/apps/index.ejs`.
22. [ ] Wrap and refactor Apps view with `layout('layouts/dashboard-layout')`.
23. [ ] Update `DashboardController` to provide `activeService: 'apps'` for sidepanel highlighting.
24. [ ] Redesign "Add Application" modal to match the new enterprise UI.
25. [ ] Refactor "API Key Reveal/Copy" component to be more secure and visually polished.
26. [ ] Update "Manage Services" toggles in Apps view to use the new `ServiceRegistry`.
27. [ ] Integrate "App Analytics" deep links into the new dashboard flow.
28. [ ] Implement "Empty State" for apps view when no apps exist.
29. [ ] Add "Usage Quota" indicator per app in the list view.
30. [ ] Port "Regenerate API Key" confirmation logic to use the new design components.

### Phase 4: Billing & Subscription (Items 31-40)
31. [ ] Move `src/views/billing/` and `src/views/subscription/` into the `src/views/dashboard/` hierarchy.
32. [ ] Refactor Billing/Subscription views to use the standard dashboard layout.
33. [ ] Ensure Stripe "Customer Portal" redirects work correctly within the new routing.
34. [ ] Implement unified "Usage History" view showing costs across all 4 pillars.
35. [ ] Create a "Plan Comparison" widget for the Subscription page.
36. [ ] Add "Credit Card" snippet overview to the Billing page.
37. [ ] Integrate "Invoice Download" history using the existing Stripe service.
38. [ ] Add "Transactional Branding" specific billing breakdowns (cost per PDF).
39. [ ] Implement "Pro" status badges globally based on subscription status.
40. [ ] Port the "Cancel Subscription" workflow with modern confirmation dialogs.

### Phase 5: Global AI Utility & Refinement (Items 41-50)
41. [ ] Connect `ai-sidepanel.ejs` to the `AIService` for real-time generation.
42. [ ] Implement "Drag-and-Drop" file upload in the AI sidepanel (for context-aware docs).
43. [ ] Add a "Quick Export" button in the AI panel (Download as PDF/Text).
44. [ ] Ensure AI panel remembers its state (collapsed/open) across page navigations (LocalStorage).
45. [ ] Perform a "Visual Polish" pass on all 4 service dashboards to align colors with the Hub.
46. [ ] Audit all mobile views for the new layout system.
47. [ ] Fix breadcrumb navigation for deep-nested service tools (e.g., `/dashboard/transactional/templates`).
48. [ ] Optimize dashboard load times by pre-fetching critical usage stats.
49. [ ] Run final verification tests on the Stripe payment webhooks.
50. [ ] Create a `walkthrough.md` documenting the new integrated Enterprise Hub experience.
