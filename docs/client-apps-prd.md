# Vutler Client Applications - Product Requirements Document

**Version:** 1.0  
**Date:** February 2026  
**Owner:** Luna, Product Manager - Starbox Group  
**Status:** Draft for Review

---

## Executive Summary

Vutler is positioning itself as "Office 365 for AI Agents" — a complete workspace platform for building, deploying, and managing AI agents. To deliver on this vision, we're developing **two complementary client applications** that serve different user needs and use cases:

1. **Vutler Agent** (Client Léger) — A lightweight desktop/mobile companion that runs your personal AI agent locally, with system access and background execution capabilities.

2. **Vutler Workspace** (Client Lourd) — A full-featured collaborative workspace app (think Slack + Google Drive + Agent Builder) for teams managing multiple agents, files, and workflows.

**Strategic Positioning:**
- **Agent** = Personal AI assistant for individual productivity (free tier, gateway drug)
- **Workspace** = Enterprise collaboration hub for AI-powered teams (premium revenue driver)

This PRD defines the technical stack, feature roadmap (MVP vs V2), architecture, and go-to-market strategy for both products.

---

## Product Vision & Market Positioning

### The Problem We're Solving

**For Individuals:**
- Fragmented AI tools (ChatGPT, Claude, local scripts) with no unified workflow
- No persistent, context-aware AI assistant that understands *my* files, *my* schedule, *my* workflows
- Limited system integration — AI lives in browser tabs, not in the OS

**For Teams:**
- Collaboration on AI agents is clunky (shared API keys, scattered prompts, no version control)
- No centralized workspace for agents, files, and team communication
- Building custom AI workflows requires technical expertise

### Our Solution

**Vutler Agent** gives you a personal AI assistant that:
- Lives on your device (desktop/mobile) with system-level access
- Executes tasks locally (file management, terminal commands, app automation)
- Stays in the background, available via tray icon, hotkey, or voice command
- Syncs context with your Vutler workspace

**Vutler Workspace** gives teams a unified platform to:
- Build, share, and manage AI agents (no-code builder)
- Collaborate on files (integrated Drive) and communicate (channels/DMs)
- Orchestrate multi-agent workflows
- Control permissions, track usage, and monitor agent behavior

### Competitive Landscape

| Competitor | Positioning | Our Advantage |
|------------|-------------|---------------|
| **ChatGPT Desktop** | Browser-based, no system access | We run locally with OS-level permissions |
| **Slack + Zapier** | Team chat + automation | We integrate AI agents natively, not as bolt-ons |
| **Google Workspace** | Productivity suite | We're AI-first, not document-first |
| **Replit Agent** | Dev-focused AI coding | We're general-purpose, not just for coders |
| **Microsoft Copilot** | Office add-on | We're a standalone workspace, not tied to Office |

**Key Differentiator:** We're the only platform that combines **personal AI agents** (local execution) with **team collaboration** (shared workspace) in one ecosystem.

---

## Product 1: Vutler Agent (Client Léger)

### Overview

**Tagline:** *"Your AI assistant, always on, always ready."*

**Description:**  
Vutler Agent is a lightweight desktop/mobile app that runs a personal AI agent locally on the user's device. Unlike browser-based AI tools, Vutler Agent has **system-level access** (with user permission) to:
- Read/write files
- Execute terminal commands
- Launch applications
- Monitor clipboard, schedule, notifications
- Respond to voice commands

The agent syncs with the user's Vutler workspace (cloud backend) for context, memory, and multi-device continuity.

**Think:** Siri/Alexa/Google Assistant, but smarter, local-first, and with real system permissions.

---

### Target Platforms

| Platform | Priority | Rationale |
|----------|----------|-----------|
| **macOS** | 🔥 P0 | Tech-savvy early adopters, high willingness to pay |
| **Windows** | 🔥 P0 | Largest desktop market share, enterprise users |
| **Linux** | 🟡 P1 | Dev community, low maintenance if we use cross-platform tech |
| **iOS** | 🟡 P1 | Mobile companion (limited system access, but good for notifications/voice) |
| **Android** | 🟢 P2 | Secondary mobile market, post-iOS launch |

---

### Tech Stack Recommendation

#### Desktop (macOS/Windows/Linux)

