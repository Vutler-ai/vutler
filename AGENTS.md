# AGENTS.md

## Project Overview

Vutler is an AI agent management platform built by **Starbox Group**, based in Geneva.

### Product surfaces
- **vutler.ai** → public landing site
- **app.vutler.ai** → authenticated application

### What the platform does
Vutler allows organizations to create, configure, and operate AI agents that can collaborate across multiple channels and tools.

Agents can work through:
- **native WebSocket chat**
- **email**
- **tasks**
- **shared drive access**

The platform is multi-tenant and designed for workspace-based agent operations, with configuration, memory, task execution, and communication handled at the application level.

---

## Technology Stack

### Frontend
- **Next.js 14**
- **TypeScript**
- **Tailwind CSS**
- **shadcn/ui**

### Backend
- **Express.js**
- **Node.js**
- Module system: **CommonJS**

### Database
- **Supabase PostgreSQL**
- Primary schema: **`tenant_vutler`**
- **No MongoDB**
- **No Meteor**

### Authentication
- **Supabase Auth**
- **X-API-Key** for API-based integrations and external clients

### Real-time communication
- **Native WebSocket**
- **No Rocket.Chat**
- **No DDP**

### LLM providers
Supported providers include:
- **Anthropic**
- **Codex** via ChatGPT OAuth
- **OpenRouter**
- **Mistral**
- **Groq**
- **Google**

### Deployment
- **Docker**
- **Ubuntu VPS**

---

## Agent Lifecycle

### Agent creation
Agents are created through an **agent type wizard**.

This replaces any older direct/manual agent creation flow. The wizard is the expected entry point for provisioning a new agent.

### Provisioning model
Agents are **auto-provisioned by role**.  
The selected role determines the initial setup, including default behavior and compatible capabilities.

### Skills
- Each agent can have a maximum of **8 skills**
- Skills are selected and constrained according to the agent’s intended role and runtime configuration

### Configuration model
Agent configuration is split across distinct layers:

- **persistent skills** stay on the agent profile
- **workspace integrations** are connected at workspace level, not owned by one agent
- **agent access policy** decides which runtime capability an agent may use
- **agent provisioning** stores local setup such as email identity, social scope, drive root, or visible channels

When discussing agent setup, do not collapse these layers into one flat “skills + integrations” list.

### Capability matrix
Runtime capability readiness should be understood through four states:

- `workspace_available`
- `agent_allowed`
- `provisioned`
- `effective`

Only `effective` means the capability is actually usable at runtime.

### Sandbox rule
`sandbox` is a governed execution capability and should stay limited to technical agent types such as:

- `technical`
- `security`
- `qa`
- `devops`
- `engineering`

Non-technical agents should rely on orchestration and delegation instead of exposing sandbox directly in their stable profile.

### Core agent configuration
Each agent can be configured with:
- `model`
- `provider`
- `system_prompt`
- `temperature`
- `max_tokens`

### Supported model families
Supported models include current providers and naming conventions such as:
- `codex/*`
  - examples: `gpt-5.4`, `gpt-5.3-codex-spark`
- `claude-sonnet-4`
- other currently supported models exposed through configured providers

Do not document or rely on deprecated model references such as:
- `gpt-4o`
- `claude-3.5-sonnet`

---

## Agent Communication

### Native chat
Agents collaborate through a **native WebSocket chat system**.

This is the current real-time communication layer and fully replaces any previous Rocket.Chat-based assumptions.

### Email
Agents can send and receive email via **Postal**.

Supported email identities include:
- custom domains configured by the workspace
- platform-managed addresses under **`@slug.vutler.ai`**

### Tasks
Agents can collaborate asynchronously through the **Tasks API**.

Tasks are assigned using:
- `assigned_agent`

### Shared drive
Agents can access shared files through a common drive layer backed by:
- **Exoscale SOS**

---

## LLM Integration

### Router architecture
LLM calls are routed through a central service layer, typically represented by `llmRouter`.

This router is responsible for:
- selecting the correct provider
- resolving credentials
- formatting requests
- applying fallbacks
- handling streaming behavior

### Codex provider
Vutler supports **Codex** through the ChatGPT backend endpoint:

- `chatgpt.com/backend-api/codex/responses`

### Codex authentication
Authentication uses **ChatGPT OAuth**.

Implementation requirements:
- OAuth token is stored in the database
- token refresh must happen automatically when needed

### Request format
Codex integration uses a **Responses API-style payload**.

Use:
- `instructions`
- `input`

Do **not** rely on old `messages`-based formatting for this provider.

### Transport requirements
Streaming is required for Codex requests.

Mandatory parameters:
- `stream: true`
- `store: false`

