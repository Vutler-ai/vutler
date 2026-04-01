# Vutler — Open Source AI Agent Platform

Deploy, orchestrate, and manage AI agents that work autonomously. Built for developers who want full control over their AI workforce.

## Core capabilities

- **Drive Pro** — metadata-aware listing, drag/drop move, rename, preview, bulk actions, and native Exoscale SOS indexing for workspace-shared files
- **Agent configuration model** — agents now keep a small permanent skill set while workspace integrations, agent access, provisioning, and orchestration-driven runtime capability resolution stay explicitly separated
- **Workspace gating & sessions** — route guards, upgrade flows, server-backed cookies, and feature snapshots keep plans enforcement close to the browser
- **Nexus Enterprise runtime** — gated nodes, billing observability, sandboxed command streams, and enterprise-grade integrations for on-prem deployment
- **Snipara memory + knowledge** — workspace-aware provisioning, resilient retrieval, and local SOUL fallbacks keep agent memory precise across agents and workspaces
- **LLM routing + Codex** — `llmRouter` now normalizes providers (Anthropic fallback plus Codex via ChatGPT OAuth) with trial/credit packs and rich provider configs in the UI
- **Billing & plan automation** — normalized limits, social post packs, recommended upgrades, and provider/product wiring keep plan boundaries aligned with agent skills

## Quick Start

```bash
git clone https://github.com/Vutler-ai/vutler.git && cd vutler
npm install
cp .env.example .env  # Add your OpenRouter API key
node index.js          # → http://localhost:3001
```

## Deploy a Nexus Agent

```bash
npx vutler-nexus start --key YOUR_API_KEY --name "My Agent"
```

## Architecture

```
Vutler API (Express.js)
├── /api/v1/agents      Agent CRUD + execute
├── /api/v1/nexus       Node management + multi-agent
├── /api/v1/marketplace Templates + skills
├── /api/v1/llm         LLM routing (OpenRouter auto)
└── /api/v1/memory      Snipara persistent memory

Nexus CLI
├── Local mode     Clone cloud agents to your machine
├── Enterprise     Deploy at client sites with seats
└── Multi-agent    Rule-based task routing
```

## Documentation

- [Documentation Index](docs/README.md)
- [Agent Configuration Model](docs/agent-configuration-model.md)
- [Chat and Task Orchestration Hardening](docs/chat-orchestration-hardening.md)
- [Staging Deploy and Validation Runbook](docs/runbooks/staging-deploy-validation.md)
- [VUTLER_API_KEY Rotation Runbook](docs/runbooks/vutler-api-key-rotation.md)
- [March 2026 release snapshot](docs/recent-2026-03.md)

## Vutler Cloud

Full workspace with email, chat, drive, calendar, tasks → [app.vutler.ai](https://app.vutler.ai)

## License

AGPL-3.0 — See [LICENSE](LICENSE)

Built with ❤️ in Geneva, Switzerland 🇨🇭
