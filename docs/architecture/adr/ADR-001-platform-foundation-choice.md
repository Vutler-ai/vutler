# ADR-001: Platform Foundation Choice - Rocket.Chat Fork

**Status:** Accepted  
**Date:** 2026-02-16  
**Deciders:** Alex Lopez, Architecture Team  
**Technical Story:** Vutler - Office 365 for AI Agents MVP

---

## Context

We are building Vutler, an "agent-native" collaboration platform where AI agents are first-class citizens alongside human users. The platform needs:

- **Core collaboration features**: Real-time chat, channels, threads, presence, reactions
- **Agent-specific features**: Email in/out per agent, agent directory, API-first design
- **Productivity suite**: Drive/file storage (MinIO/S3), calendar, email
- **Integration**: Must integrate with Snipara (context/memory) and Vaultbrix (PostgreSQL/Supabase-compatible)
- **Timeline**: 2-month MVP with a team of 10 AI agents + 1 human (Alex)
- **Philosophy**: Self-hosted, open-source, agent-centric from day one

The fundamental decision is whether to:
1. Fork an existing collaboration platform
2. Build from scratch
3. Use a headless/backend-only solution and build custom frontend

**Team constraints:**
- Limited human oversight (primarily AI agents building)
- 2-month timeline is aggressive
- Must be TypeScript-friendly (AI agents work well with typed systems)
- Need proven patterns, not greenfield architecture decisions

---

## Decision

**We will fork Rocket.Chat** and transform it into an agent-native platform.

---

## Options Considered

### Option 1: Fork Rocket.Chat (TypeScript/Meteor)

**Description:**  
Fork Rocket.Chat, which is MIT-licensed, TypeScript-based, built on Meteor framework. It provides real-time chat, channels, presence, file sharing, and a mature codebase (~10 years old).

**Pros:**
- ✅ **Proven foundation**: Battle-tested with 12M+ users, mature codebase
- ✅ **MIT license**: Full freedom to modify and commercialize
- ✅ **TypeScript**: Strongly typed, great for AI agent development
- ✅ **Real-time out of the box**: Meteor's DDP protocol handles websockets
- ✅ **Feature-rich**: Already has channels, threads, reactions, presence, file upload
- ✅ **API-first**: REST API + realtime API already exist
- ✅ **MongoDB + PostgreSQL support**: Can integrate with Vaultbrix
- ✅ **Active community**: Large ecosystem, lots of Stack Overflow answers
- ✅ **Docker-ready**: Existing Docker deployment patterns

**Cons:**
- ❌ **Meteor framework**: Somewhat dated, opinionated, smaller community than Express/Fastify
- ❌ **Technical debt**: Legacy patterns, need to refactor for agent-first model
- ❌ **Bundle size**: Meteor apps can be heavy, optimization needed
- ❌ **Learning curve**: AI agents need to understand Meteor's reactivity model

**Estimated Effort:** Medium (2-3 weeks to understand codebase, 6-8 weeks to transform)  
**Risk Level:** Medium (technical debt, Meteor learning curve)

---

### Option 2: Fork Mattermost (Go)

**Description:**  
Fork Mattermost, a Slack alternative written in Go. MIT-licensed, strong focus on security and enterprise features.

**Pros:**
- ✅ **MIT license**: Full freedom
- ✅ **Go backend**: Fast, compiled, simple concurrency model
- ✅ **Enterprise-ready**: Strong security, compliance features
- ✅ **Good API**: REST + WebSocket APIs
- ✅ **PostgreSQL native**: Aligns with Vaultbrix

**Cons:**
- ❌ **Go learning curve**: AI agents primarily work with TypeScript/JavaScript
- ❌ **React frontend separate**: More complex architecture (Go + React)
- ❌ **Less agent-friendly**: Built for humans, more refactoring needed
- ❌ **Smaller extension ecosystem**: Fewer plugins compared to Rocket.Chat

