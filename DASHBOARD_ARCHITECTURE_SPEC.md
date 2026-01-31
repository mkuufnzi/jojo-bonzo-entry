# Floovioo Multi-Dashboard Architecture Specification
## Version 1.0 | January 2026

---

## 📋 Executive Summary

This specification outlines the refactoring of Floovioo's single-dashboard architecture into a **multi-dashboard platform** where each core service pillar has its own dedicated dashboard with contextual navigation, specialized tooling, and service-specific workflows.

### Key Objectives
1. Transform from a "tools collection" to a **suite of purpose-built applications**
2. Enable **service-specific UX** tailored to each persona (Finance, Sales, CS, Marketing)
3. Create a scalable architecture for future service additions
4. Maintain a unified **Enterprise Hub** for cross-service management

---

## 🏗️ Current Architecture Analysis

### Existing Dashboard Structure
```
/dashboard                    → dashboard_v2.ejs (Main overview)
/dashboard/transactional      → dashboard/services/transactional.ejs (stub)
/dashboard/sales              → dashboard/services/sales.ejs (stub)
/dashboard/retention          → dashboard/services/retention.ejs (stub)
/dashboard/content            → dashboard/services/content.ejs (stub)
/services/:slug               → services/default.ejs (Tool execution pages)
```

### Current Sidebar Navigation
```javascript
// Current sidebar.ejs navItems
const navItems = [
  { label: 'Overview', href: '/dashboard', icon: 'layout-dashboard' },
  { label: 'Apps & Keys', href: '/apps', icon: 'key' },
  { label: 'Billing', href: '/billing', icon: 'credit-card' },
  { label: 'Subscription', href: '/subscription', icon: 'zap' }
];

// Plus dynamic "Documents & Workflow" section from availableServices[]
```

### Current Service Tools (from /services/ views)
| File | Purpose |
|------|---------|
| `html-pdf.ejs` | HTML to PDF converter |
| `pdf-converter.ejs` | PDF manipulation tool |
| `ai-doc-generator.ejs` | AI-powered document generation |
| `default.ejs` | Generic service template |

### Pain Points
- **Flat hierarchy**: All tools listed equally regardless of category
- **No contextual navigation**: Sidebar doesn't adapt to current workflow
- **Generic UX**: Same interface for invoicing, reports, and content
- **No workflow orchestration**: Tools are isolated, not connected

---

## 🎯 Target Architecture

### Multi-Dashboard Model

```
┌─────────────────────────────────────────────────────────────┐
│                    ENTERPRISE HUB                           │
│         /dashboard (Cross-service overview)                 │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐  │
│  │   📄     │    📊    │    🤝    │    📣    │    🔌    │  │
│  │ Trans.   │  Sales   │ Retain.  │ Content  │   API    │  │
│  └────┬─────┴────┬─────┴────┬─────┴────┬─────┴────┬─────┘  │
└───────│──────────│──────────│──────────│──────────│────────┘
        ▼          ▼          ▼          ▼          ▼
┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐
│TRANSACT.  │ │  SALES    │ │ RETENTION │ │  CONTENT  │ │    API    │
│DASHBOARD  │ │ DASHBOARD │ │ DASHBOARD │ │ DASHBOARD │ │ DASHBOARD │
│           │ │           │ │           │ │           │ │           │
│ ┌───────┐ │ │ ┌───────┐ │ │ ┌───────┐ │ │ ┌───────┐ │ │ ┌───────┐ │
│ │Sidebar│ │ │ │Sidebar│ │ │ │Sidebar│ │ │ │Sidebar│ │ │ │Sidebar│ │
│ │(ctx)  │ │ │ │(ctx)  │ │ │ │(ctx)  │ │ │ │(ctx)  │ │ │ │(ctx)  │ │
│ └───────┘ │ │ └───────┘ │ │ └───────┘ │ │ └───────┘ │ │ └───────┘ │
│           │ │           │ │           │ │           │ │           │
│ [Tools]   │ │ [Tools]   │ │ [Tools]   │ │ [Tools]   │ │ [Tools]   │
│ [Config]  │ │ [Builder] │ │ [Analytics│ │ [Generate]│ │ [Docs]    │
│ [Schedule]│ │ [Files]   │ │ [Triggers]│ │ [Library] │ │ [Keys]    │
│ [Logs]    │ │ [Team]    │ │ [QBRs]    │ │ [Schedule]│ │ [Logs]    │
└───────────┘ └───────────┘ └───────────┘ └───────────┘ └───────────┘
```

