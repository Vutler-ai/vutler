# Sprint 7 — Next.js Frontend Migration

**Sprint Goal:** Replace all static HTML pages with a Next.js app, properly wired to Vutler API, with clean routing and no RocketChat leakage.

**Duration:** 2 weeks (Feb 26 — Mar 12, 2026)
**Squad:** Mike ⚙️ (backend/API), Philip 🎨 (UI components), Luna 🧪 (PO/QA), Jarvis 🤖 (scrum/integration)

---

## Current State (Problems)
- 16+ static HTML files, no component reuse, no state management
- CSS/JS scattered (admin.css, styles.css, pages.css — no shared design system)
- Nginx routing chaos: Express (3001) + RocketChat (3000) + static files
- No auth flow — dashboard is unauthenticated, pages are dumb HTML
- RocketChat bleeds through on undefined routes
- Mock data hardcoded in HTML (partially fixed)
- No mobile responsiveness (only 1 breakpoint at 480px)
- Google Fonts loaded externally (slow)
- Landing page (vutler.ai) and App (app.vutler.ai) share same Express server

## Target Architecture
```
vutler.ai          → Next.js (landing pages, SSG)
app.vutler.ai      → Next.js (app, SSR/CSR)
api.vutler.ai      → Express API (port 3001) — unchanged
chat.vutler.ai     → RocketChat (port 3000) — hidden from end users
```

### Tech Stack
- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS** (replaces custom CSS — faster, responsive, design system)
- **shadcn/ui** (component library — consistent, accessible)
- **next-auth** or custom JWT (auth against RC + Vutler API)
- **Docker** (containerized, same VPS)

---

## Epic 1: Project Setup & Infrastructure (8 pts)

### Story 1.1: Next.js Project Scaffolding (3 pts)
**As a** developer
**I want** a Next.js 14 project with TypeScript, Tailwind, and shadcn/ui configured
**So that** we have a solid foundation for all frontend work

