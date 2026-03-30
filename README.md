# Vutler — Open Source AI Agent Platform

Deploy, orchestrate, and manage AI agents that work autonomously. Built for developers who want full control over their AI workforce.

## Features

- **17 Agent Templates** — Pre-built agents for sales, operations, technical, finance, customer success
- **68 Skills** — Modular capabilities you can assign to any agent
- **Nexus CLI** — Deploy agents locally or at client sites
- **Multi-Agent Orchestration** — Rule-based task routing across agent teams
- **OpenRouter Auto** — Automatically picks the best LLM per prompt (200+ models)
- **Snipara Memory** — Persistent agent memory with 3-level scoping
- **Marketplace** — Share and install agent configurations

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
- [Chat and Task Orchestration Hardening](docs/chat-orchestration-hardening.md)
- [Staging Deploy and Validation Runbook](docs/runbooks/staging-deploy-validation.md)
- [VUTLER_API_KEY Rotation Runbook](docs/runbooks/vutler-api-key-rotation.md)

## Vutler Cloud

Full workspace with email, chat, drive, calendar, tasks → [app.vutler.ai](https://app.vutler.ai)

## License

AGPL-3.0 — See [LICENSE](LICENSE)

Built with ❤️ in Geneva, Switzerland 🇨🇭
