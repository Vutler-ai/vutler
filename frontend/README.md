# Vutler Frontend

Next.js 14 application powering the Vutler platform UI.

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS
- **Components:** shadcn/ui
- **Auth:** Supabase Auth (JWT)

## Getting Started

```bash
pnpm install
pnpm dev        # Development server on port 3000
pnpm build      # Production build
pnpm start      # Production server
```

## Project Structure

```
frontend/src/
├── app/
│   ├── (app)/                → Authenticated application (app.vutler.ai)
│   │   ├── agents/           → Agent management (list, settings, wizard)
│   │   │   ├── [id]/config/  → Agent settings (overview, brain, skills, access, provisioning)
│   │   │   └── new/          → Agent creation wizard
│   │   ├── dashboard/        → Main dashboard
│   │   ├── settings/         → Workspace settings
│   │   ├── integrations/     → Third-party connections (ChatGPT OAuth, etc.)
│   │   ├── nexus/            → Agent chat & interaction
│   │   │   └── [id]/         → Individual agent conversation
│   │   ├── onboarding/       → New user onboarding flow
│   │   └── providers/        → LLM provider configuration
│   ├── (landing)/            → Public pages (vutler.ai)
│   │   ├── page.tsx          → Homepage
│   │   ├── pricing/          → Pricing grid (8 plans + addon packs)
│   │   └── layout.tsx        → Landing layout
│   └── layout.tsx            → Root layout
├── lib/
│   └── api/                  → API client & TypeScript types
└── components/               → Reusable UI components (shadcn/ui)
```

## Domain Split

The frontend serves two distinct surfaces:

| Surface | Domain | Content |
|---------|--------|---------|
| **Landing** | `vutler.ai` | Product pages, pricing, onboarding |
| **Application** | `app.vutler.ai` | Authenticated workspace with agents |

Routing is handled by Next.js route groups: `(landing)/` for public pages, `(app)/` for authenticated pages.

## Key Features

### Agent Management
- **Agent type wizard** for creating new agents with role-based provisioning
- **Skill limits**: maximum 8 skills per agent
- **Capability matrix**: every runtime domain is shown as `workspace available` / `agent allowed` / `provisioned` / `effective`
- **Settings split**: agent settings separate `persistent skills`, `access policy`, and `channels & provisioning`
- **Workspace integrations stay global**: connectors are configured under workspace settings, not owned by a single agent
- **Model selector** with `codex/*` models (gpt-5.4, gpt-5.3-codex-spark, etc.)
- **Provider configuration** per agent (Anthropic, Codex, OpenRouter, Mistral, Groq, Google)

### Settings & Configuration
- **API Keys section** with X-API-Key generation and MCP config examples
- **Snipara configuration** for workspace context/memory
- **LLM Providers** management per workspace

### Integrations
- **ChatGPT OAuth** connect/poll flow for Codex provider
- **Post for Me** social media integration with Stripe addon packs
- **MCP Nexus Bridge** tab on landing page with Claude Code examples
- **Agent-level provisioning** now scopes usage of connected providers instead of attaching integrations directly to the agent

### Pricing
- 8 plan tiers with Stripe checkout
- Addon packs for social media and advanced features

## API Communication

- API client in `src/lib/api/`
- Auth: Supabase JWT (Bearer token) + X-API-Key support
- Standard response format: `{ success: boolean, data?: T, error?: string }`
- Config endpoint returns fields at top-level for frontend compatibility
- Static assets proxied via `/static/` to Express backend

## Production Readiness Notes

The frontend now depends on backend telemetry that is production-ready but should be monitored for correctness:

- **Runtime control:** `/api/v1/runtime/status` aggregates workspace agent statuses, uptime, and the last restart entry stored under `workspace_settings.runtime_last_restart`, while `/api/v1/runtime/restart` records the requesting user, reason, and timestamp so the UI can show restart history and actions.
- **Usage analytics:** `/api/v1/usage` (via `api/usage-pg.js`) normalizes `usage_logs`, `agent_executions`, and `credit_transactions` for tokens, requests, and cost, so the Usage page now reflects real workspace activity plus summary endpoints (`/usage/summary`, `/usage/tiers`).
- **Task assignees:** The Tasks page fetches `/api/v1/agents` for the assignee dropdown and subtask defaults, keeping worker lists aligned with the workspace catalog instead of hard-coded names.
- **LLM provider catalog:** `/api/v1/llm/providers` now reads the workspace `tenant_vutler.llm_providers` table (DB-backed, masked API key, workspace-scoped) so the provider picker and publish flows always mirror the marketplace data.

## Environment Variables

```env
NEXT_PUBLIC_API_URL=https://app.vutler.ai
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

## Conventions

- TypeScript strict mode on all files
- shadcn/ui for all UI components
- Tailwind CSS for styling (no CSS modules)
- English for code, French for business copy where appropriate
