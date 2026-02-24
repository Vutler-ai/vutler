# QA UI/UX Report — Vutler Admin Pages

**Date:** 2026-02-24  
**Reviewer:** Claude (subagent QA)  
**Scope:** 11 TSX pages + VutlerLayout + CSS + HTML pages + hooks

---

## Summary

- **Files reviewed:** 22 (11 pages, 1 layout, 1 CSS, 4 hooks, 1 router, 1 types, 1 index, 6 HTML)
- **Bugs found & fixed:** 9
- **Warnings/notes:** 7
- **Overall quality:** Good — clean design system, consistent patterns

---

## Bugs Fixed

### 🔴 Critical

| # | File | Issue | Fix |
|---|------|-------|-----|
| 1 | `hooks/useAgentActivity.ts` | `useEndpoint` called with template literal (`` `/api/v1/agents/${agentId}/activity` ``). RC's `useEndpoint` requires static typed paths. | Changed to `'/api/v1/agents/:id/activity' as any` with `{ id: agentId }` param |
| 2 | `hooks/useAgents.ts` | Same issue in `useAgent` — template literal in `useEndpoint` | Changed to `'/api/v1/agents/:id' as any` with `{ id: agentId }` param |
| 3 | `hooks/useLLM.ts` | Same issue in `useAgentUsage` | Changed to `'/api/v1/agents/:id/usage' as any` with `{ id: agentId }` param |
| 4 | `VutlerDashboardPage.tsx` | "CURRENT TASK" section displays `agent.email` instead of task info | Changed to `agent.description` (closest available field) |

### 🟡 Medium

| # | File | Issue | Fix |
|---|------|-------|-----|
| 5 | `VutlerLayout.tsx` | Sidebar items have `role="button"` + `tabIndex={0}` but no `onKeyDown` handler — keyboard users can't activate them | Added `onKeyDown` for Enter/Space + `aria-label` |
| 6 | `VutlerActivityPage.tsx` | Copyright year "2024" outdated | Updated to "2025" |

### 🟢 Minor

| # | File | Issue | Fix |
|---|------|-------|-----|
| 7 | `VutlerActivityPage.tsx` | `useMemo` imported but unused | Removed unused import |
| 8 | `VutlerAgentDetailPage.tsx` | `useMemo` imported but unused | Removed unused import |
| 9 | `hooks/useLLM.ts` | `Agent` type imported but unused | Removed unused import |

---

## Warnings (Not Fixed — Need Discussion)

| # | File | Issue | Recommendation |
|---|------|-------|----------------|
| W1 | `VutlerAgentDetailPage.tsx` | Uses `confirm()` for delete — not React-idiomatic | Replace with a confirmation modal component |
| W2 | `hooks/useAgents.ts` | `useDeleteAgent` endpoint `DELETE /api/v1/agents/:id` — verify this route exists in the backend | Confirm API route registration |
| W3 | `hooks/useLLM.ts` | `useUpdateAgentLLM` and `useTestLLMConnection` use PUT/POST with `:id` params — verify backend routes | Confirm API route registration |
| W4 | All pages | Hardcoded mock data in ActivityPage, MarketplacePage, ProvidersPage — acceptable for MVP, but should be API-driven | Plan API migration |
| W5 | `VutlerDashboardPage.tsx` | Agent card shows `agent.description` as role badge with `getRoleColor()` — assumes description matches role keys (engineer, designer, etc.) | May need a dedicated `role` field on Agent type |
| W6 | `VutlerOnboardingPage.tsx` | Setup wizard doesn't persist data — `handleNext` on step 4 just shows toast and navigates | Wire up to actual API calls |
| W7 | `VutlerAgentBuilderPage.tsx` | `handleSave` shows toast but doesn't call API | Wire up to `useCreateAgent` mutation |

---

## TSX ↔ HTML Duplication

The `custom/admin/` directory contains HTML versions of 6 pages that overlap with TSX components:

| HTML File | TSX Equivalent | Status |
|-----------|---------------|--------|
| `index.html` | `VutlerDashboardPage.tsx` | Duplicate |
| `agents.html` | `VutlerAgentsPage.tsx` | Duplicate |
| `activity.html` | `VutlerActivityPage.tsx` | Duplicate |
| `llm-settings.html` | `VutlerLLMSettingsPage.tsx` | Duplicate |
| `templates.html` | `VutlerTemplatesPage.tsx` | Duplicate |
| `usage.html` | `VutlerUsagePage.tsx` | Duplicate |

