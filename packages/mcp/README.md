# `@vutler/mcp`

Unified public MCP package for Vutler workspaces.

## Quick Start

Run directly:

```bash
VUTLER_API_KEY=vt_your_key_here npx @vutler/mcp
```

Print a ready-to-paste client config:

```bash
npx @vutler/mcp --print-config claude-desktop
npx @vutler/mcp --print-config cursor
npx @vutler/mcp --print-config continue
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

## Notes

- Tool exposure remains gated by the workspace plan and capabilities.
- Legacy packages such as `@vutler/mcp-office`, `@vutler/mcp-nexus`, and `packages/mcp-server` should not be used for new integrations.
