#!/usr/bin/env node
'use strict';

/**
 * Vutler Office MCP Server
 *
 * Exposes Vutler Office tools (email, chat, tasks, drive, calendar, search)
 * to AI agents (Claude Code, Cursor, etc.) via the Model Context Protocol.
 *
 * Transport: stdio — pipe this process's stdin/stdout to the agent host.
 *
 * Environment variables:
 *   VUTLER_API_URL  — Vutler API base URL  (default: https://app.vutler.ai)
 *   VUTLER_API_KEY  — Bearer token for Authorization header
 *
 * Usage:
 *   VUTLER_API_KEY=xxx node index.js
 *   VUTLER_API_KEY=xxx VUTLER_API_URL=https://app.vutler.ai node index.js
 */

const { Server }               = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

// ── Tool modules ─────────────────────────────────────────────────────────────
const emailTools    = require('./tools/email');
const chatTools     = require('./tools/chat');
const taskTools     = require('./tools/tasks');
const driveTools    = require('./tools/drive');
const calendarTools = require('./tools/calendar');
const searchTools   = require('./tools/search');

// ── Registry ──────────────────────────────────────────────────────────────────
/** @type {Array<{name:string, description:string, inputSchema:object, handler:Function}>} */
const ALL_TOOLS = [
  ...emailTools,
  ...chatTools,
  ...taskTools,
  ...driveTools,
  ...calendarTools,
  ...searchTools,
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
  if (!process.env.VUTLER_API_KEY) {
    process.stderr.write(
      '[vutler-mcp] WARNING: VUTLER_API_KEY is not set. ' +
      'All API calls will be unauthenticated and will likely fail.\n'
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write(
    `[vutler-mcp] Server started. ${ALL_TOOLS.length} tools registered.\n` +
    `[vutler-mcp] API URL: ${process.env.VUTLER_API_URL || 'https://app.vutler.ai'}\n`
  );
}

main().catch((err) => {
  process.stderr.write(`[vutler-mcp] Fatal error: ${err.message}\n`);
  process.exit(1);
});