**Acceptance Criteria:**
- [ ] `npx create-next-app@latest` with App Router, TypeScript, Tailwind
- [ ] shadcn/ui installed and configured (dark theme matching current brand)
- [ ] Brand colors as Tailwind theme: navy (#08090f), blue (#3b82f6), purple (#a855f7)
- [ ] Inter font loaded locally (not Google Fonts CDN)
- [ ] ESLint + Prettier configured
- [ ] Dockerfile for production build
- [ ] docker-compose service added (`vutler-frontend`, port 3002)
- [ ] Git repo: `projects/vutler/frontend/`

### Story 1.2: Nginx Routing Overhaul (3 pts)
**As a** user
**I want** clean URL routing with no RocketChat leakage
**So that** I only see Vutler UI

**Acceptance Criteria:**
- [ ] `vutler.ai` → Next.js container (port 3002), landing pages
- [ ] `app.vutler.ai` → Next.js container (port 3002), app pages
- [ ] `app.vutler.ai/api/v1/*` → Express API (port 3001)
- [ ] RocketChat (port 3000) only accessible via internal API, not browser
- [ ] No `@rocketchat` fallback — 404 page for undefined routes
- [ ] SSL certs unchanged (Let's Encrypt)

### Story 1.3: API Client & Auth (2 pts)
**As a** user
**I want** to log in once and stay authenticated across all pages
**So that** I don't see raw RocketChat login

**Acceptance Criteria:**
- [ ] Login page calls Vutler API → RC login → returns JWT/session
- [ ] Auth context/provider wraps all app pages
- [ ] Middleware redirects unauthenticated users to `/login`
- [ ] API client (`lib/api.ts`) with typed endpoints
- [ ] User info displayed in sidebar (name, email, avatar)

---

## Epic 2: Landing Site — vutler.ai (5 pts)

### Story 2.1: Landing Homepage (3 pts)
**As a** visitor
**I want** a polished landing page with all current content
**So that** I understand what Vutler does and can sign up

**Acceptance Criteria:**
- [ ] Hero section with CTA (Get Started / Request Demo)
- [ ] Features grid (Email, Chat, Files, Calendar, Templates, Analytics, Activity, LLM Config)
- [ ] "Integrates with your stack" logos (OpenAI, Anthropic, Slack, Discord, Gmail, Drive, Calendar, GitHub)
- [ ] "Build or Bring" two-path section
- [ ] Pricing section (Free / Starter $9 / Growth $39 / Enterprise)
- [ ] Contact form ("Let's talk")
- [ ] Footer with links
- [ ] Fully responsive (mobile, tablet, desktop)
- [ ] Dashboard preview image/mockup
- [ ] Page speed > 90 on Lighthouse

### Story 2.2: Sub-pages (2 pts)
**As a** visitor
**I want** pricing, docs, about, privacy, terms pages
**So that** I can learn more before signing up

**Acceptance Criteria:**
- [ ] `/pricing` — detailed pricing with FAQ
- [ ] `/docs` — documentation hub (can link to external docs later)
- [ ] `/about` — company info (Starbox Group, Geneva)
- [ ] `/privacy` — privacy policy
- [ ] `/terms` — terms of service
- [ ] Shared layout (navbar + footer)

---

## Epic 3: App Dashboard — app.vutler.ai (13 pts)

### Story 3.1: App Shell & Navigation (3 pts)
**As a** user
**I want** a consistent app layout with sidebar navigation
**So that** I can navigate between all sections

**Acceptance Criteria:**
- [ ] Sidebar with sections: Workspace (Dashboard, Chat, Agents, Builder), Config (Providers, LLM Settings, Usage), Discover (Templates, Marketplace), System (Activity, Settings)
- [ ] Responsive: collapsible sidebar on mobile, persistent on desktop
- [ ] Active page indicator
- [ ] User profile in sidebar footer
- [ ] Topbar with page title + actions
- [ ] Dark theme consistent with brand

### Story 3.2: Dashboard Page (2 pts)
**As a** user
**I want** a live dashboard showing my workspace stats
**So that** I can see agents, usage, and activity at a glance

**Acceptance Criteria:**
- [ ] Stats cards: Active Agents, Messages Today, Tokens Used, API Uptime
- [ ] Agents table (live from `/api/v1/dashboard`)
- [ ] Quick Actions grid
- [ ] Auto-refresh every 30s
- [ ] Loading skeletons while fetching

### Story 3.3: Agents List & Detail (3 pts)
**As a** user
**I want** to see all my agents and their details
**So that** I can manage them

**Acceptance Criteria:**
- [ ] Agents grid/list view with search + filter
- [ ] Agent card: name, type, model, status, last active
- [ ] Agent detail page: config, usage stats, activity log
- [ ] Start/Stop agent actions
- [ ] Link to Agent Builder for editing

### Story 3.4: Agent Builder (3 pts)
**As a** user
**I want** to create and configure agents visually
**So that** I don't need to use the API directly

**Acceptance Criteria:**
- [ ] Step-by-step wizard: Name → Type → Model → System Prompt → Integrations → Deploy
- [ ] LLM provider selection (from configured providers)
- [ ] System prompt editor with syntax highlighting
- [ ] Integration toggles (Email, Chat, Drive, Calendar)
- [ ] Preview/test before deploying
- [ ] Saves via API

### Story 3.5: Settings Pages (2 pts)
**As a** user
**I want** to configure providers, LLM settings, and view usage
**So that** I can manage my workspace

**Acceptance Criteria:**
- [ ] Providers page: add/edit/remove LLM providers (API keys)
- [ ] LLM Settings: model assignments, temperature, routing rules
- [ ] Usage page: token consumption charts, per-agent breakdown
- [ ] Templates page: browse and import agent templates
- [ ] Marketplace: discover community templates

---

## Epic 4: Chat Integration (5 pts)

### Story 4.1: Embedded Chat (5 pts)
**As a** user
**I want** to chat with my agents from the Vutler UI
**So that** I don't need to open RocketChat directly

**Acceptance Criteria:**
- [ ] Chat page at `/chat` with channel list + message view
- [ ] Uses RC API (not iframe) for clean integration
- [ ] Real-time messages via WebSocket
- [ ] Channel switching (general, direct messages)
- [ ] Send messages, receive responses
- [ ] Agent presence indicators (online/offline)

---

## Sprint Capacity & Priority

| Priority | Story | Points | Assignee | Sprint |
|----------|-------|--------|----------|--------|
| P0 | 1.1 Scaffolding | 3 | Mike | Week 1 |
| P0 | 1.2 Nginx Routing | 3 | Mike | Week 1 |
| P0 | 1.3 Auth | 2 | Mike | Week 1 |
| P1 | 3.1 App Shell | 3 | Philip | Week 1 |
| P1 | 3.2 Dashboard | 2 | Philip | Week 1 |
| P1 | 2.1 Landing Homepage | 3 | Philip | Week 2 |
| P2 | 3.3 Agents List | 3 | Philip | Week 2 |
| P2 | 3.4 Agent Builder | 3 | Mike+Philip | Week 2 |
| P2 | 2.2 Sub-pages | 2 | Philip | Week 2 |
| P3 | 3.5 Settings | 2 | Philip | Week 2 |
| P3 | 4.1 Chat | 5 | Mike | Week 2+ |

**Total: 31 story points**
**Sprint velocity (estimated): ~20 pts/week with AI agents**
**Realistic target: Epics 1-3 (26 pts) in 2 weeks, Epic 4 carries over**

---

## Definition of Done
- [ ] Code in `projects/vutler/frontend/` and pushed to GitHub
- [ ] Docker container builds and runs
- [ ] Nginx updated and tested
- [ ] No RocketChat UI visible to end users
- [ ] Responsive on mobile + desktop
- [ ] All pages fetch real data from API
- [ ] Auth flow works end-to-end
- [ ] Lighthouse score > 80

---

## Risks
1. **RC API complexity** — Chat integration may need reverse-engineering RC's REST/WS API
2. **Auth flow** — RC uses Meteor DDP, not standard JWT. May need proxy auth.
3. **Scope creep** — Keep chat (Epic 4) as stretch goal
4. **Data** — Some pages (Templates, Marketplace) have no real data yet — use empty states

## Decision Log
- Next.js 14 over Remix/SvelteKit → most ecosystem support, Vercel-ready if we want to move off VPS later
- Tailwind over styled-components → faster dev, consistent design tokens
- shadcn/ui over MUI/Chakra → lighter, more customizable, Tailwind-native
- App Router over Pages Router → future-proof, RSC support
