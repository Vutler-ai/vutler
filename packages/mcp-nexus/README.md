# Legacy Compatibility Package

`@vutler/mcp-nexus` is kept only for compatibility during the unified MCP transition.

Use `@vutler/mcp` for all new integrations:

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
