# AGENTS.md

## Purpose

This file defines the current architectural truth for Vutler.

Use it as the default reference when:
- navigating the repo
- writing implementation notes
- updating onboarding or product documentation
- reviewing whether a feature is current, legacy, or obsolete

If code and docs disagree, align work toward the rules in this file unless the current implementation has already been intentionally superseded.

## Product

Vutler is an AI agent management platform built by Starbox Group in Geneva.

Public surfaces:
- `vutler.ai` -> marketing site
- `app.vutler.ai` -> authenticated product

Core product scope:
- multi-tenant, workspace-based agent operations
- agent configuration, memory, tasks, and communication at application level
- runtime collaboration over native chat, email, tasks, and shared drive access

## Architecture At A Glance

Frontend:
- Next.js 14
- TypeScript
- Tailwind CSS
- shadcn/ui

Backend:
- Express.js
- Node.js
- CommonJS modules

Data:
- Supabase PostgreSQL
- primary schema: `tenant_vutler`
- raw SQL access
- no ORM

Auth:
- Supabase Auth
- `X-API-Key` for external clients and programmable access

Realtime:
- native WebSocket chat
- no Rocket.Chat
- no DDP

Deployment:
- Docker
- Ubuntu VPS

Memory:
- Snipara workspace-level memory integration

## Current Platform Model

### Agents

Agents are created through the agent type wizard.

Do not assume:
- a legacy manual creation flow
- ad hoc agent bootstrapping outside the wizard

Provisioning model:
- agents are auto-provisioned by role
- the selected role determines initial setup and compatible capabilities
- each agent can have at most `8` skills

Agent configuration layers must stay distinct:
- persistent skills
- workspace integrations
- agent access policy
- agent provisioning

Do not flatten these into one generic "skills + integrations" bucket.

### Capabilities

Capability readiness is expressed through:
- `workspace_available`
- `agent_allowed`
- `provisioned`
- `effective`

Only `effective` means the capability is actually usable at runtime.

Sandbox policy:
- `sandbox` is governed and should stay limited to technical agent types
- valid stable targets include `technical`, `security`, `qa`, `devops`, `engineering`
- non-technical agents should rely on orchestration and delegation instead of direct sandbox access

### Communication

Supported collaboration channels:
- native WebSocket chat
- email via Postal
- tasks via the Tasks API
- shared drive access backed by Exoscale SOS

Email identities may be:
- workspace custom domains
- platform-managed addresses under `@slug.vutler.ai`

Task assignment uses:
- `assigned_agent`

### MCP Access

Vutler exposes one public MCP server:
- `@vutler/mcp`

Purpose:
- allow MCP-compatible clients to operate inside a Vutler workspace
- delegate work to Vutler agents through the standard programmable surface

Authentication:
- `X-API-Key`

Typical clients:
- Claude Desktop
- Cursor
- Claude Code
- any MCP-compatible runtime

## LLM Runtime

LLM execution is routed through `llmRouter`.

`llmRouter` is responsible for:
- provider selection
- credential resolution
- request shaping
- fallback handling
- streaming behavior

Supported providers include:
- Anthropic
- Codex via ChatGPT OAuth
- OpenRouter
- Mistral
- Groq
- Google

Supported model families should follow current naming:
- `codex/*`
- `gpt-5.4`
- `gpt-5.3-codex-spark`
- `claude-sonnet-4`
- other current models exposed through configured providers

Do not document or build against deprecated names such as:
- `gpt-4o`
- `claude-3.5-sonnet`

### Codex Rules

Codex uses the ChatGPT backend endpoint:
- `chatgpt.com/backend-api/codex/responses`

Authentication requirements:
- OAuth token stored in the database
- token refresh handled automatically

Payload requirements:
- use `instructions`
- use `input`
- do not rely on old `messages` formatting for this provider

Transport requirements:
- `stream: true`
- `store: false`
- SSE streaming

Fallback behavior:
- default fallback is Anthropic
- fallback belongs in routing/runtime, not ad hoc feature code

Important:
- provider token resolution requires a DB pool
- calling `llmRouter` without DB access can break provider auth resolution, especially for Codex OAuth

## Task Execution

Task execution is handled by `TaskExecutor`.

Expected flow:
1. A task is created with `assigned_agent`.
2. `TaskExecutor` loads task and agent context.
3. `TaskExecutor` calls `llmRouter.chat()` with the agent.
4. The configured provider executes.
5. If the primary provider fails, runtime falls back to Anthropic.
6. The result is persisted in task metadata.

Persistence requirement:
- execution output must be stored in task `metadata`
- metadata should retain enough structured context for inspection, retries, and downstream automation

## Memory

Vutler integrates with Snipara for persistent agent memory.

Runtime primitives:
- `remember()`
- `recall()`

Memory is configured at workspace level through workspace settings.

Treat memory as persistent contextual support, not a replacement for immediate runtime state.

## Repo Map

Frontend:
- `frontend/src/app/(app)/` -> authenticated application pages
- `frontend/src/lib/api/` -> API client and shared types

Backend:
- `api/` -> Express route handlers
- `services/` -> business logic such as `llmRouter` and `taskExecutor`
- `seeds/` -> agent templates and skills

Operational references:
- `scripts/production-state-audit.sh`
- `scripts/backup-db.sh`
- `docs/runbooks/production-ops-hardening-plan.md`
- `docs/runbooks/database-backup-restore.md`
- `docs/runbooks/production-deploy-clean-artifact.md`
- `docs/runbooks/production-rollback-clean-artifact.md`

## Development

Frontend:
```bash
cd frontend && pnpm dev
```

Default frontend port:
- `3000`

API:
```bash
cd api && pnpm dev
```

Tests:
```bash
pnpm test
```

Preferred production operations entry points:
```bash
npm run ops:prod:audit
npm run db:backup
./scripts/production-state-audit.sh --strict
```

Meaning:
- `npm run ops:prod:audit` -> standard production state audit wrapper
- `npm run db:backup` -> logical database backup entry point
- `./scripts/production-state-audit.sh --strict` -> hard gate for unhealthy API, pending migrations, or mixed owners

## Conventions

Language:
- application code in English
- business-facing documentation may be in French

Type safety:
- frontend runs in TypeScript strict mode

API response shape:
```ts
{
  success: boolean,
  data?: T,
  error?: string
}
```

Database access:
- raw SQL via Supabase
- no ORM

## Do / Don't

Do:
- treat PostgreSQL as the source of truth
- use native WebSocket chat as the current realtime layer
- use the wizard as the default agent creation path
- preserve the separation between skills, integrations, access policy, and provisioning
- pass DB access into `llmRouter` when provider auth resolution is needed
- keep fallback behavior centralized in runtime services

Do not:
- introduce or document MongoDB or Meteor assumptions
- reference Rocket.Chat as the chat layer
- reference DDP as a current transport
- reference MiniMax as a supported provider
- rely on legacy model names
- describe agent creation as a direct manual flow unless discussing legacy history

## Obsolete References

The following are obsolete and should not appear in current-state documentation unless explicitly discussing legacy history:
- Rocket.Chat
- Meteor / DDP
- MiniMax
- `gpt-4o`
- `claude-3.5-sonnet`
- manual agent creation outside the wizard flow

Everything shipped or documented going forward should reflect the current platform model described above.
