# Sprint 9 — Onboarding + Snipara Enterprise

**Started:** 2026-02-17 19:50 CET
**Goal:** New user → onboarding wizard → workspace + Snipara provisioned → agent operational in <2 minutes

## Mike (Backend) — 16 SP

### S9.1 — Snipara Enterprise Auto-Provisioning (5 SP)
- On workspace creation, call Snipara Enterprise API:
  - `POST /workspaces` → create Snipara workspace
  - `POST /api-keys` → generate project API key
  - Store key in `workspace_settings` table
- Enterprise API: `https://snipara.com/api/v1/enterprise`
- Auth: `Authorization: Bearer ent_admin_2568e324a7193ab1e6cf43983f65052c`
- Update `services/snipara.js` provisionProject() to use real Enterprise API

### S9.2 — Agent Posts as Own RC User (3 SP)
- Runtime posts messages using agent's own RC credentials (not admin account)
- Each agent has an RC user (e.g., adam_1771346118844) — login as that user for posting
- Store agent RC credentials or use admin API to post on behalf of agent user

### S9.3 — Message TTL (2 SP)
- In agentRuntime.js `_onRCMessage()`, skip messages older than 30 seconds
- Compare `message.ts` with current time
- Prevents flood of old messages on reconnect

### S9.4 — Channel Assignment API (3 SP)
- `GET /api/v1/agents/:id/channels` — list assigned channels
- `POST /api/v1/agents/:id/channels` — assign agent to channel `{rc_channel_id, rc_channel_name}`
- `DELETE /api/v1/agents/:id/channels/:channelId` — unassign
- Uses `agent_rc_channels` table (already exists)
- Restart runtime subscription after change

### S9.5 — Onboarding API (3 SP)
- `POST /api/v1/onboarding/complete` — single endpoint that:
  1. Creates workspace (if multi-tenant)
  2. Provisions Snipara (S9.1)
  3. Creates agent from template
  4. Assigns agent to default channel
  5. Sets LLM provider + model
- Input: `{template_id, workspace_name, llm_provider, llm_model, channel_name}`

## Philip (Frontend) — 13 SP

### S9.6 — Onboarding Wizard UI (5 SP)
- 3-step wizard at `/admin/onboarding`:
  - Step 1: Choose use case template (Support/Dev/Marketing/Sales/Custom)
  - Step 2: Configure LLM provider + model (with smart defaults per template)
  - Step 3: Name agent + select channel → Deploy
- Calls S9.5 onboarding API on completion
- Redirects to agent detail page after success
- Brief: `projects/vutler/docs/onboarding-wizard-brief.md`

### S9.7 — Channel Assignment UI (3 SP)
- In agent-detail.html, add "Channels" section
- List assigned channels with remove button
- Add channel dropdown (fetches RC channels via `/api/v1/chat/channels`)
- Uses S9.4 API endpoints

### S9.8 — Task Profile → Model Auto-Selection (3 SP)
- When user selects a task profile, auto-select recommended provider + model:
  - Chat → claude-haiku-4-5-20251001 (fast, cheap)
  - Coding → claude-sonnet-4-6 (best at code)
  - Writing → claude-sonnet-4-6
  - Analysis → claude-opus-4-6 (deep reasoning)
  - General → claude-sonnet-4-6 (good balance)
- User can override after auto-selection
- Move Task Profile section BEFORE Model Assignment

### S9.9 — Agent Email Format (2 SP)
- Display agent email as `agent@{tenant}.vutler.ai` in agent detail
- For MVP, tenant = workspace slug or "default"
- Update agent creation to set email in this format

## VPS Context
- IP: 83.228.222.180, SSH key: `.secrets/vps-ssh-key.pem`
- Docker services: vutler-api, vutler-rocketchat, vutler-mongo, vutler-postgres, vutler-redis
- Source: `/home/ubuntu/vutler/app/custom/`
- Existing tables: agent_rc_channels, agent_llm_configs, agent_model_assignments, workspace_settings, workspace_llm_providers

## Model IDs (verified against Anthropic API)
- claude-sonnet-4-6
- claude-opus-4-6
- claude-haiku-4-5-20251001
- claude-sonnet-4-5-20250929
- claude-opus-4-5-20251101
