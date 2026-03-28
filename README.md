# Vutler

Vutler is an agent platform for task execution, business workflows, and connected productivity. It combines a modern web app, tenant-aware backend services, multi-provider LLM orchestration, and operational integrations for teams that want AI agents to do real work.

## Overview

Vutler is built around one core idea: agents should be able to execute tasks, not just chat.

The platform provides:

- **Agent creation and management**
- **Task execution workflows**
- **Connected integrations** for email, drive, social posting, and external tools
- **Multi-provider LLM routing**
- **Tenant-aware architecture**
- **Security controls for production deployments**
- **MCP connectivity** for external agent environments such as Claude Code

Vutler currently operates as two distinct surfaces:

- **`vutler.ai`** — landing site, product presentation, marketing pages
- **`app.vutler.ai`** — authenticated application used to create, configure, and run agents

This split replaces the previous single-domain approach and reflects the current product architecture.

---

## Architecture

### Product surfaces

#### `vutler.ai`
Public website for:

- product messaging
- pricing and offers
- onboarding entry points
- documentation and discovery

#### `app.vutler.ai`
Authenticated product application for:

- workspace and tenant operations
- agent provisioning
- task execution
- integrations management
- billing-linked add-ons
- internal chat and agent workflows

### Current tech stack

#### Frontend
- **Next.js 14** with **App Router**
- **TypeScript**
- **Tailwind CSS**
- **shadcn/ui**

#### Backend
- **Express.js**
- **Node.js**

#### Database
- **Supabase**
- **PostgreSQL**
- tenant schema: **`tenant_vutler`**

#### Authentication
- **Supabase Auth**
- **X-API-Key** support for MCP and programmatic access

#### LLM providers
- **Anthropic**
- **OpenAI Codex via ChatGPT OAuth**
- **OpenRouter**
- **Mistral**
- **Groq**
- **Google**

#### Storage
- **Exoscale SOS**
- Swiss hosting, aligned with **GDPR / LPD** requirements

#### Deployment
- **Ubuntu VPS**
- **Docker**
- **PM2**

### Communication model

Vutler uses a **native WebSocket chat layer** for real-time interactions inside the app.  
This replaces the previous Rocket.Chat-based approach.

### Data layer

Vutler no longer uses MongoDB. The current persistent layer is centered on **Supabase/PostgreSQL** with tenant-aware organization and application-managed service boundaries.

---

## LLM Providers

Vutler supports multiple providers so agents can be routed according to task type, latency, capability, or fallback policy.

### Anthropic
Anthropic is used across the platform and also serves as an important **fallback provider for task execution** when required by orchestration logic or reliability policy.

### Codex via ChatGPT OAuth
Vutler integrates **Codex** using:

- `chatgpt.com/backend-api/codex/responses`
- **ChatGPT OAuth**
- **SSE streaming**

This enables Vutler agents to use Codex-oriented execution paths within the product’s authenticated model pipeline.

### OpenRouter
Used for model access abstraction and broader provider reach when needed.

### Groq
Available for latency-sensitive workloads.

### Mistral
Supported as part of the current provider matrix.

### Google
Supported for compatible model workflows.

### Model strategy
Vutler’s current agent platform is aligned with **Codex-oriented models** and current provider capabilities.  
Legacy references to older model sets such as `gpt-4o` or `claude-3.5-sonnet` have been removed from product documentation.

---

## Agent Platform

### Agent-first workflow
Vutler lets users create specialized agents that can be configured for distinct business or operational roles.

### Agent type wizard
The platform includes an **agent type wizard** to guide creation and configuration. This helps standardize setup, reduce friction, and align capabilities with the intended use case.

### Skills system
Agents are configured with a bounded skill model:

- agents can have **up to 8 skills maximum**
- skill limits help control scope, behavior, and execution surface
- this structure supports clearer provisioning and more predictable operations

### Auto-provisioning
Agents can be provisioned with preconfigured defaults based on type, selected skills, and connected services. This allows faster deployment while preserving tenant-level configuration boundaries.

### Task execution
Vutler agents are built to:

- receive tasks
- use connected context
- call tools or integrations
- stream progress
- complete execution-oriented workflows

### Context and memory
Vutler integrates **Snipara** for context and memory-related capabilities. This supports better retrieval and continuity during execution workflows.

---

## Integrations

## MCP Nexus Bridge

Vutler provides **MCP Nexus Bridge** through **`@vutler/mcp-nexus`**.

This bridge allows external environments, including **Claude Code**, to delegate tasks into Vutler and access the platform through an MCP-compatible layer.

Key points:

- MCP bridge package: **`@vutler/mcp-nexus`**
- supports delegation of tasks from **Claude Code**
- supports **X-API-Key** authentication
- enables secure machine-to-platform connectivity

This is a core integration point for developer workflows and external agent orchestration.

