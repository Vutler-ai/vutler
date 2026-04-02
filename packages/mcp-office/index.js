#!/usr/bin/env node
'use strict';

/**
 * Legacy compatibility server for the former office-specific MCP package.
 *
 * New integrations should use `@vutler/mcp`, which exposes the unified
 * Vutler workspace MCP surface with plan-based tool gating.
 *
 * Transport: stdio (pipe this process's stdin/stdout to the agent host)
 *
 * Environment variables:
 *   VUTLER_API_URL  — Vutler API base URL  (default: http://localhost:3001)
 *   VUTLER_API_KEY  — API key for X-Api-Key header
 *
 * Usage:
 *   VUTLER_API_KEY=xxx VUTLER_API_URL=https://api.vutler.io node index.js
 */

const { Server }               = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

// ── Tool modules ────────────────────────────────────────────────────────────
const chatTools     = require('./tools/chat');
const driveTools    = require('./tools/drive');
const emailTools    = require('./tools/email');
const taskTools     = require('./tools/tasks');
const calendarTools = require('./tools/calendar');
const clientTools   = require('./tools/clients');

// ── Registry ─────────────────────────────────────────────────────────────────
/** @type {Array<{name:string, description:string, inputSchema:object, handler:Function}>} */
const ALL_TOOLS = [
  ...chatTools,
  ...driveTools,
  ...emailTools,
  ...taskTools,
  ...calendarTools,
  ...clientTools,
];

/** Fast lookup: tool name → handler */
const TOOL_HANDLERS = Object.fromEntries(
  ALL_TOOLS.map((t) => [t.name, t.handler])
);

// ── MCP Server ────────────────────────────────────────────────────────────────
const server = new Server(
  {
    name:    'vutler-office',
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
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: ALL_TOOLS.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    })),
  };
});

/**
 * CallTool — route to the appropriate handler and format the response.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: `Unknown tool: ${name}` }),
        },
      ],
      isError: true,
    };
  }

  try {
    const result = await handler(args);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error:   err.message || 'An unexpected error occurred.',
            tool:    name,
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
    '[deprecated] @vutler/mcp-office is a legacy package. Use @vutler/mcp for new integrations.\n'
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr so it doesn't pollute the stdio MCP channel
  process.stderr.write(
    `[vutler-mcp-office] Server started. ${ALL_TOOLS.length} tools registered.\n`
  );
}

main().catch((err) => {
  process.stderr.write(`[vutler-mcp-office] Fatal error: ${err.message}\n`);
  process.exit(1);
});