**Estimated Effort:** High (Go learning + larger refactor for agent model)  
**Risk Level:** High (language barrier for AI agent team)

---

### Option 3: Fork Huly (TypeScript/Svelte)

**Description:**  
Fork Huly, a new open-source platform (alternative to Linear/Jira/Slack). Built with TypeScript, Svelte frontend, modern architecture.

**Pros:**
- ✅ **Modern stack**: TypeScript, Svelte, clean architecture
- ✅ **Apache 2.0 license**: Open source
- ✅ **Designed for collaboration**: Chat + project management integrated
- ✅ **TypeScript throughout**: Great for AI agents

**Cons:**
- ❌ **Young project**: Less mature (~2 years old), smaller community
- ❌ **Unproven at scale**: Unknown performance characteristics
- ❌ **Less documentation**: Steeper onboarding for AI agents
- ❌ **Svelte frontend**: Team would need to learn Svelte (vs React which is more common)
- ❌ **Missing features**: Less feature-complete than Rocket.Chat

**Estimated Effort:** High (immature codebase, more unknowns)  
**Risk Level:** High (unproven technology, smaller community)

---

### Option 4: Matrix Protocol (Synapse/Dendrite)

**Description:**  
Build on top of Matrix, an open protocol for decentralized communication. Use Synapse (Python) or Dendrite (Go) as homeserver.

**Pros:**
- ✅ **Decentralized**: Future-proof, federated architecture
- ✅ **Open standard**: Not tied to single implementation
- ✅ **Strong encryption**: E2E encryption built-in
- ✅ **Growing ecosystem**: Clients, bridges, bots

**Cons:**
- ❌ **Complexity**: Federation adds architectural complexity
- ❌ **Python (Synapse)**: Not TypeScript, different from Snipara stack
- ❌ **Performance concerns**: Matrix can be resource-heavy
- ❌ **Overkill**: We don't need federation for MVP
- ❌ **More setup**: Homeserver + client + bridges

**Estimated Effort:** Very High (protocol complexity + federation overhead)  
**Risk Level:** Very High (over-engineered for MVP needs)

---

### Option 5: Build from Scratch (Express + React)

**Description:**  
Build custom platform using Express.js (or Fastify) backend, React frontend, Socket.io for real-time, PostgreSQL + Redis.

**Pros:**
- ✅ **Full control**: Zero technical debt, agent-first from day one
- ✅ **Modern stack**: Choose best tools for each layer
- ✅ **Tailored**: Every feature designed for agents, no human-centric baggage
- ✅ **TypeScript native**: Can use latest patterns

**Cons:**
- ❌ **Massive scope**: 2 months not enough to build chat + channels + presence + files + email + calendar
- ❌ **Reinventing wheels**: Real-time, presence, file uploads are hard to get right
- ❌ **No battle-testing**: All bugs are ours to find and fix
- ❌ **Integration complexity**: Auth, permissions, notifications all from scratch
- ❌ **High risk**: Likely to miss MVP deadline

**Estimated Effort:** Very High (12+ weeks for MVP feature parity)  
**Risk Level:** Critical (timeline failure near-certain)

---

## Decision Rationale

**Key Criteria:**

1. **Timeline feasibility (Weight: CRITICAL)**
   - **Rocket.Chat**: ✅ Can ship MVP in 2 months with modifications
   - **Mattermost**: ⚠️ Go learning curve risks timeline
   - **Huly**: ⚠️ Immature codebase, unknowns
   - **Matrix**: ❌ Too complex for 2-month MVP
   - **From Scratch**: ❌ Impossible in 2 months

2. **TypeScript ecosystem (Weight: HIGH)**
   - **Rocket.Chat**: ✅ TypeScript throughout
   - **Mattermost**: ❌ Go backend
   - **Huly**: ✅ TypeScript throughout
   - **Matrix**: ⚠️ Depends on implementation (Python/Go)
   - **From Scratch**: ✅ Can be full TypeScript

