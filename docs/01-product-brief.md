# Product Brief: Vutler

**Date:** 2026-02-16  
**Author:** Luna (Product Vision Builder)  
**Status:** Draft

---

## Executive Summary

**Vutler is the complete agent-as-a-service platform:** Create your AI workforce with ready-to-use templates, or bring your own agents from OpenClaw, LangChain, CrewAI. Either way, Vutler gives them email, chat, presence, calendar, and drive — treating agents as first-class digital employees. 

Unlike traditional tools (Slack, Teams) built for humans only, or agent builders (Relevance AI, AgentGPT) that lack collaboration infrastructure, Vutler provides **both creation and workspace** with native API-first architecture, Swiss-hosted compliance, and support for teams running 3-50 AI agents in production.

---

## Problem Statement

**Dual User Problem:**  

**1. Teams WITH agents** (3-50 agents from OpenClaw, LangChain, CrewAI, custom):  
No proper collaboration infrastructure for their AI workforce. Teams cobble together consumer tools (K-Suite, Google Workspace, Microsoft 365) designed for humans, leading to identity chaos, lack of programmatic control, compliance violations, and inability to coordinate multi-agent workflows.

**2. Teams WITHOUT agents** (non-technical users, businesses wanting AI workforce):  
Want to deploy AI agents but lack technical expertise to build them. Agent builders (Relevance AI, AgentGPT) exist but lack collaboration primitives — agents can't email, chat, or coordinate. Result: isolated agents with no real-world utility.

**Evidence:**
- **Starbox Group's own experience:** 10 AI agents on Infomaniak K-Suite = identity hell, no API control, compliance uncertainty
- **Market gap:** No platform offers BOTH agent creation AND workspace infrastructure
- **Framework explosion:** LangChain (100k+ users), CrewAI (50k+), OpenClaw users have no standard collaboration layer
- **Non-technical demand:** Businesses want "AI employees" but can't build them; existing builders lack workspace features
- **Compliance barrier:** Swiss/EU data residency requirements prevent use of US-based SaaS

**Impact if Unsolved:**  
- **For technical teams:** Security risk (shared accounts), operational chaos (no visibility), scale blocker (custom infra = months)
- **For non-technical teams:** Locked out of AI revolution; forced to hire expensive developers or use isolated tools that don't integrate
- **Compliance violations:** US-based SaaS violates Swiss/EU data protection requirements

---

## Target Users

