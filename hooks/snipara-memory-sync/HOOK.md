---
name: snipara-memory-sync
description: "Syncs MEMORY.md and key workspace files to Snipara on /new and /stop"
metadata:
  openclaw:
    emoji: "🧠"
    events: ["command:new", "command:stop", "command:reset"]
requirements:
  env: ["SNIPARA_API_KEY", "SNIPARA_PROJECT_SLUG"]
---

# Snipara Memory Sync Hook

Uploads MEMORY.md, daily memory files, and infrastructure docs to Snipara when a session ends or resets. This ensures the agent's long-term memory survives compaction and is searchable across sessions.

## What it syncs
- `MEMORY.md` — curated long-term memory
- `memory/YYYY-MM-DD.md` — today's daily notes
- `memory/infra-vutler.md` — infrastructure reference
- `TOOLS.md` — tool configurations

## Why
When conversations get compacted, fine-grained context is lost. By syncing to Snipara before session transitions, the memory becomes searchable via `rlm_recall` in subsequent sessions.