3. **Feature completeness (Weight: HIGH)**
   - **Rocket.Chat**: ✅ 90% of features already exist
   - **Mattermost**: ✅ 80% feature-complete
   - **Huly**: ⚠️ 60% feature-complete
   - **Matrix**: ⚠️ 70% (protocol exists, need to build client)
   - **From Scratch**: ❌ 0%, must build everything

4. **AI agent development experience (Weight: HIGH)**
   - **Rocket.Chat**: ✅ TypeScript, good docs, AI-friendly
   - **Mattermost**: ⚠️ Language barrier
   - **Huly**: ⚠️ Limited docs
   - **Matrix**: ❌ Protocol complexity
   - **From Scratch**: ⚠️ High cognitive load (architecture decisions)

5. **Community & support (Weight: MEDIUM)**
   - **Rocket.Chat**: ✅ Large community, 10+ years
   - **Mattermost**: ✅ Strong enterprise community
   - **Huly**: ❌ Small, nascent community
   - **Matrix**: ✅ Active protocol community
   - **From Scratch**: ❌ No community

6. **Integration with Snipara + Vaultbrix (Weight: MEDIUM)**
   - **Rocket.Chat**: ✅ Can integrate via API, supports PostgreSQL
   - **Mattermost**: ✅ PostgreSQL native, good API
   - **Huly**: ✅ Can integrate
   - **Matrix**: ⚠️ More complex integration
   - **From Scratch**: ✅ Can design for integration

**Decision:**

Rocket.Chat wins on **timeline feasibility** (the critical constraint) and **feature completeness**. While Meteor is not the most modern framework, it's a known quantity with TypeScript support. The codebase is mature enough that AI agents can reason about it with help from documentation and Stack Overflow.

The trade-off we accept: Meteor's learning curve and some technical debt. This is vastly preferable to:
- Missing the 2-month deadline (from-scratch)
- Fighting a Go learning curve (Mattermost)
- Betting on immature technology (Huly)
- Over-engineering with federation (Matrix)

**Validation through team context:**
- 10 AI agents + Alex: AI agents work well with TypeScript, documentation, and existing patterns. Rocket.Chat provides all three.
- Snipara integration: Node.js ↔ Node.js integration is natural.
- Vaultbrix: Rocket.Chat supports PostgreSQL, alignment is possible.

---

## Consequences

### Positive
- ✅ **Ship MVP in 2 months**: Realistic timeline with feature-rich starting point
- ✅ **80% of features exist**: Chat, channels, presence, threads, reactions, file upload out of the box
- ✅ **TypeScript throughout**: AI agents can work efficiently
- ✅ **Battle-tested code**: Real-time, permissions, auth already work
- ✅ **Docker deployment**: Can self-host easily
- ✅ **API-first**: REST + WebSocket APIs ready for agent interactions
- ✅ **Large community**: Stack Overflow answers, plugins, examples

### Negative
- ⚠️ **Meteor learning curve**: AI agents must learn Meteor's patterns (DDP, reactive data, publications/subscriptions)
- ⚠️ **Technical debt**: Will inherit Rocket.Chat's legacy decisions
- ⚠️ **Refactoring needed**: Human-centric UI must become agent-centric
- ⚠️ **Bundle size**: Meteor apps are heavier, need optimization
- ⚠️ **Vendor risk**: Dependent on Rocket.Chat's continued MIT license (though we can fork permanently)

### Neutral
- ℹ️ **MongoDB or PostgreSQL**: Rocket.Chat supports both; we'll choose PostgreSQL for Vaultbrix alignment
- ℹ️ **Meteor framework commitment**: For MVP, we're betting on Meteor. Post-MVP, we can evaluate migrating to Express/Fastify if needed
- ℹ️ **UI framework**: Rocket.Chat uses React, which is standard

---

## Implementation Plan

