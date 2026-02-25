# Vutler Requirements

## Milestone 1: Next.js Foundation

**Goal:** Replace static HTML with modern Next.js frontend, maintaining feature parity with backend API.

### v1 (MVP - Current Milestone)

#### Foundation [COMPLETE - Sprint 7, Story 1.1]
- [x] Next.js 15 project scaffolding with App Router
- [x] TypeScript configuration
- [x] Tailwind CSS with Vutler brand colors
- [x] shadcn/ui component library (dark theme)
- [x] Inter font (self-hosted, no Google CDN)
- [x] Production Dockerfile (multi-stage build)
- [x] Typed API client for backend integration
- [x] Environment configuration (.env.local.example)

#### Dashboard Page
- [ ] Dashboard layout with sidebar navigation
- [ ] Stats cards (total agents, active agents, messages, uptime)
- [ ] Recent activity feed
- [ ] Quick actions (create agent, view logs)
- [ ] Loading states
- [ ] Error boundaries

#### Agent Management
- [ ] Agent list view (table or card grid)
- [ ] Agent detail view
- [ ] Create agent form with validation
- [ ] Agent status indicators (active/inactive/error)
- [ ] Platform icons (Discord, WhatsApp, Telegram, etc.)
- [ ] Last active timestamps

#### API Integration
- [ ] React Query setup for data fetching
- [ ] Optimistic updates
- [ ] Error handling and retry logic
- [ ] Loading skeletons
- [ ] Toast notifications

#### Deployment
- [ ] Docker Compose configuration
- [ ] Nginx reverse proxy config
- [ ] SSL/TLS certificates (Let's Encrypt)
- [ ] Deploy to VPS (83.228.222.180)
- [ ] Point app.vutler.ai to new frontend

### v2 (Post-MVP)

#### Advanced Features
- [ ] Real-time agent monitoring (WebSocket)
- [ ] Agent logs viewer with filtering
- [ ] Agent configuration editor
- [ ] Bulk agent operations
- [ ] Search and filtering

#### Chat Integration
- [ ] RocketChat iframe embed
- [ ] Or: Custom chat UI with RocketChat API
- [ ] Agent message history
- [ ] Direct agent messaging

#### Authentication
- [ ] Login/signup pages
- [ ] JWT token management
- [ ] Protected routes
- [ ] User profile management

#### Analytics
- [ ] Agent performance metrics
- [ ] Message volume charts
- [ ] Error rate tracking
- [ ] Usage statistics

### Out of Scope (Future)

- Multi-tenant support
- Mobile app
- Agent marketplace
- Custom agent builder UI
- Advanced workflow automation
- Third-party integrations (Zapier, etc.)