**Recommended: Tauri 2.0**

| Factor | Tauri | Electron | Native (Swift/C#) |
|--------|-------|----------|-------------------|
| **Bundle Size** | 5-10 MB | 50-100 MB | 5-10 MB |
| **RAM Usage** | Low (no Chromium) | High | Low |
| **System Access** | Excellent (Rust backend) | Limited (Node sandbox) | Excellent |
| **Cross-Platform** | ✅ Single codebase | ✅ Single codebase | ❌ Separate per OS |
| **Security** | ✅ Sandboxed by default | ⚠️ Chromium CVEs | ✅ OS-native |
| **Dev Speed** | Fast (React/Vue frontend) | Fast | Slow (3 codebases) |
| **Maintenance** | Low | Medium | High |

**Verdict:** **Tauri 2.0** wins on size, performance, and security. We get:
- **Frontend:** React + TypeScript (web tech, fast iteration)
- **Backend:** Rust (fast, safe, deep OS integration)
- **Updater:** Built-in auto-update
- **Plugins:** File system, shell, notifications, clipboard, deep-linking

**Fallback:** If Tauri maturity is a concern, **Electron** is battle-tested (VSCode, Slack, Discord).

#### Mobile (iOS/Android)

**Recommended: React Native + Expo**

| Factor | React Native | Flutter | Native (Swift/Kotlin) |
|--------|--------------|---------|----------------------|
| **Code Reuse** | Shares logic with web | Separate codebase | ❌ Separate per OS |
| **Team Efficiency** | ✅ Same team as web | Need Dart devs | Need platform devs |
| **Performance** | Good | Excellent | Excellent |
| **System Access** | Via native modules | Via platform channels | Native |
| **Maturity** | Very mature (Meta, Expo) | Mature (Google) | Mature |

**Verdict:** **React Native + Expo** for maximum code reuse with our web stack. We can share:
- API client logic
- State management (Redux/Zustand)
- UI components (Tamagui for universal design)

**System Access Strategy:**
- iOS: Limited by Apple (no background execution, no terminal). Focus on notifications, voice input, quick actions.
- Android: More permissive (background services, file access). Can do more than iOS.

---

### Architecture

```
┌─────────────────────────────────────────────┐
│         Vutler Agent (Client App)           │
├─────────────────────────────────────────────┤
│  UI Layer (React/TypeScript)                │
│  - Chat interface                           │
│  - System tray icon                         │
│  - Voice input overlay                      │
│  - Settings panel                           │
├─────────────────────────────────────────────┤
│  Agent Runtime (Rust for Tauri / Node for RN)│
│  - Local LLM inference (optional, llama.cpp)│
│  - Task executor (file ops, shell, apps)    │
│  - Permission manager (user approval UI)    │
│  - Context sync (local cache + cloud sync)  │
├─────────────────────────────────────────────┤
│  System Integration                         │
│  - File system access (sandboxed)           │
│  - Shell/terminal (user-approved commands)  │
│  - Clipboard monitor                        │
│  - App launcher (open URLs, apps)           │
│  - Voice recognition (Whisper local or API) │
└─────────────────────────────────────────────┘
              ▲
              │ WebSocket (Rocket.Chat)
              │ REST API (Express)
              ▼
┌─────────────────────────────────────────────┐
│      Vutler Backend (Cloud)                 │
│  - Rocket.Chat 8.1 (messaging)              │
│  - Express API (orchestration)              │
│  - PostgreSQL (workspace data)              │
│  - Redis (sessions, pub/sub)                │
│  - S3/Minio (file storage)                  │
└─────────────────────────────────────────────┘
```

**Key Flows:**

1. **User asks agent to "summarize this PDF":**
   - Client reads file locally (if accessible)
   - Sends content + context to Vutler API
   - API routes to LLM, returns response
   - Client displays result in chat

2. **User says "remind me in 30 minutes":**
   - Client stores reminder in local DB
   - Syncs to cloud (Rocket.Chat scheduled message)
   - Client shows notification at trigger time

3. **User runs "install npm package XYZ":**
   - Client prompts for permission (show exact command)
   - User approves → client executes in local shell
   - Output streamed back to chat

---

### Features: MVP vs V2

#### MVP (Launch - Q2 2026)

**Core Chat & Interaction:**
- ✅ Chat interface with AI agent (text-based)
- ✅ System tray icon (macOS menubar, Windows tray)
- ✅ Auto-start on boot (optional)
- ✅ Hotkey to invoke (e.g., Cmd+Shift+Space)
- ✅ Basic voice input (push-to-talk, Whisper API)

**System Integration (Desktop Only):**
- ✅ File read/write (user grants folder access)
- ✅ Terminal command execution (with approval UI)
- ✅ Clipboard access (read current clipboard)
- ✅ App launcher (open URLs, default apps)

**Cloud Sync:**
- ✅ Sync chat history with Vutler workspace
- ✅ Sync agent memory/context
- ✅ Basic notifications (push from cloud)

**Mobile (iOS/Android - Companion Only):**
- ✅ Chat with agent (no system access)
- ✅ Voice input (dictation)
- ✅ Push notifications
- ✅ Quick actions (shortcuts)

#### V2 (Post-Launch - Q3-Q4 2026)

**Advanced Features:**
- 🚀 Continuous voice conversation (always-listening mode)
- 🚀 Screen context (OCR + vision, "what's on my screen?")
- 🚀 Calendar integration (read/write events)
- 🚀 Email integration (Gmail, Outlook)
- 🚀 Browser extension (capture web context)
- 🚀 Workflow automation (Zapier-like chains)
- 🚀 Multi-agent support (switch between agents)
- 🚀 Local LLM option (offline mode with llama.cpp)

**Mobile V2:**
- 🚀 Android background service (more system access)
- 🚀 Widgets (iOS 14+, Android)
- 🚀 Siri/Google Assistant shortcuts

---

### Security & Permissions

**Principle:** Users must **explicitly approve** every sensitive action.

**Permission Levels:**
1. **Safe (auto-allowed):** Read clipboard, show notifications, open URLs
2. **Risky (one-time approval):** Read files in ~/Documents, write to ~/Downloads
3. **Dangerous (always prompt):** Execute terminal commands, install software, delete files

**Implementation:**
- Tauri's permission system (scopes per API)
- User sees exact command before execution (no blind trust)
- Audit log of all actions (local + cloud sync)

---

## Product 2: Vutler Workspace (Client Lourd)

### Overview

**Tagline:** *"Your team's AI-powered workspace."*

**Description:**  
Vutler Workspace is a full-featured desktop/mobile app for teams to collaborate using AI agents. It combines:
- **Team chat** (channels, DMs, threads) — powered by Rocket.Chat
- **Integrated Drive** (file sharing, version control) — like Google Drive
- **Agent Builder** (no-code agent creation) — visual workflow editor
- **Workspace Admin** (user management, permissions, billing)

**Think:** Slack + Google Drive + Zapier + OpenAI Playground, all in one app.

---

### Target Platforms

| Platform | Priority | Rationale |
|----------|----------|-----------|
| **Web (app.vutler.ai)** | 🔥 P0 | Easiest to deploy, widest reach |
| **macOS** | 🔥 P0 | Desktop power users, deep OS integration |
| **Windows** | 🔥 P0 | Enterprise standard |
| **Linux** | 🟡 P1 | Dev teams |
| **iOS** | 🟡 P1 | Mobile access (read-only workflows OK) |
| **Android** | 🟢 P2 | Secondary mobile |

---

### Tech Stack Recommendation

#### Desktop (macOS/Windows/Linux)

**Recommended: Electron**

| Factor | Electron | Tauri | Native |
|--------|----------|-------|--------|
| **Feature Richness** | ✅ Full Chromium | ⚠️ WebView limits | ✅ Native APIs |
| **Rocket.Chat Integration** | ✅ Easy (web tech) | ⚠️ WebView quirks | ❌ Rebuild entire UI |
| **Rapid Iteration** | ✅ Ship fast | ✅ Ship fast | ❌ Slow |
| **File Upload/Download** | ✅ Mature APIs | ✅ Supported | ✅ Native |
| **Maturity** | ✅ Battle-tested (Slack, Discord) | 🟡 Newer | ✅ Mature |

**Verdict:** **Electron** for maximum compatibility with our web stack (React + Rocket.Chat). We can:
- Reuse the web app codebase (wrap in Electron)
- Add desktop-specific features (native notifications, deep linking, file drag-drop)
- Ship quickly without maintaining separate native apps

**Code Sharing Strategy:**
```
vutler-workspace/
├── packages/
│   ├── web/          # React app (shared core)
│   ├── desktop/      # Electron wrapper + desktop features
│   └── mobile/       # React Native app (shared logic)
```

#### Mobile (iOS/Android)

**Recommended: React Native + Expo**

Same reasoning as Vutler Agent — code reuse with web stack.

**Mobile UX Focus:**
- Read-optimized (browse chats, files, dashboards)
- Quick actions (approve requests, reply to messages)
- Notifications (push, in-app)
- Limited agent building (view/edit simple workflows, not full builder)

---

### Architecture

```
┌─────────────────────────────────────────────┐
│    Vutler Workspace (Client App)            │
├─────────────────────────────────────────────┤
│  UI Layer (React/TypeScript)                │
│  - Chat interface (Rocket.Chat SDK)         │
│  - File browser (Drive UI)                  │
│  - Agent builder (visual workflow editor)   │
│  - Admin dashboard (team/billing)           │
├─────────────────────────────────────────────┤
│  State Management (Redux/Zustand)           │
│  - User session                             │
│  - Workspace data (channels, agents)        │
│  - File sync status                         │
├─────────────────────────────────────────────┤
│  API Client (REST + WebSocket)              │
│  - Rocket.Chat SDK (realtime messaging)     │
│  - Vutler Express API (workspace ops)       │
│  - File upload/download (multipart, S3)     │
└─────────────────────────────────────────────┘
              ▲
              │ WebSocket (Rocket.Chat)
              │ REST API (Express)
              │ S3 API (file storage)
              ▼
┌─────────────────────────────────────────────┐
│      Vutler Backend (Cloud)                 │
│  - Rocket.Chat 8.1 (messaging, rooms)       │
│  - Express API (workspace, agents, files)   │
│  - PostgreSQL (metadata, permissions)       │
│  - Redis (cache, pub/sub)                   │
│  - S3/Minio (file blobs)                    │
│  - LLM Gateway (OpenAI, Anthropic, local)   │
└─────────────────────────────────────────────┘
```

**Key Flows:**

1. **User creates an agent in the builder:**
   - Client sends workflow definition to Express API
   - API saves to PostgreSQL, triggers agent provisioning
   - Agent becomes available in Rocket.Chat as a bot user

2. **Team member uploads a file:**
   - Client uploads to S3 (presigned URL from API)
   - Client sends metadata to Express API
   - File appears in Drive, indexable by agents

3. **User asks agent to analyze a shared document:**
   - Client sends message via Rocket.Chat
   - Backend routes to agent, which fetches file from S3
   - Agent processes (LLM call), returns result to chat

---

### Features: MVP vs V2

#### MVP (Launch - Q2 2026)

**Team Collaboration:**
- ✅ Channels (public, private, DMs) — via Rocket.Chat
- ✅ Threaded conversations
- ✅ File sharing (upload, download, preview)
- ✅ @mentions, reactions, search

**Agent Management:**
- ✅ Pre-built agents (templates)
- ✅ Chat with agents in channels/DMs
- ✅ Basic agent builder (prompt + tools selection)
- ✅ Agent directory (browse, install)

**File Management (Integrated Drive):**
- ✅ Folder structure (per workspace)
- ✅ Upload/download files
- ✅ Basic file preview (images, PDFs, text)
- ✅ File search (by name, metadata)

**Workspace Admin:**
- ✅ User invites (email, link)
- ✅ Role-based permissions (admin, member, guest)
- ✅ Billing dashboard (usage, plan)
- ✅ Audit log (basic actions)

**Mobile (iOS/Android):**
- ✅ Read-only chat (no editing)
- ✅ File browser (view, download)
- ✅ Notifications (push)
- ✅ Quick replies

#### V2 (Post-Launch - Q3-Q4 2026)

**Advanced Collaboration:**
- 🚀 Real-time co-editing (Google Docs style)
- 🚀 Video/audio calls (WebRTC)
- 🚀 Screen sharing
- 🚀 Polls, forms, whiteboards

**Advanced Agent Builder:**
- 🚀 Visual workflow editor (nodes + edges, like n8n)
- 🚀 Custom tool creation (API integrations)
- 🚀 Multi-agent orchestration (swarm mode)
- 🚀 Version control (agent history, rollback)

**Advanced File Management:**
- 🚀 Version history (file revisions)
- 🚀 Comments on files (collaborative review)
- 🚀 Advanced search (semantic, OCR)
- 🚀 External integrations (Google Drive, Dropbox sync)

**Integrations:**
- 🚀 Calendar (Google, Outlook)
- 🚀 Email (Gmail, Outlook)
- 🚀 CRM (Salesforce, HubSpot)
- 🚀 Project management (Asana, Jira)

**Mobile V2:**
- 🚀 Offline mode (local cache)
- 🚀 Rich text editing
- 🚀 File upload from camera/gallery

---

### Security & Compliance

**Data Sovereignty:**
- EU customers: data stored in EU region (AWS Frankfurt, OVH Gravelines)
- US customers: US region (AWS us-east-1)

**Encryption:**
- End-to-end encryption for DMs (optional, Rocket.Chat E2E)
- At-rest encryption for files (S3 server-side)
- TLS 1.3 for all API calls

**Compliance:**
- GDPR-compliant (data export, right to be forgotten)
- SOC 2 Type II (target: Q4 2026)
- HIPAA-ready architecture (dedicated instances for healthcare)

---

## Client Comparison: Light vs Heavy

| Dimension | Vutler Agent (Léger) | Vutler Workspace (Lourd) |
|-----------|----------------------|--------------------------|
| **Primary Use Case** | Personal AI assistant | Team collaboration |
| **User Type** | Individual, power user | Teams, enterprises |
| **System Access** | ✅ Deep (files, terminal, apps) | ❌ Limited (sandboxed web) |
| **Offline Mode** | ✅ Partial (local LLM option) | ❌ Cloud-dependent |
| **File Management** | Local files only | Shared Drive + local |
| **Agent Count** | 1 personal agent | Unlimited agents per workspace |
| **Collaboration** | ❌ Single-user | ✅ Multi-user (channels, teams) |
| **Bundle Size** | 5-10 MB (Tauri) | 50-150 MB (Electron + assets) |
| **RAM Usage** | <100 MB | 200-500 MB |
| **Platform Priority** | Desktop-first, mobile companion | Web-first, desktop/mobile apps |
| **Pricing** | Free tier, premium features | Freemium → paid plans |

**Strategic Interplay:**
- **Agent** is the **gateway drug** — users discover Vutler, fall in love with their personal agent
- **Workspace** is the **upsell** — when users want to collaborate, they upgrade to a team plan
- Both apps share **context** — your personal agent in Vutler Agent syncs with your workspace agents

---

## Pricing Strategy

### Vutler Agent (Léger)

**Free Tier (Included in All Plans):**
- ✅ 1 personal agent
- ✅ Desktop app (all platforms)
- ✅ Mobile app (basic features)
- ✅ Cloud sync (up to 1 GB)
- ✅ 100 LLM calls/month (GPT-4o-mini equivalent)

**Pro Tier ($9/month per user):**
- ✅ Unlimited LLM calls
- ✅ Advanced voice features (continuous listening)
- ✅ Local LLM support (offline mode)
- ✅ Priority support

**Enterprise Add-On ($custom):**
- ✅ SSO integration
- ✅ Custom deployment (on-prem agent)
- ✅ Audit logging

### Vutler Workspace (Lourd)

**Free Tier (Solo):**
- ✅ 1 user
- ✅ 3 agents
- ✅ 5 GB file storage
- ✅ Web app access
- ✅ Basic features (chat, files, simple agent builder)

**Team Tier ($15/month per user):**
- ✅ Unlimited users
- ✅ Unlimited agents
- ✅ 100 GB file storage per user
- ✅ Desktop/mobile apps
- ✅ Advanced agent builder
- ✅ Integrations (calendar, email)
- ✅ Priority support

**Enterprise Tier ($custom):**
- ✅ Dedicated instance (single-tenant)
- ✅ Unlimited storage
- ✅ SSO, SAML
- ✅ Advanced security (E2E encryption, audit logs)
- ✅ SLA guarantee (99.9% uptime)
- ✅ Custom integrations
- ✅ White-label option

**Add-Ons (All Tiers):**
- Extra storage: $5/month per 50 GB
- Premium LLMs (GPT-4, Claude Opus): $0.02/call markup
- Custom agent development: $500/agent (one-time)

---

## Go-to-Market Strategy

### Phase 1: Private Beta (Q2 2026)

**Target:** 100 early adopters (tech-savvy individuals)

**Launch:**
- ✅ Vutler Agent (macOS only, Tauri MVP)
- ✅ Vutler Workspace (web only)

**Goals:**
- Validate product-market fit
- Collect feedback on UX, reliability, feature gaps
- Refine onboarding flow

### Phase 2: Public Launch (Q3 2026)

**Target:** 10,000 users in first 90 days

**Launch:**
- ✅ Vutler Agent (macOS, Windows, iOS)
- ✅ Vutler Workspace (web, macOS, Windows)

**Marketing:**
- Product Hunt launch
- Tech influencer outreach (YouTube, Twitter)
- Content marketing (blog posts, tutorials)
- Paid ads (Google, Twitter)

### Phase 3: Scale & Enterprise (Q4 2026)

**Target:** 100,000 users, 500 paying teams

**Launch:**
- ✅ All platforms (Linux, Android)
- ✅ Enterprise features (SSO, audit logs)
- ✅ V2 features (advanced builder, integrations)

**Marketing:**
- Enterprise sales team
- Case studies (early customers)
- Conference presence (TechCrunch Disrupt, Web Summit)

---

## Success Metrics

### North Star Metric
**Weekly Active Agents (WAA)** — # of agents that execute at least 1 task per week

### Key Performance Indicators (KPIs)

**Acquisition:**
- Signups/week (target: 1,000 by end of Q3 2026)
- Conversion rate (free → paid): 5% (industry benchmark)

**Activation:**
- % users who complete onboarding: 80%
- % users who connect first agent: 70%
- Time to first value (TTFV): <5 minutes

**Engagement:**
- Daily active users (DAU): 40% of MAU
- Avg. messages per user per week: 50
- Avg. files uploaded per team per week: 20

**Retention:**
- D7 retention: 60%
- D30 retention: 40%
- Monthly churn: <5%

**Revenue:**
- MRR (Monthly Recurring Revenue): $50K by Q4 2026
- ARPU (Average Revenue Per User): $12/month
- LTV:CAC ratio: >3:1

---

## Technical Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Tauri immaturity** | Delays, bugs in Agent app | Fallback to Electron if critical issues arise |
| **Rocket.Chat limitations** | Missing features for Workspace | Contribute to upstream or fork if needed |
| **LLM API costs** | Burn rate exceeds revenue | Implement rate limiting, prompt caching, consider local LLMs |
| **Mobile OS restrictions** | iOS blocks background execution | Focus on Android for power features, iOS for notifications |
| **Security vulnerabilities** | Data breach, user trust lost | Regular security audits, bug bounty program, E2E encryption |
| **Cross-platform bugs** | Poor UX on some platforms | Automated testing (Playwright, Maestro), beta testing per platform |

---

## Development Roadmap

### Q2 2026 (MVP Launch)

**Month 1 (Feb):**
- [ ] Finalize tech stack (Tauri vs Electron for Agent)
- [ ] Set up monorepo (`vutler-agent/`, `vutler-workspace/`)
- [ ] Design UI/UX (Figma mockups)
- [ ] Backend API endpoints (Express + Rocket.Chat integration)

**Month 2 (Mar):**
- [ ] Vutler Agent: Core chat UI (macOS Tauri)
- [ ] Vutler Agent: System integrations (file, shell, clipboard)
- [ ] Vutler Workspace: Web app (React + Rocket.Chat SDK)
- [ ] Vutler Workspace: File upload/download (S3)

**Month 3 (Apr):**
- [ ] Alpha testing (internal team)
- [ ] Bug fixes, polish
- [ ] Private beta invites (100 users)
- [ ] Onboarding flow, docs

### Q3 2026 (Public Launch)

**Month 4 (May):**
- [ ] Vutler Agent: Windows support (Tauri)
- [ ] Vutler Agent: iOS app (React Native MVP)
- [ ] Vutler Workspace: Desktop apps (Electron wrap)
- [ ] Public beta (open signups)

**Month 5 (Jun):**
- [ ] Product Hunt launch
- [ ] Marketing push (content, ads)
- [ ] V1 feature polish (notifications, voice, search)

**Month 6 (Jul):**
- [ ] Scale infrastructure (load testing, CDN)
- [ ] Customer support setup (Intercom, knowledge base)
- [ ] Analytics dashboard (user metrics, agent usage)

### Q4 2026 (V2 Features + Enterprise)

**Month 7-9 (Aug-Oct):**
- [ ] V2 features (visual agent builder, integrations)
- [ ] Enterprise tier (SSO, audit logs, dedicated instances)
- [ ] Linux + Android support
- [ ] Advanced security (E2E encryption, SOC 2 audit)

---

## Open Questions & Decisions Needed

1. **Local LLM support:** Should we bundle llama.cpp in Agent app, or require users to download models separately?
   - **Recommendation:** Separate download (keeps app size small), offer one-click installer

2. **Mobile strategy:** Should we prioritize iOS or Android first for system features?
   - **Recommendation:** iOS first for notifications (larger paying market), Android later for power features

3. **Pricing model for LLM costs:** Pass-through at cost, or fixed pricing per tier?
   - **Recommendation:** Fixed pricing (predictable for users), adjust tiers based on actual usage data

4. **Open-source strategy:** Should Agent or Workspace be open-source?
   - **Recommendation:** Agent open-source (builds trust, community contributions), Workspace proprietary (revenue driver)

5. **White-label offering:** Should we allow enterprises to rebrand Workspace?
   - **Recommendation:** Yes, for Enterprise tier at $10K+ contracts (high-margin service)

---

## Appendix: Competitive Analysis (Detailed)

### ChatGPT Desktop
- **Strengths:** Brand recognition, GPT-4o access
- **Weaknesses:** No system access, browser-based, no team features
- **Our Edge:** Local execution, system integration, workspace collaboration

### Slack + AI Bots
- **Strengths:** Established teams, integrations
- **Weaknesses:** AI is an add-on, not native; clunky bot UX
- **Our Edge:** AI-first design, built-in agent builder

### Microsoft 365 Copilot
- **Strengths:** Enterprise adoption, Office integration
- **Weaknesses:** Locked to Microsoft ecosystem, expensive
- **Our Edge:** Platform-agnostic, cheaper, more flexible

### Replit Agent
- **Strengths:** Great for coding tasks
- **Weaknesses:** Dev-only, no general productivity
- **Our Edge:** General-purpose (not just coding), team collaboration

### Google Workspace + Duet AI
- **Strengths:** Integrated with Gmail, Docs, Drive
- **Weaknesses:** Limited customization, no local agents
- **Our Edge:** Customizable agents, local execution, not tied to Google

---

## Conclusion

Vutler's dual-client strategy positions us uniquely in the AI workspace market:

- **Vutler Agent** captures **individual users** with a lightweight, powerful personal AI assistant that runs locally and integrates deeply with their OS.

- **Vutler Workspace** converts those users into **paying teams** by offering a Slack-like collaboration platform with native AI agent support.

By launching both products simultaneously, we create a **flywheel**:
1. Users discover Vutler via the free Agent app
2. They invite teammates, creating a workspace
3. Teams upgrade to paid plans for collaboration features
4. Network effects kick in (more agents = more value)

**Next Steps:**
1. Finalize tech stack decisions (Tauri vs Electron)
2. Build MVP prototypes (4-week sprint)
3. Recruit private beta testers (target: 100 by end of March)
4. Iterate based on feedback, launch publicly in Q3 2026

**Investment Ask:**
- **Seed round:** $2M to fund development, launch, and 12 months of runway
- **Use of funds:** 60% engineering (4 devs), 20% marketing, 10% infrastructure, 10% ops

---

**Document Owner:** Luna, Product Manager  
**Last Updated:** February 20, 2026  
**Next Review:** March 15, 2026 (post-beta feedback)
