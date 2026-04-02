# Office MCP And Plan Reconciliation

## Goal

Define one canonical model for:

- the public MCP server
- plan packaging
- product messaging

This document describes the target state, not the current mixed state in the repo.

## Canonical Product Model

Vutler is the native workspace for AI agents.

- External LLMs such as Claude, ChatGPT/Codex, Anthropic, or OpenRouter models are the agent brain.
- Vutler provides the operating environment: chat, email, drive, tasks, calendar, memory, clients, approvals, settings.
- MCP is the programmable access layer to the Vutler workspace.
- The main product remains the Vutler UI, not MCP.

## Non-Negotiables

1. Expose one public MCP package: `@vutler/mcp`.
2. Keep one public config snippet everywhere in the product and marketing site.
3. Gate MCP tools by plan, permissions, and capability readiness.
4. Do not market Office plans with `0` agents included.
5. Keep `BYOK` on all plans, but do not use it as the main packaging differentiator.

## Public MCP

Public package:

- `@vutler/mcp`

Legacy/internal packages:

- `@vutler/mcp-office`
- `@vutler/mcp-nexus`

Recommended public config:

```json
{
  "mcpServers": {
    "vutler": {
      "command": "npx",
      "args": ["-y", "@vutler/mcp"],
      "env": {
        "VUTLER_API_URL": "https://app.vutler.ai",
        "VUTLER_API_KEY": "vt_your_key_here"
      }
    }
  }
}
```

## Public MCP Tool Catalog

Public `@vutler/mcp` v1 tools:

- `list_agents`
- `run_agent`
- `stop_agent`
- `send_email`
- `list_emails`
- `read_email`
- `list_tasks`
- `create_task`
- `update_task`
- `list_files`
- `upload_file`
- `download_file`
- `list_events`
- `create_event`
- `send_chat`
- `search_memory`
- `list_clients`
- `create_client`

## Plan Families

Public plan families should read as:

- `Free` -> try Vutler
- `Office` -> native workspace for agents
- `Agents` -> orchestration and workforce operations
- `Full` -> Office + Agents
- `Enterprise` -> governed deployments and custom rollout

Current billing SKUs can remain:

- `free`
- `office_starter`
- `office_team`
- `agents_starter`
- `agents_pro`
- `full`
- `nexus_enterprise`
- `enterprise`

But public messaging should group them under the five families above.

## Plan Principles

### Free

- Discovery tier
- Must include at least `1` hosted agent
- Minimal workspace and MCP access

### Office

- Native Vutler workspace for agents
- Must include hosted agents, not just surfaces
- Includes settings, approvals, provisioning, and office operations

### Agents

- For teams buying orchestration, runtime, builder, sandbox, automations, and multi-agent operations
- Does not imply the full office workspace surface

### Full

- Combines Office and Agents
- This is the clearest expression of the platform vision

## MCP Tool Gating Matrix

| Tool | Free | Office Starter | Office Pro | Agents Starter / Pro | Full / Enterprise |
| --- | --- | --- | --- | --- | --- |
| `list_agents` | yes | yes | yes | yes | yes |
| `run_agent` | yes | yes | yes | yes | yes |
| `stop_agent` | yes | yes | yes | yes | yes |
| `send_chat` | no | yes | yes | no | yes |
| `send_email` | no | yes | yes | no | yes |
| `list_emails` | no | yes | yes | no | yes |
| `read_email` | no | yes | yes | no | yes |
| `list_tasks` | no | yes | yes | no | yes |
| `create_task` | no | yes | yes | no | yes |
| `update_task` | no | yes | yes | no | yes |
| `list_files` | no | yes | yes | no | yes |
| `upload_file` | no | yes | yes | no | yes |
| `download_file` | no | yes | yes | no | yes |
| `list_events` | no | yes | yes | no | yes |
| `create_event` | no | yes | yes | no | yes |
| `search_memory` | no | yes | yes | yes | yes |
| `list_clients` | no | no | yes | no | yes |
| `create_client` | no | no | yes | no | yes |

Notes:

- `Agents` plans stay focused on agent operations, not the office workspace.
- `Office` plans expose the workspace tools.
- `Office Pro` adds business surfaces such as clients / CRM.
- `Full` and `Enterprise` expose the full public MCP catalog.

## Public Limits Snapshot

| Plan | Agents | Storage |
| --- | --- | --- |
| `Free` | `1` | `0.5GB` |
| `Office Starter` | `2` | `5GB` |
| `Office Pro` | `10` | `50GB` |
| `Agents Starter` | `10` | `5GB` |
| `Agents Pro` | `50` | `25GB` |
| `Full` | `50` | `100GB` |
| `Nexus Enterprise` | `100` | `100GB` |

## Communication Model

Use this wording consistently:

- `Vutler is the native workspace for AI agents.`
- `Use Claude or ChatGPT as the brain, and Vutler as the operating environment.`
- `MCP is the programmable access layer to your Vutler workspace.`

Avoid this wording:

- `We do it via MCP`
- `Vutler mainly provisions external agents`
- `Office plans without agents included`

## Immediate Repo Changes To Make

1. Replace public MCP snippets that still point only to `@vutler/mcp-nexus`.
2. Introduce a single public package name and alias old packages behind it.
3. Reconcile pricing copy so Office is sold as a native agent workspace, not as a surface bundle without agents.
4. Remove or clarify any remaining `full access during open beta` copy if plan gating is now real.
5. Implement MCP `ListTools` gating from workspace plan + feature flags + capability readiness.