---

## Post for Me

**Post for Me** is Vutler’s social media integration layer.

It allows agents or configured workflows to prepare and publish content through supported social channels, with monetization handled through **Stripe add-on packs**.

Highlights:

- social media posting workflow
- packaged as paid add-ons
- Stripe-linked commercial model
- built for operational delegation rather than standalone social scheduling only

---

## Email

Vutler supports email-connected workflows for agents and task automation, enabling use cases such as:

- drafting
- task-triggered communication
- inbox-connected execution
- operational follow-up actions

---

## Drive

Vutler supports drive/document workflows for agents, including retrieval and task context enrichment where configured.

---

## Security Highlights

Security has been treated as a first-class concern in the current product iteration.

### Pre-production audit
A **pre-production audit** was conducted before release hardening.

### Remediation program
Issues were tracked and remediated using severity tiers:

- **P0**
- **P1**
- **P2**

### Sandbox auth guard
A **sandbox auth guard** has been added to protect isolated execution or development paths from unauthorized access patterns.

### Authentication
Current auth stack includes:

- **Supabase Auth** for application users
- **X-API-Key** support for MCP and programmatic clients

### Storage and compliance posture
File/object storage uses **Exoscale SOS** in Switzerland, with alignment goals around:

- **GDPR**
- **LPD**

---

## Development

### Stack summary
- Next.js 14 App Router frontend
- Express.js backend
- Supabase/PostgreSQL data layer
- Dockerized deployment targets
- PM2 process supervision on Ubuntu VPS

### Repository structure
The exact structure may evolve, but the platform is organized around:

- frontend application code
- backend/API services
- integration modules
- agent orchestration logic
- deployment and infra configuration

A typical high-level structure looks like:

```bash
.
├── app/                # Next.js application surface
├── server/             # Express backend and APIs
├── components/         # UI components
├── lib/                # shared services, utils, provider clients
├── integrations/       # external connectors and platform integrations
├── scripts/            # automation and maintenance scripts
├── docker/             # container-related assets
└── docs/               # internal or product documentation
```

### Local development
Install dependencies:

```bash
npm install
```

Run frontend dev server:

```bash
npm run dev
```

Run backend dev server:

```bash
npm run server:dev
```

Build production assets:

```bash
npm run build
```

Start production mode:

```bash
npm run start
```

### Environment configuration
Typical environment variables include:

```bash
# App
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_MARKETING_URL=

# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Database / tenant config
DATABASE_URL=

# Auth / API
X_API_KEY=

# LLM providers
ANTHROPIC_API_KEY=
OPENROUTER_API_KEY=
MISTRAL_API_KEY=
GROQ_API_KEY=
GOOGLE_API_KEY=

# ChatGPT / Codex
CHATGPT_OAUTH_CLIENT_ID=
CHATGPT_OAUTH_CLIENT_SECRET=
CHATGPT_OAUTH_REDIRECT_URI=

# Storage
EXOSCALE_SOS_ENDPOINT=
EXOSCALE_SOS_BUCKET=
EXOSCALE_SOS_ACCESS_KEY=
EXOSCALE_SOS_SECRET_KEY=

# Billing / add-ons
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

> Adjust variable names to match the actual implementation in this repository.

### Deployment
Production deployment currently targets:

- **Ubuntu VPS**
- **Docker**
- **PM2**

Typical flow:

```bash
docker compose up -d --build
pm2 start ecosystem.config.js
```

---

## What changed from previous documentation

The current README reflects the actual product state and intentionally removes outdated references.

### Removed
- Rocket.Chat
- MongoDB
- MiniMax
- legacy model references such as `gpt-4o` and `claude-3.5-sonnet`
- previous mono-domain architecture description

### Added / clarified
- separation between **`vutler.ai`** and **`app.vutler.ai`**
- **Codex** integration via `chatgpt.com/backend-api/codex/responses`
- **ChatGPT OAuth**
- **SSE streaming**
- **Anthropic fallback** for task execution
- **MCP Nexus Bridge** via `@vutler/mcp-nexus`
- **Post for Me** and Stripe add-on packs
- **agent type wizard**
- **skill cap of 8**
- **Snipara** integration for context/memory
- security audit and remediation highlights
- **X-API-Key** support for MCP auth

---

## Links

- **Marketing / landing:** `https://vutler.ai`
- **Application:** `https://app.vutler.ai`

If this repository includes additional internal docs, deployment playbooks, or provider setup guides, they should be linked here as they are finalized.
```

Si tu veux, je peux aussi te fournir une **version encore plus “finale repo-ready”**, avec :
1. badges,
2. section installation plus précise,
3. arborescence adaptée au repo réel si tu me donnes la structure,
4. et un **diff éditorial** expliquant chaque changement par rapport à l’ancien README.
