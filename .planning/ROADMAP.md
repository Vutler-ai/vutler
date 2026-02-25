# Vutler Roadmap

**Milestone:** Next.js Foundation  
**Started:** 2026-02-25  
**Status:** In Progress

---

## Sprint 7

### Phase 1: Project Scaffolding ✅ COMPLETE
**Status:** Complete  
**Completed:** 2026-02-25 16:34 GMT+1

- [x] Create Next.js 15 project with App Router, TypeScript, Tailwind, ESLint
- [x] Install and configure shadcn/ui (dark theme)
- [x] Configure Vutler brand colors in Tailwind theme
- [x] Load Inter font locally via next/font (not Google CDN)
- [x] Create production Dockerfile (multi-stage build)
- [x] Create typed API client (`lib/api.ts`)
- [x] Create environment variable template (`.env.local.example`)
- [x] Configure dark theme in root layout
- [x] Create comprehensive README.md

**Deliverables:**
- `/Users/lopez/.openclaw/workspace/projects/vutler/frontend/vutler-frontend/`
- All configuration files ready
- Build verified successful
- Docker configuration ready

---

### Phase 2: Dashboard Layout 🔄 NEXT
**Status:** Planned  
**Dependencies:** Phase 1

**Goals:**
- Create main layout with sidebar navigation
- Implement dashboard page structure
- Add basic routing

**Tasks:**
1. Create `src/components/ui/` directory for shadcn components
2. Add sidebar navigation component
3. Create dashboard layout with stats grid
4. Add basic routing structure
5. Implement dark theme toggle (optional)

**Success Criteria:**
- Dashboard accessible at `/dashboard`
- Sidebar shows navigation items
- Layout is responsive
- Dark theme applied consistently

---

### Phase 3: Dashboard Stats & API Integration
**Status:** Planned  
**Dependencies:** Phase 2

**Goals:**
- Display real dashboard data
- Connect to backend API
- Handle loading/error states

**Tasks:**
1. Install React Query
2. Create dashboard stats cards
3. Fetch data from `/api/v1/dashboard`
4. Add loading skeletons
5. Add error boundaries
6. Display stats: total agents, active, messages, uptime

**Success Criteria:**
- Stats display real data from API
- Loading states show during fetch
- Errors display user-friendly messages
- Data refreshes on interval

---

### Phase 4: Agent List View
**Status:** Planned  
**Dependencies:** Phase 3

**Goals:**
- Display list of all agents
- Show agent status and metadata
- Add platform icons

**Tasks:**
1. Create agent list component (table or cards)
2. Fetch agents from `/api/v1/agents`
3. Display: name, platform, status, last active
4. Add status indicators (active/inactive/error)
5. Add platform icons (Discord, WhatsApp, etc.)
6. Implement responsive design

**Success Criteria:**
- All agents displayed
- Status indicators accurate
- Clicking agent navigates to detail view
- Mobile-friendly layout

---

### Phase 5: Agent Detail & Actions
**Status:** Planned  
**Dependencies:** Phase 4

**Goals:**
- View single agent details
- Edit/delete agents
- Display agent configuration

**Tasks:**
1. Create agent detail page (`/agents/[id]`)
2. Fetch single agent data
3. Display full agent configuration
4. Add edit button (modal or inline)
5. Add delete button with confirmation
6. Handle optimistic updates

**Success Criteria:**
- Agent detail page shows all info
- Edit/delete actions work
- Changes reflect immediately
- Confirmation before destructive actions

---

### Phase 6: Create Agent Flow
**Status:** Planned  
**Dependencies:** Phase 5

**Goals:**
- Add new agents via UI
- Form validation
- Success/error feedback

**Tasks:**
1. Create "New Agent" button in dashboard
2. Build agent creation form (modal or page)
3. Add form fields: name, platform, config
4. Implement client-side validation
5. Submit to `POST /api/v1/agents`
6. Show success toast and redirect

**Success Criteria:**
- Form validates before submission
- New agents appear immediately
- Clear error messages on failure
- Smooth UX flow

---

### Phase 7: Production Deployment
**Status:** Planned  
**Dependencies:** Phases 1-6

**Goals:**
- Deploy to VPS
- Configure reverse proxy
- Set up SSL

**Tasks:**
1. Create Docker Compose config for frontend + backend
2. Configure Nginx reverse proxy
3. Set up Let's Encrypt SSL certificates
4. Update DNS for app.vutler.ai
5. Deploy and test production build
6. Monitor logs for errors

**Success Criteria:**
- App accessible at https://app.vutler.ai
- SSL certificate valid
- All features working in production
- Backend API accessible via frontend

---

## Sprint 8 (Future)

### Phase 8: Real-time Features
- WebSocket connection to backend
- Live agent status updates
- Real-time activity feed

### Phase 9: RocketChat Integration
- Embed RocketChat or build custom UI
- Agent messaging interface

### Phase 10: Authentication
- Login/signup pages
- Protected routes
- User sessions

---

## Progress Summary

**Total Phases:** 10 (7 current sprint, 3 future)  
**Completed:** 1  
**In Progress:** 0  
**Remaining:** 9  
**Completion:** 10%

**Current Focus:** Phase 2 (Dashboard Layout)