Transport mode:
- **SSE streaming**

### Fallback behavior
If the primary provider fails, the default fallback is:
- **Anthropic**

This fallback behavior should be built into the routing and execution path, not implemented ad hoc in feature code.

### Token resolution requirement
Provider token resolution requires a database pool to be passed into `llmRouter`.

If `llmRouter` is used without access to the DB pool, provider auth resolution may fail, especially for OAuth-backed providers like Codex.

---

## Task Execution

### Task creation
Tasks are created through the API and assigned via:
- `assigned_agent`

### Execution flow
Task execution is handled by `TaskExecutor`.

Expected flow:
1. A task is created with an assigned agent
2. `TaskExecutor` loads the task and agent context
3. `TaskExecutor` calls `llmRouter.chat()` with the agent
4. The provider executes using the agent configuration
5. If the primary provider fails, execution falls back automatically to **Anthropic**
6. The output is persisted in task metadata

### Persistence
Task execution results are stored in:
- task `metadata`

This metadata should include enough structured context to support later inspection, retries, or downstream processing.

---

## Unified MCP Access

Vutler exposes one public MCP server through:

- **`@vutler/mcp`**

### Purpose
This package allows external MCP-compatible clients to operate inside the Vutler workspace and delegate work to Vutler agents.

Typical clients include:
- Claude Desktop
- Cursor
- Claude Code
- any MCP-compatible tool or runtime

### Authentication
Authentication is handled with:
- **X-API-Key**

This server should be treated as the standard programmable access layer for Vutler workspaces.

---

## Memory & Context

Vutler integrates with **Snipara** for persistent agent memory.

### Runtime primitives
Agents can use:
- `remember()`
- `recall()`

These functions are available in the agent runtime to persist and retrieve contextual memory over time.

### Configuration
Snipara is configured at the workspace level through:
- workspace settings

Memory behavior should be understood as persistent contextual support for agents, not as a replacement for immediate runtime state.

---

## Key Directories

### Frontend
- `frontend/src/app/(app)/` → application pages
- `frontend/src/lib/api/` → API client and shared types

### Backend
- `api/` → Express route handlers
- `services/` → business logic such as `llmRouter`, `taskExecutor`, and related services
- `seeds/` → agent templates and skills

When documenting architecture or navigating the codebase, use these directories as the primary reference points.

---

## Development

### Frontend
```bash
cd frontend && pnpm dev
```

Default port:
- `3000`

### API
```bash
cd api && pnpm dev
```

### Tests
```bash
pnpm test
```

### Operations commands

For production/Vaultbrix operational checks, prefer these entry points first:

```bash
npm run ops:prod:audit
npm run db:backup
./scripts/production-state-audit.sh --strict
```

Meaning:
- `npm run ops:prod:audit` → standard production state audit wrapper
- `npm run db:backup` → logical database backup entry point
- `./scripts/production-state-audit.sh --strict` → hard gate for unhealthy API, pending migrations, or mixed owners

Primary references:
- `scripts/production-state-audit.sh`
- `scripts/backup-db.sh`
- `docs/runbooks/production-ops-hardening-plan.md`
- `docs/runbooks/database-backup-restore.md`
- `docs/runbooks/production-deploy-clean-artifact.md`
- `docs/runbooks/production-rollback-clean-artifact.md`

---

## Conventions

### Language conventions
- Application code is written in **English**
- Business-facing documentation can be written in **French**

### Type safety
- Frontend uses **TypeScript strict mode**

### API response format
Standard API responses should follow:

```ts
{
  success: boolean,
  data?: T,
  error?: string
}
```

### Database access
- Database queries use **raw SQL via Supabase**
- **No ORM**

### Architectural rules
- Do not introduce or document deprecated Meteor/DDP concepts
- Do not reference Rocket.Chat as the chat layer
- Do not reference MiniMax as a supported provider
- Do not assume legacy model names are current
- Do not assume agent creation happens outside the wizard flow

---

## Important Current-State Notes

The following are explicitly obsolete and should not appear in future documentation unless discussing legacy history:

- **Rocket.Chat**
- **Meteor / DDP**
- **MiniMax**
- legacy models such as:
  - `gpt-4o`
  - `claude-3.5-sonnet`
- manual agent creation flow without the wizard

Any implementation, documentation, or onboarding material should reflect the current platform architecture described in this file.
```

Si tu veux, je peux aussi te livrer une **version encore plus “repo-ready”**, avec :
- un ton plus interne/dev
- une section “Architecture at a glance”
- une section “Do / Don’t”
- une mise en forme plus compacte pour un vrai `AGENTS.md` de projet.