---

## 📁 Proposed File Structure

```
src/views/
├── dashboard/
│   ├── enterprise/
│   │   ├── index.ejs              # Enterprise Hub overview
│   │   └── settings.ejs           # Cross-service settings
│   │
│   ├── transactional/
│   │   ├── index.ejs              # Transactional dashboard home
│   │   ├── templates.ejs          # Template library
│   │   ├── data-sources.ejs       # ERP/CRM connections
│   │   ├── workflows.ejs          # Automation rules
│   │   ├── schedule.ejs           # Batch scheduling
│   │   ├── analytics.ejs          # Usage analytics
│   │   └── tools/
│   │       ├── invoice-brander.ejs
│   │       ├── receipt-generator.ejs
│   │       └── manifest-creator.ejs
│   │
│   ├── sales/
│   │   ├── index.ejs              # Sales dashboard home
│   │   ├── builder.ejs            # Report/Deck builder (drag-drop)
│   │   ├── files.ejs              # File management
│   │   ├── pipelines.ejs          # Delivery pipelines
│   │   ├── team.ejs               # Team assignments
│   │   └── tools/
│   │       ├── proposal-generator.ejs
│   │       ├── case-study-builder.ejs
│   │       └── deck-creator.ejs
│   │
│   ├── retention/
│   │   ├── index.ejs              # Retention dashboard home
│   │   ├── qbr-automation.ejs     # QBR builder
│   │   ├── health-scores.ejs      # Customer health tracking
│   │   ├── triggers.ejs           # Churn trigger rules
│   │   ├── onboarding.ejs         # Onboarding flow builder
│   │   └── tools/
│   │       ├── qbr-report.ejs
│   │       ├── usage-report.ejs
│   │       └── renewal-deck.ejs
│   │
│   ├── content/
│   │   ├── index.ejs              # Content dashboard home
│   │   ├── library.ejs            # Content library
│   │   ├── schedule.ejs           # Publishing schedule
│   │   ├── analytics.ejs          # Content performance
│   │   └── tools/
│   │       ├── social-post-generator.ejs
│   │       ├── infographic-builder.ejs
│   │       └── testimonial-creator.ejs
│   │
│   └── api/
│       ├── index.ejs              # API dashboard home
│       ├── keys.ejs               # API key management
│       ├── logs.ejs               # Request logs
│       ├── webhooks.ejs           # Webhook configuration
│       ├── docs.ejs               # Interactive API docs
│       └── examples.ejs           # Code examples
│
├── partials/
│   ├── sidebars/
│   │   ├── enterprise-sidebar.ejs
│   │   ├── transactional-sidebar.ejs
│   │   ├── sales-sidebar.ejs
│   │   ├── retention-sidebar.ejs
│   │   ├── content-sidebar.ejs
│   │   └── api-sidebar.ejs
│   │
│   └── dashboard/
│       ├── service-switcher.ejs   # Global service selector
│       ├── breadcrumbs.ejs        # Navigation breadcrumbs
│       └── context-header.ejs     # Service-specific header
```

---

## 🧭 Navigation Architecture