**Recommendation:** The HTML files appear to be static prototypes. The TSX pages are the production versions. Keep HTML files as reference/documentation or archive them. Do not serve both.

---

## Page-by-Page Checklist

### ✅ VutlerDashboardPage.tsx
- [x] Syntax valid
- [x] Imports correct (fixed unused `AgentStatus`)
- [x] Routing: `activePage="dashboard"` matches sidebar
- [x] Fixed: email shown as task → now description
- [x] CSS classes all defined in vutler-admin.css

### ✅ VutlerAgentsPage.tsx
- [x] Syntax valid
- [x] Imports correct
- [x] Routing: `activePage="agents"` matches sidebar
- [x] Filter/search logic correct
- [x] CSS classes present

### ✅ VutlerAgentDetailPage.tsx
- [x] Syntax valid (fixed unused useMemo)
- [x] Uses proper hooks (useAgent, useAgentActivity, useDeleteAgent)
- [x] Breadcrumb navigation correct
- [x] Loading/error states handled

### ✅ VutlerAgentBuilderPage.tsx
- [x] Syntax valid
- [x] Form state management correct
- [x] Preview card reactive to form changes
- [x] Tools/channels toggle logic correct
- [⚠️] Save doesn't persist (W7)

### ✅ VutlerProvidersPage.tsx
- [x] Syntax valid
- [x] Modal overlay for configuration
- [x] Provider state management correct
- [x] Stats compute correctly

### ✅ VutlerLLMSettingsPage.tsx
- [x] Syntax valid
- [x] Mode toggle (BYOK/Managed) correct
- [x] Tier selection conditional rendering
- [x] Toggle switches work

### ✅ VutlerUsagePage.tsx
- [x] Syntax valid
- [x] Period filter works
- [x] Progress bar color logic correct
- [x] Currency/number formatting correct

### ✅ VutlerTemplatesPage.tsx
- [x] Syntax valid
- [x] Dynamic category filter from data
- [x] Search + category filter combined
- [x] Loading/empty states

### ✅ VutlerMarketplacePage.tsx
- [x] Syntax valid
- [x] Category filter from Set
- [x] Stats computed from data
- [x] Price badge styling correct

### ✅ VutlerActivityPage.tsx
- [x] Syntax valid (fixed unused useMemo, copyright)
- [x] Toggle rules state management
- [x] Event feed grid layout
- [x] Webhook copy-to-clipboard

### ✅ VutlerOnboardingPage.tsx
- [x] Syntax valid
- [x] Step wizard navigation correct
- [x] canNext() validation per step
- [x] Step indicator visual states

### ✅ VutlerLayout.tsx
- [x] Fixed keyboard accessibility
- [x] Sidebar sections match AgentsRoute paths
- [x] Active state correctly applied

### ✅ vutler-admin.css
- [x] All CSS classes used in TSX are defined
- [x] Responsive breakpoint at 1024px for two-col layout
- [x] Dark theme variables complete
- [x] No orphan/unused critical classes

### ✅ AgentsRoute.tsx
- [x] All 11 pages imported and routed
- [x] Routing priority correct (named routes before `:id`)
- [x] Default route renders dashboard

---

## Responsive / Media Queries

Only one breakpoint found: `@media (max-width: 1024px)` for `.vutler-two-col`. 

**Missing responsive handling for:**
- Sidebar collapse on mobile (< 768px)
- Stats grid on small screens
- Agent cards grid on small screens
- Marketplace grid on small screens

**Recommendation:** Add a sidebar collapse/hamburger for mobile viewports.

---

## Accessibility Summary

- ✅ Sidebar items: `role="button"`, `tabIndex`, `onKeyDown`, `aria-label` (fixed)
- ⚠️ Toggle switches: missing `role="switch"` and `aria-checked`
- ⚠️ Modal in ProvidersPage: no focus trap, no Escape key handler
- ⚠️ Color contrast on muted text (#6e7681 on #0d1117) — may be borderline WCAG AA

---

*End of QA report.*
