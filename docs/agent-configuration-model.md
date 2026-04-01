# Agent Configuration Model

## Purpose

Vutler agents are no longer configured as a flat mix of prompt, skills, tools, and integrations.

The current model separates:

- `workspace integrations` — global connectors available to the workspace
- `agent access` — what a given agent is allowed to use at runtime
- `agent provisioning` — what is concretely provisioned for that agent
- `persistent skills` — stable role-specific skills that remain on the agent profile

This keeps agent specialization explicit while letting the orchestrator resolve runtime capabilities per execution.

## Source of Truth

The backend exposes an agent capability matrix through:

- `GET /api/v1/agents/:id/capability-matrix`
- `PATCH /api/v1/agents/:id/access`
- `PATCH /api/v1/agents/:id/provisioning`

Each capability is evaluated with four states:

- `workspace_available`
- `agent_allowed`
- `provisioned`
- `effective`

`effective` is the only state that means the capability can actually be used at runtime.

## Wizard Model

The agent wizard now follows this flow:

1. `Choose Role`
2. `Identity`
3. `Brain`
4. `Skills`
5. `Access`
6. `Channels & Provisioning`
7. `Review`

Important rules:

- agents are created from a role/type wizard, not from a raw manual form
- each agent keeps a maximum of `8` persistent skills
- workspace integrations are not selected per agent in the wizard
- runtime capabilities are previewed through the capability matrix

## Agent Settings Model

`/agents/[id]/config` is the canonical agent settings page.

It is organized as:

- `Overview`
- `Brain`
- `Skills`
- `Access`
- `Channels & Provisioning`
- `Memory`
- `Governance`

The former `/agents/[id]/integrations` page is now a legacy transition surface that redirects users to the new model.

## Runtime Meaning

### Persistent skills

Persistent skills define stable specialization.

Examples:

- `campaign_planning`
- `content_scheduling`
- `ticket_triage`

These are stored on the agent and are constrained by the role/type model.

### Workspace integrations

Workspace integrations are connected once at workspace level.

Examples:

- Postal / email
- Google Workspace
- social connectors
- other external providers

These do not belong to a single agent.

### Agent access

Access is the allowlist for runtime use by a specific agent.

Examples:

- email allowed
- drive allowed
- memory allowed
- social allowed

Access alone is not enough to make a capability usable.

### Agent provisioning

Provisioning defines concrete local setup for that agent.

Examples:

- provisioned email identity
- social account scope
- drive root
- visible channels

This is what prevents “I can send email in theory but no identity exists for this agent”.

## Sandbox Rule

`sandbox` is treated as a governed execution capability, not a generic agent integration.

Product rule:

- keep it visible only for technical agent types such as `technical`, `security`, `qa`, `devops`, `engineering`
- gate it through workspace plan + policy + orchestration
- do not present it as a normal capability on generalist agents like marketing or ops agents

If a non-technical agent needs sandbox-backed work, the orchestrator should delegate to a suitable specialist agent.

## UI Consequences

When documenting or designing agent UX, keep these boundaries:

- do not show workspace connectors as if they belong to an agent
- do not mix integrations and skills in the same conceptual bucket
- always explain capability readiness through the matrix states
- use exact CTAs:
  - `Connect workspace integration`
  - `Allow for this agent`
  - `Provision email`
  - `Create specialist agent`

## File References

Primary frontend files:

- `frontend/src/app/(app)/agents/new/page.tsx`
- `frontend/src/app/(app)/agents/[id]/config/page.tsx`
- `frontend/src/components/agents/settings/CapabilityMatrixSection.tsx`
- `frontend/src/components/agents/settings/CapabilityStatusCard.tsx`

Primary backend files:

- `api/agents.js`
- `services/agentCapabilityMatrixService.js`
- `services/agentAccessPolicyService.js`
- `services/agentProvisioningService.js`
- `services/runtimeCapabilityAvailability.js`