### Enterprise Hub Sidebar (Global)
```
┌─────────────────────────┐
│ 🏢 FLOOVIOO ENTERPRISE  │
├─────────────────────────┤
│ ⌂ Overview              │
│ 📊 Analytics            │
│ 👥 Team Management      │
│ 🔐 Security             │
│ 💳 Billing              │
├─────────────────────────┤
│ SERVICES                │
│ ├─ 📄 Transactional     │→ Opens Transactional Dashboard
│ ├─ 📊 Sales Enablement  │→ Opens Sales Dashboard
│ ├─ 🤝 Retention         │→ Opens Retention Dashboard
│ ├─ 📣 Content Engine    │→ Opens Content Dashboard
│ └─ 🔌 API Console       │→ Opens API Dashboard
└─────────────────────────┘
```

### Transactional Branding Sidebar
```
┌─────────────────────────┐
│ 📄 TRANSACTIONAL        │
│    ← Back to Hub        │
├─────────────────────────┤
│ ⌂ Overview              │
│ 📋 Templates            │
│ 🔗 Data Sources         │
│ ⚡ Automation Rules     │
│ 📅 Batch Scheduler      │
│ 📈 Analytics            │
├─────────────────────────┤
│ BRANDING TOOLS          │
│ ├─ Invoice Brander      │
│ ├─ Receipt Generator    │
│ ├─ Packing Slip         │
│ └─ Shipping Manifest    │
├─────────────────────────┤
│ SETTINGS                │
│ ├─ Upsell Features      │ ← Configure plan-gated features
│ └─ Brand Assets         │
└─────────────────────────┘
```

### Sales Enablement Sidebar (Renamed: "Floovioo Canvas")
```
┌─────────────────────────┐
│ 🎨 FLOOVIOO CANVAS      │
│    Design-Free Reports  │
│    ← Back to Hub        │
├─────────────────────────┤
│ ⌂ Dashboard             │
│ 🏗️ Report Builder       │ ← Drag-drop visual builder
│ 📁 File Manager         │
│ 🚀 Delivery Pipelines   │
│ 👥 Team & Assignments   │
│ 🔔 Notifications        │
├─────────────────────────┤
│ QUICK CREATE            │
│ ├─ Proposal             │
│ ├─ Case Study           │
│ ├─ Pitch Deck           │
│ └─ Contract             │
├─────────────────────────┤
│ DATA SOURCES            │
│ ├─ Salesforce           │
│ ├─ HubSpot              │
│ └─ + Connect CRM        │
└─────────────────────────┘
```

### Customer Retention Sidebar
```
┌─────────────────────────┐
│ 🤝 RETENTION            │
│    ← Back to Hub        │
├─────────────────────────┤
│ ⌂ Health Overview       │
│ 📊 QBR Automation       │
│ 🚀 Onboarding Flows     │
│ ⚠️ Churn Triggers       │
│ 📈 Success Metrics      │
├─────────────────────────┤
│ GENERATE                │
│ ├─ QBR Report           │
│ ├─ Usage Summary        │
│ ├─ Renewal Proposal     │
│ └─ Training Guide       │
├─────────────────────────┤
│ INTEGRATIONS            │
│ ├─ Zendesk              │
│ ├─ Intercom             │
│ ├─ Mixpanel             │
│ └─ + Add Source         │
└─────────────────────────┘
```

### Content Engine Sidebar
```
┌─────────────────────────┐
│ 📣 CONTENT ENGINE       │
│    ← Back to Hub        │
├─────────────────────────┤
│ ⌂ Content Hub           │
│ 📚 Library              │
│ 📅 Publishing Schedule  │
│ 📈 Performance          │
├─────────────────────────┤
│ CREATE                  │
│ ├─ Social Post          │
│ ├─ Infographic          │
│ ├─ Testimonial Card     │
│ ├─ Data Visualization   │
│ └─ Newsletter Block     │
├─────────────────────────┤
│ AUTOMATIONS             │
│ ├─ Weekly Digest        │
│ ├─ Metric Highlights    │
│ └─ + New Automation     │
└─────────────────────────┘
```

