# `@vutler/mcp`

Unified public MCP package for Vutler workspaces.

## Quick Start

Run directly:

```bash
VUTLER_API_KEY=vt_your_key_here npx @vutler/mcp
```

Bootstrap a client config and immediately validate the written file:

```bash
VUTLER_API_KEY=vt_your_key_here npx @vutler/mcp --bootstrap claude-code --embed-key
VUTLER_API_KEY=vt_your_key_here npx @vutler/mcp --bootstrap claude-desktop --embed-key
```

If you do not want to persist a real key yet, bootstrap safely with a placeholder and rerun doctor after replacing it:

```bash
npx @vutler/mcp --bootstrap cursor
```

List supported clients:

```bash
npx @vutler/mcp --list-clients
```

Print a ready-to-paste client config:

```bash
npx @vutler/mcp --print-config claude-code
npx @vutler/mcp --print-config claude-desktop
npx @vutler/mcp --print-config cursor
npx @vutler/mcp --print-config vscode
npx @vutler/mcp --print-config continue
```

Write or update a real config file:

```bash
npx @vutler/mcp --setup claude-code
npx @vutler/mcp --setup claude-desktop
npx @vutler/mcp --setup cursor --path ./.mcp.json
```

By default, setup writes a placeholder API key so secrets are not persisted accidentally. To embed the current `VUTLER_API_KEY` explicitly:

```bash
VUTLER_API_KEY=vt_your_key_here npx @vutler/mcp --setup claude-code --embed-key
```

Validate credentials, connectivity, plan-gated tool exposure, and optionally the real client config file:

```bash
VUTLER_API_KEY=vt_your_key_here npx @vutler/mcp --doctor
VUTLER_API_KEY=vt_your_key_here npx @vutler/mcp --doctor --json
VUTLER_API_KEY=vt_your_key_here npx @vutler/mcp --doctor --client claude-code
VUTLER_API_KEY=vt_your_key_here npx @vutler/mcp --doctor --client claude-desktop --path ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

Print the required environment variables:

```bash
npx @vutler/mcp --print-env
```

## Environment

- `VUTLER_API_URL`
  - optional
  - defaults to `https://app.vutler.ai`
- `VUTLER_API_KEY`
  - required
  - use a workspace API key from Vutler

## Supported Client Templates

### Claude Code

Project-scoped `.mcp.json`:

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

### Claude Desktop

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

### Cursor

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

### Continue.dev

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

### VS Code

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

## Notes

- `--bootstrap` is the shortest operational path: it writes the client config and then runs doctor against that exact file.
- `--setup` merges into an existing `mcpServers` object instead of wiping unrelated MCP entries.
- `--force` lets setup replace an invalid JSON config file and stores a timestamped backup first.
- `--dry-run` resolves the target path and merged config without writing to disk.
- `--doctor --client ...` validates the resolved config path, confirms `mcpServers.vutler`, checks that it launches `@vutler/mcp`, and flags placeholder API keys.
- Tool exposure remains gated by the workspace plan and capabilities.
- Legacy packages such as `@vutler/mcp-office`, `@vutler/mcp-nexus`, and `packages/mcp-server` should not be used for new integrations.
