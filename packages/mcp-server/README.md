# @vutler/mcp-office — MCP Server

Model Context Protocol server for **Vutler Office**. Exposes email, chat, tasks, drive, calendar, and cross-workspace search to AI agents (Claude Code, Cursor, and any MCP-compatible host).

---

## Tools (13 total)

| Tool | Description |
|------|-------------|
| `vutler_send_email` | Send an email immediately |
| `vutler_read_emails` | List emails in a mailbox folder |
| `vutler_draft_email` | Save a draft for human approval |
| `vutler_list_agents_emails` | List agent email addresses |
| `vutler_send_chat` | Post a message to a channel |
| `vutler_read_chat` | Read recent messages from a channel |
| `vutler_list_channels` | List all chat channels |
| `vutler_create_task` | Create a new task |
| `vutler_list_tasks` | List / filter tasks |
| `vutler_update_task` | Update an existing task |
| `vutler_upload_file` | Upload a file (base64) to Drive |
| `vutler_list_files` | List files in Drive |
| `vutler_list_events` | List calendar events |
| `vutler_search` | Search across all workspaces |

---

## Requirements

- **Node.js 18+** (uses native `fetch`)
- A **Vutler API key** from [app.vutler.ai/settings](https://app.vutler.ai/settings)

---

## Installation & Quick Start

### Option A — Run directly with npx

```bash
VUTLER_API_KEY=your_key npx @vutler/mcp-office
```

### Option B — Clone and run locally

```bash
git clone <repo>
cd packages/mcp-server
npm install
VUTLER_API_KEY=your_key node index.js
```

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VUTLER_API_KEY` | Yes | — | Bearer token from app.vutler.ai/settings |
| `VUTLER_API_URL` | No | `https://app.vutler.ai` | Override for self-hosted deployments |

---

## Agent Configuration

### Claude Code

Add to `.claude/settings.json` in your project (or `~/.claude/settings.json` globally):

```json
{
  "mcpServers": {
    "vutler-office": {
      "command": "npx",
      "args": ["@vutler/mcp-office"],
      "env": {
        "VUTLER_API_KEY": "your_api_key_here",
        "VUTLER_API_URL": "https://app.vutler.ai"
      }
    }
  }
}
```

If you cloned the repo locally:

```json
{
  "mcpServers": {
    "vutler-office": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp-server/index.js"],
      "env": {
        "VUTLER_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "vutler-office": {
      "command": "npx",
      "args": ["@vutler/mcp-office"],
      "env": {
        "VUTLER_API_KEY": "your_api_key_here",
        "VUTLER_API_URL": "https://app.vutler.ai"
      }
    }
  }
}
```

### Any MCP-compatible host

The server uses **stdio transport**. Start it with:

```bash
VUTLER_API_KEY=xxx node /path/to/mcp-server/index.js
```

Then pipe the host's stdin/stdout to the process.

---

## Getting Your API Key

1. Log in to [app.vutler.ai](https://app.vutler.ai)
2. Navigate to **Settings → API Keys**
3. Click **Generate new key**
4. Copy the key and set it as `VUTLER_API_KEY`

---

## Architecture

```
mcp-server/
├── index.js          — MCP server entry point (stdio transport)
├── package.json
├── lib/
│   └── api-client.js — HTTP client (Bearer auth, query builder, error handling)
└── tools/
    ├── email.js      — vutler_send_email, vutler_read_emails, vutler_draft_email, vutler_list_agents_emails
    ├── chat.js       — vutler_send_chat, vutler_read_chat, vutler_list_channels
    ├── tasks.js      — vutler_create_task, vutler_list_tasks, vutler_update_task
    ├── drive.js      — vutler_upload_file, vutler_list_files
    ├── calendar.js   — vutler_list_events
    └── search.js     — vutler_search
```

- Uses **CommonJS** (`require`/`module.exports`) for maximum compatibility.
- All errors are caught and returned as structured error responses — the server never crashes on API failures.
- The server is **standalone**: it has no dependency on the Vutler monorepo.

---

## License

UNLICENSED — Internal use only.