### API Console Sidebar
```
┌─────────────────────────┐
│ 🔌 API CONSOLE          │
│    ← Back to Hub        │
├─────────────────────────┤
│ ⌂ Overview              │
│ 🔑 API Keys             │
│ 🪝 Webhooks             │
│ 📋 Request Logs         │
│ 📊 Usage Analytics      │
├─────────────────────────┤
│ DOCUMENTATION           │
│ ├─ Getting Started      │
│ ├─ Authentication       │
│ ├─ Endpoints            │
│ └─ SDKs                 │
├─────────────────────────┤
│ EXAMPLES                │
│ ├─ Node.js              │
│ ├─ Python               │
│ ├─ cURL                 │
│ └─ Postman Collection   │
└─────────────────────────┘
```

---

## 🛣️ Route Structure

```typescript
// src/routes/dashboard.routes.ts (Proposed)

// Enterprise Hub
router.get('/', DashboardController.enterpriseHub);
router.get('/analytics', DashboardController.enterpriseAnalytics);
router.get('/team', DashboardController.enterpriseTeam);
router.get('/settings', DashboardController.enterpriseSettings);

// Transactional Branding
router.get('/transactional', TransactionalController.index);
router.get('/transactional/templates', TransactionalController.templates);
router.get('/transactional/data-sources', TransactionalController.dataSources);
router.get('/transactional/workflows', TransactionalController.workflows);
router.get('/transactional/schedule', TransactionalController.schedule);
router.get('/transactional/analytics', TransactionalController.analytics);
router.get('/transactional/tools/:slug', TransactionalController.tool);

// Sales Enablement (Floovioo Canvas)
router.get('/canvas', CanvasController.index);
router.get('/canvas/builder', CanvasController.builder);
router.get('/canvas/files', CanvasController.files);
router.get('/canvas/pipelines', CanvasController.pipelines);
router.get('/canvas/team', CanvasController.team);
router.get('/canvas/create/:type', CanvasController.create);

// Retention
router.get('/retention', RetentionController.index);
router.get('/retention/qbr', RetentionController.qbrAutomation);
router.get('/retention/onboarding', RetentionController.onboarding);
router.get('/retention/triggers', RetentionController.triggers);
router.get('/retention/tools/:slug', RetentionController.tool);

// Content Engine
router.get('/content', ContentController.index);
router.get('/content/library', ContentController.library);
router.get('/content/schedule', ContentController.schedule);
router.get('/content/create/:type', ContentController.create);

// API Console
router.get('/api', ApiConsoleController.index);
router.get('/api/keys', ApiConsoleController.keys);
router.get('/api/webhooks', ApiConsoleController.webhooks);
router.get('/api/logs', ApiConsoleController.logs);
router.get('/api/docs/:section?', ApiConsoleController.docs);
```

---

## 🧩 Component Architecture

### Sidebar Factory Pattern
```typescript
// src/services/sidebar.factory.ts

interface SidebarConfig {
  service: 'enterprise' | 'transactional' | 'canvas' | 'retention' | 'content' | 'api';
  currentPath: string;
  user: User;
}

export class SidebarFactory {
  static create(config: SidebarConfig): SidebarData {
    switch (config.service) {
      case 'transactional':
        return this.buildTransactionalSidebar(config);
      case 'canvas':
        return this.buildCanvasSidebar(config);
      // ... etc
    }
  }
  
  private static buildTransactionalSidebar(config: SidebarConfig): SidebarData {
    return {
      header: { icon: 'file-text', title: 'Transactional', backLink: '/dashboard' },
      sections: [
        {
          title: null, // No title for main nav
          items: [
            { label: 'Overview', href: '/dashboard/transactional', icon: 'home' },
            { label: 'Templates', href: '/dashboard/transactional/templates', icon: 'layout' },
            // ...
          ]
        },
        {
          title: 'Branding Tools',
          items: this.getTransactionalTools(config.user)
        }
      ]
    };
  }
}
```

