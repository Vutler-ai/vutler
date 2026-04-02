#!/usr/bin/env node
'use strict';

/**
 * Legacy compatibility server for the former Nexus-specific MCP package.
 *
 * New integrations should use `@vutler/mcp`, which exposes the unified
 * Vutler workspace MCP surface with plan-based tool gating.
 *
 * Transport: stdio — pipe this process's stdin/stdout to the agent host.
 *
 * Environment variables:
 *   VUTLER_API_URL  — Vutler API base URL  (default: https://app.vutler.ai)
 *   VUTLER_API_KEY  — Bearer token for Authorization header
 *
 * Usage:
 *   VUTLER_API_KEY=xxx node index.js
 *   VUTLER_API_KEY=xxx VUTLER_API_URL=http://localhost:3001 node index.js
 */

const { Server }               = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

// ── Tool modules ─────────────────────────────────────────────────────────────
const agentTools     = require('./tools/agents');
const taskTools      = require('./tools/tasks');
const managementTools = require('./tools/management');

// ── Registry ──────────────────────────────────────────────────────────────────
/** @type {Array<{name:string, description:string, inputSchema:object, handler:Function}>} */
const ALL_TOOLS = [
  ...agentTools,
  ...taskTools,
  ...managementTools,
];

/** Fast lookup: tool name → handler */
const TOOL_HANDLERS = Object.fromEntries(
  ALL_TOOLS.map((t) => [t.name, t.handler])
);

// ── MCP Server ────────────────────────────────────────────────────────────────
const server = new Server(
  {
    name:    'vutler-nexus-bridge',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * ListTools — return all tool definitions (name + description + inputSchema).
 */
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: ALL_TOOLS.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}));

/**
 * CallTool — route to the appropriate handler and return a formatted response.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
      isError: true,
    };
  }

  try {
    const result = await handler(args);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: err.message || 'An unexpected error occurred.',
            tool:  name,
          }),
        },
      ],
      isError: true,
    };
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
async function main() {
  process.stderr.write(
    '[deprecated] @vutler/mcp-nexus is a legacy package. Use @vutler/mcp for new integrations.\n'
  );

  if (!process.env.VUTLER_API_KEY) {
    process.stderr.write(
      '[nexus-bridge] WARNING: VUTLER_API_KEY is not set. ' +
      'All API calls will be unauthenticated and will likely fail.\n'
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write(
    `[nexus-bridge] Server started. ${ALL_TOOLS.length} tools registered.\n` +
    `[nexus-bridge] API URL: ${process.env.VUTLER_API_URL || 'https://app.vutler.ai'}\n`
  );
}

main().catch((err) => {
  process.stderr.write(`[nexus-bridge] Fatal error: ${err.message}\n`);
  process.exit(1);
});