**Persona 1: AI-First Startup Founder (Alex) — "Bring Your Agents"**
- **Who:** Technical founders running 3-10 AI agents in production (dev, support, content, sales agents)
- **Current Behavior:** Patching together Gmail + Slack + Zapier + custom scripts; creating fake "employee" accounts; constant authentication workarounds
- **Pain Points:** 
  1. Identity management chaos (fake emails, shared credentials)
  2. No programmatic control (can't orchestrate agents via API)
  3. Billing confusion (paying per "user seat" for AI agents)
- **Vutler offering:** **Workspace** — API-first infra for existing agents

**Persona 2: Non-Technical Business Owner (Elena) — "Build Your Agents"** ⭐ NEW
- **Who:** Small business owners, consultants, agencies wanting AI workforce but lacking coding skills
- **Current Behavior:** Hiring freelancers to build custom agents (expensive, slow); using ChatGPT manually (not scalable); watching competitors deploy AI
- **Pain Points:**
  1. Can't code — locked out of AI agent revolution
  2. Existing agent builders (ChatGPT, Relevance AI) lack collaboration (no email, chat, calendar)
  3. Don't know where to start — need templates, guidance
- **Vutler offering:** **Creation + Workspace** — No-code agent templates + full collaboration infra

**Persona 3: Compliance-Focused Enterprise IT (Stefan) — "Bring + Audit"**
- **Who:** IT leaders at Swiss/EU companies with data sovereignty requirements
- **Current Behavior:** Banned from using US SaaS; running on-prem Exchange/SharePoint (legacy hell) or expensive EU alternatives
- **Pain Points:**
  1. Data residency requirements block modern collaboration tools
  2. Legacy on-prem solutions don't support AI agent workflows
  3. Audit requirements for AI activity (who did what, when)
- **Vutler offering:** **Workspace + Compliance** — Swiss-hosted, full audit trail

**Persona 4: Solo AI Builder / Dev (Maya) — "Build + Bring"**
- **Who:** Individual developers building multi-agent systems (LangChain, CrewAI, custom frameworks)
- **Current Behavior:** No collaboration layer; agents communicate via file system, Redis, or custom message queues
- **Pain Points:**
  1. No standard primitives for agent-to-agent communication
  2. Rebuilding email/chat/calendar from scratch for each project
  3. No visibility or monitoring of agent interactions
- **Vutler offering:** **Workspace + Templates** — Batteries-included infra + agent starter kits

---

## Value Proposition

**The New Pitch:**
> **"Vutler — Create your AI workforce, or bring your own. The complete workspace for AI agents."**

**For** teams wanting AI employees AND proper collaboration infrastructure  
**Who** need BOTH agent creation (templates, no-code) AND workspace (email, chat, calendar, drive)  
**Vutler** **is the** first complete agent-as-a-service platform  
**That** lets you build agents from templates OR connect existing agents (OpenClaw, LangChain, CrewAI), then give them full collaboration primitives with API control and Swiss hosting  
**Unlike** agent builders (Relevance AI, AgentGPT) that lack workspaces OR collaboration tools (Slack, Teams) that lack agent creation  
**Our product** provides BOTH: create agents (no-code templates) AND workspace (email, chat, calendar, drive) with native programmatic control, compliance-ready deployment, and flat pricing

---

## Solution Overview

**Double Offering:**

### Track 1: "Build Your Agents" (NEW!) — Agent Creation Platform

**For non-technical users and rapid prototyping:**

1. **Agent Templates Library** - Ready-to-deploy agent templates (Customer Support Agent, Content Writer, Research Assistant, Sales Rep, etc.)
   - *Why it matters:* Non-coders can deploy AI workforce in minutes, not months

2. **No-Code Agent Builder** - Visual workflow designer; configure agent behavior, prompts, tools, triggers without coding
   - *Why it matters:* Democratizes AI agents; business users don't need developers

3. **Framework Integration** - One-click OpenClaw agent deployment; LangChain/CrewAI import; bring custom agents
   - *Why it matters:* Bridge between "build" and "bring your own" — works with existing tools

4. **Agent Marketplace** - Community-contributed agent templates; one-click deploy (like Heroku buttons or Vercel templates)
   - *Why it matters:* Network effects; community drives innovation

### Track 2: "Bring Your Agents" (Core) — Workspace Infrastructure

**For technical teams with existing agents:**

1. **Agent Identity & Authentication** - API-key-based auth for agents; OIDC/SAML for humans; each agent has proper identity, avatar, presence status
   - *Why it matters:* Eliminates fake accounts and shared credentials; enables proper audit trails

2. **Agent-Native Email** - Full SMTP/IMAP/API access; agents send/receive email programmatically; threaded conversations; attachment handling
   - *Why it matters:* Agents can communicate with external systems and humans via standard email protocol

3. **Real-Time Chat (Team & Direct)** - WebSocket + REST API; agent-to-agent and agent-to-human channels; presence indicators; message threading
   - *Why it matters:* Synchronous coordination for multi-agent workflows; humans can monitor and intervene

4. **Shared Drive (Document Storage)** - S3-compatible storage; API upload/download; version history; access control per agent/human
   - *Why it matters:* Agents need persistent storage for artifacts, reports, generated content

5. **Calendar & Scheduling** - CalDAV API; agents can book/check availability; integration with human calendars; scheduling coordination
   - *Why it matters:* Time-based agent orchestration (e.g., "daily report agent runs at 9 AM")

6. **Self-Hosted Deployment** - Docker Compose + Kubernetes manifests; Swiss/EU hosting options; SQLite/PostgreSQL backend
   - *Why it matters:* Data sovereignty, compliance, zero SaaS vendor lock-in

**Success Looks Like:**
- AI-first team deploys Vutler in <30 minutes and migrates 5 agents from scattered tools
- Agent sends first email via API within 5 minutes of setup
- Compliance officer can show "data never leaves Switzerland" and full audit log
- Human team leads can see real-time presence and activity of all agents in one dashboard

---

## Market Context

**Competitive Landscape:**

**Agent Builders (NEW competitive set):**
- **Relevance AI, AgentGPT, CrewAI Studio** - Let users build agents via UI/templates; NO collaboration layer (no email, chat, calendar)
  - *Gap we fill:* Agent creation PLUS full workspace infrastructure

- **ChatGPT Custom GPTs, Claude Projects** - Single-agent tools; no multi-agent coordination; no "real" identities (email, chat)
  - *Gap we fill:* Multi-agent platform with real collaboration primitives

**Collaboration Tools (existing competitive set):**
- **Slack / Microsoft Teams** - Built for humans; no API-first agent support; US-hosted (compliance blocker); expensive per-seat pricing kills economics for AI agents
  - *Gap we fill:* Native agent identity + agent CREATION, programmatic control, self-hosted compliance

- **Rocket.Chat** - Open-source chat (our likely fork base); lacks email, calendar, drive integration; no agent-specific features; complex self-hosting
  - *Gap we fill:* Complete collaboration suite + AGENT CREATION, agent-first primitives, turnkey deployment

- **Custom Infrastructure** - Teams build their own (message queues, file storage, email wrappers)
  - *Gap we fill:* Pre-built, standardized, production-ready platform (vs. months of custom dev) + no-code agent templates

- **Google Workspace / Microsoft 365** - Human-centric; compliance issues; per-seat costs prohibitive for AI agents; no programmatic agent control
  - *Gap we fill:* Agent-native + agent CREATION, self-hosted, API-first design

**Our Unique Position:** Only platform with BOTH agent creation (no-code templates) AND workspace infrastructure (email, chat, calendar, drive)

**Market Opportunity (EXPANDED with agent creation):**  
- **TAM:** 500,000+ businesses wanting AI workforce (Gartner: 80% of enterprises will use AI agents by 2026) + 50M SMBs globally wanting automation
- **SAM:** 
  - **Technical ("Bring"):** 5,000+ AI-first startups + Swiss/EU orgs with existing agents
  - **Non-Technical ("Build"):** 50,000+ SMBs, consultants, agencies wanting AI employees but lacking dev skills
- **SOM (Year 1):** 
  - "Bring" segment: 100-300 technical early adopters (existing target)
  - "Build" segment: 200-500 non-technical users (NEW — using templates/no-code)
  - **Total: 300-800 users/teams** (3-5× larger than workspace-only)
- **Growth trend:** Multi-agent frameworks growing 300%+ YoY + no-code AI tools (ChatGPT, Claude) proving non-technical demand
- **Timing:** AI agents moving from research to production; "AI employees" entering mainstream vocabulary

---

## Strategic Fit

**Business Goals:**  
Vutler is the **3rd product in Starbox Group's AI infrastructure stack**:
1. **Snipara** - AI memory and context management
2. **Vaultbrix** - Swiss-hosted database for AI applications
3. **Vutler** - Collaboration platform for AI agents

**Product Synergy:**
- Snipara agents need collaboration primitives → Vutler
- Vaultbrix customers need compliance-ready communication → Vutler
- All three products share Swiss-hosted, self-hosted, AI-first positioning

**Why Now:**  
- **We live the problem:** Starbox's 10 agents on Infomaniak K-Suite is painful and non-scalable
- **Market timing:** AI agents moving from research to production (2024-2026 inflection point)
- **Tech enabler:** Rocket.Chat provides MIT-licensed fork base (TypeScript/Meteor stack Alex knows)
- **Compliance wave:** Swiss/EU data laws make US SaaS unviable for growing segment
- **Open-source opportunity:** First mover in "agent-first collaboration" category can own the space

---

## Constraints & Assumptions

**Constraints:**
- **Zero budget:** No cash for licenses, SaaS, or contractors; 100% bootstrapped
- **Timeline:** MVP in 8 weeks (mid-April 2026 deadline)
- **Team:** 10 AI agents + Alex (CEO/dev); no human employees
- **Tech stack:** Must fork existing open-source (Rocket.Chat likely); TypeScript/Meteor (Alex's expertise)

**Key Assumptions:**
- ✅ Rocket.Chat MIT license allows forking for commercial use (VALIDATE: legal review)
- ✅ AI agents can build/test significant portions of codebase (VALIDATE: dev velocity experiment)
- ✅ 100-500 early adopters exist and will self-host (VALIDATE: landing page + email signups)
- ✅ Email (SMTP) + Chat (WebSocket) + Drive (S3 API) are sufficient for MVP (VALIDATE: user interviews)
- ✅ Agent-first teams will accept Docker Compose complexity vs. SaaS ease (VALIDATE: user research)

---

## Next Steps

1. **Validate fork strategy** - Alex - Week 1
   - Review Rocket.Chat codebase, license, extension points
   - Spike: Add agent identity + API-key auth prototype
   - Decision: Fork Rocket.Chat vs. build from scratch

2. **User research interviews** - Luna (this agent) - Week 1-2
   - Interview 5-10 AI-first founders (target persona)
   - Validate problem, features, willingness to self-host
   - Refine pricing model (open-source vs. hosted service)

3. **Create full PRD** - Luna - Week 1
   - Complete requirements document
   - Technical architecture guidance
   - Story breakdown for MVP

4. **Alpha deployment** - AI dev agents - Week 2-8
   - Fork Rocket.Chat, add agent primitives
   - Dogfood with Starbox's 10 agents
   - Iterate based on internal use

**Decision Needed By:** 2026-02-23 (1 week) - Fork vs. build decision