### Layout Pattern
```ejs
<!-- src/views/layouts/dashboard-layout.ejs -->

<%- include('../partials/head', { title: pageTitle }) %>

<body class="bg-gray-100 min-h-screen font-sans">
    <%- include('../partials/sidebars/' + sidebarType + '-sidebar', { 
        currentPath: currentPath,
        user: user 
    }) %>

    <div id="mainContent" class="flex flex-col min-h-screen">
        <%- include('../partials/dashboard/context-header', {
            service: currentService,
            breadcrumbs: breadcrumbs
        }) %>

        <main class="flex-1 py-6">
            <%- body %>
        </main>
    </div>

    <%- include('../partials/sidebar-script') %>
</body>
```

---

## 🔄 Migration Strategy

### Phase 1: Foundation (Week 1-2)
- [ ] Create sidebar factory service
- [ ] Implement dashboard layout template
- [ ] Build service-specific sidebars
- [ ] Set up route structure

### Phase 2: Enterprise Hub (Week 2-3)
- [ ] Migrate current dashboard_v2.ejs to enterprise/index.ejs
- [ ] Add service switcher component
- [ ] Implement cross-service analytics

### Phase 3: Transactional Dashboard (Week 3-4)
- [ ] Build template management UI
- [ ] Create data source connections
- [ ] Implement workflow builder
- [ ] Add batch scheduling

### Phase 4: Sales Canvas (Week 4-5)
- [ ] Build drag-drop report builder
- [ ] Implement file management
- [ ] Create delivery pipelines
- [ ] Add team assignment features

### Phase 5: Remaining Dashboards (Week 5-7)
- [ ] Retention dashboard features
- [ ] Content engine features
- [ ] API console features

### Phase 6: Polish & QA (Week 7-8)
- [ ] Responsive design verification
- [ ] Performance optimization
- [ ] Accessibility audit
- [ ] User testing

---

## 📐 Design Specifications

### Color Coding by Service
| Service | Primary Color | Accent | Icon |
|---------|--------------|--------|------|
| Enterprise | `#0B1121` | `#2563EB` | `building` |
| Transactional | `#2563EB` | `#3B82F6` | `file-text` |
| Canvas (Sales) | `#7C3AED` | `#A855F7` | `palette` |
| Retention | `#059669` | `#10B981` | `heart-handshake` |
| Content | `#EA580C` | `#F97316` | `megaphone` |
| API | `#0891B2` | `#06B6D4` | `terminal` |

### Mobile-First Breakpoints
```css
/* Sidebar behavior */
@media (max-width: 1023px) {  /* lg breakpoint */
  .sidebar { /* Drawer mode - hidden by default */ }
}

@media (min-width: 1024px) {
  .sidebar { /* Persistent sidebar */ }
}
```

---

## 🔐 Permission Model

```typescript
interface ServicePermissions {
  transactional: {
    view: boolean;
    edit: boolean;
    schedule: boolean;
    admin: boolean;
  };
  canvas: {
    view: boolean;
    create: boolean;
    manageTeam: boolean;
    admin: boolean;
  };
  // ... etc
}
```

Each dashboard checks permissions and shows/hides features accordingly.

---

## 📝 Implementation Notes

### Current Sidebar (sidebar.ejs)
The existing sidebar becomes the **API Console sidebar** since it already focuses on developer-oriented features (Apps & Keys, services list).

### Backward Compatibility
- `/services/:slug` routes continue to work
- Old `/dashboard` URL redirects to `/dashboard` (Enterprise Hub)
- Deep links preserved via redirects

### State Management
- Use `localStorage` for sidebar collapse state per service
- Use `sessionStorage` for active tab within a dashboard
- Server-side rendering for initial state

---

*Specification Version: 1.0*  
*Created: January 23, 2026*  
*Author: AI Assistant + Human Developer*  
*Status: DRAFT - Awaiting Review*
