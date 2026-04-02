# Legacy MCP Package

`packages/mcp-server` is a legacy internal package from before the unified MCP rollout.

Use the public unified package instead:

```bash
VUTLER_API_KEY=your_key npx @vutler/mcp
```

Recommended config:

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

The unified package exposes tools according to the workspace plan and capabilities.

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