**Phase 1: Setup & Discovery (Week 1)**
- [ ] Fork Rocket.Chat repository to Starbox org
- [ ] Set up development environment (Docker Compose)
- [ ] Document Meteor architecture for AI agents
- [ ] Create Snipara context for Rocket.Chat codebase
- [ ] Identify key files/modules for agent-centric refactor

**Phase 2: Core Agent Features (Weeks 2-4)**
- [ ] Add "agent" user type (vs "human" user)
- [ ] Implement agent email in/out (SMTP/IMAP per agent)
- [ ] Build agent directory (replaces "user directory")
- [ ] Integrate Snipara context/memory API
- [ ] Configure PostgreSQL (replace or add to MongoDB)

**Phase 3: Productivity Features (Weeks 5-6)**
- [ ] Integrate MinIO for agent drive/file storage
- [ ] Add basic calendar (agent scheduling)
- [ ] Expose agent-friendly REST API
- [ ] Implement agent presence (active/idle/busy)

**Phase 4: Integration & Deployment (Weeks 7-8)**
- [ ] Vaultbrix integration (PostgreSQL auth, data storage)
- [ ] Docker Compose for self-hosted deployment
- [ ] API documentation for agent interactions
- [ ] Testing and bug fixes

**Timeline:** 8 weeks (2 months)  
**Owner:** AI Agent Team + Alex

---

## Validation & Success Criteria

**How we'll know this was the right decision:**

1. **MVP ships on time**: Functional Vutler platform in 2 months
2. **Agent productivity**: AI agents can build on Rocket.Chat codebase without excessive human help
3. **Feature velocity**: Can add agent-specific features faster than from-scratch would allow
4. **Stability**: Inherited features (chat, presence, files) work reliably
5. **Integration success**: Snipara + Vaultbrix integrate cleanly via APIs

**When to revisit this decision:**

- **If** Meteor becomes unmaintained or loses TypeScript support → Consider migration to Express/Fastify
- **After** MVP launch: Evaluate technical debt vs. rewrite trade-off
- **When** we need features Meteor makes difficult (e.g., custom real-time protocol)
- **After** 12 months: Retrospective on Meteor's impact on development velocity

**Migration escape hatch:**
If Meteor becomes untenable, we can extract the data model and business logic, rebuild with Express + Socket.io. The API contracts can remain stable.

---

## References

- [Rocket.Chat GitHub](https://github.com/RocketChat/Rocket.Chat)
- [Rocket.Chat Architecture Docs](https://developer.rocket.chat/rocket.chat/architecture)
- [Mattermost Architecture](https://docs.mattermost.com/developer/architecture.html)
- [Huly Platform](https://github.com/hcengineering/platform)
- [Matrix Protocol](https://matrix.org)
- [Meteor Framework](https://www.meteor.com)

---

## Notes

**Why not Slack/Teams/Discord?**
These are proprietary, closed-source platforms. We need:
- Self-hosted control
- Ability to modify core for agent-centric design
- No licensing restrictions
- Open-source philosophy

**Why not Zulip?**
Zulip is Python/Django, which misaligns with our TypeScript/Node.js stack (Snipara). Rocket.Chat's Node.js foundation makes integration more natural.

**Meteor concerns addressed:**
Yes, Meteor is less popular than Express. But:
- TypeScript support is solid
- Real-time is easier in Meteor than Socket.io (less boilerplate)
- AI agents can learn Meteor patterns through documentation
- Post-MVP, we can migrate if needed (but we'll likely keep the core if it works)

**Agent-first transformation strategy:**
We're not just forking Rocket.Chat as-is. The refactor will:
1. Add "agent" as a first-class entity (not just a "bot" or "user")
2. Agent-specific permissions, actions, and UI
3. Email in/out per agent (unique addresses)
4. API-first design (agents interact via API, not just UI)
5. Context/memory integration (every agent has Snipara context)

This is **Rocket.Chat as foundation**, not Rocket.Chat as final product.
