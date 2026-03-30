'use strict';

const { randomUUID } = require('crypto');

const TOOL_TIMEOUT_MS = 30000;
const TOOL_CALL_TYPE = 'tool.call';
const pendingToolCalls = new Map();

// ── Skill execution tool — allows the LLM to invoke a registered skill on the local Nexus node ──

const SKILL_EXECUTION_TOOL = {
  name: 'execute_skill',
  description: 'Execute a specific agent skill on the local Nexus node',
  input_schema: {
    type: 'object',
    properties: {
      skill_key: { type: 'string', description: 'The skill identifier' },
      params: { type: 'object', description: 'Skill-specific parameters' },
    },
    required: ['skill_key'],
  },
};

const NEXUS_TOOLS = [
  SKILL_EXECUTION_TOOL,
  {
    name: 'search_files',
    description: "Search for files on the user's local computer by name or content.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query to match against file names and/or content.' },
        scope: { type: 'string', description: 'Optional folder path to limit the search.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_document',
    description: 'Read the content of a document on the user\'s computer (PDF, DOCX, XLSX, CSV).',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path of the document.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_directory',
    description: 'List files and folders in a directory on the user\'s computer.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to list.' },
        recursive: { type: 'boolean', description: 'Whether to list recursively.' },
        pattern: { type: 'string', description: 'Glob pattern to filter results (e.g. "*.pdf").' },
      },
      required: ['path'],
    },
  },
  {
    name: 'read_emails',
    description: "Read recent emails from the user's mail client (Apple Mail or Outlook).",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional search query to filter emails.' },
        limit: { type: 'number', description: 'Maximum number of emails to return (default 10).' },
      },
    },
  },
  {
    name: 'read_calendar',
    description: "Read upcoming calendar events from the user's calendar app.",
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of days ahead to look (default 7).' },
      },
    },
  },
  {
    name: 'read_contacts',
    description: "Search the user's contacts (Apple Contacts or Outlook).",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional name/email to search for.' },
        limit: { type: 'number', description: 'Maximum number of contacts to return (default 50).' },
      },
    },
  },
  {
    name: 'read_clipboard',
    description: "Read the current clipboard content from the user's computer.",
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
];

const NEXUS_TOOL_NAMES = new Set(NEXUS_TOOLS.map((t) => t.name));

// ── Tool name mapping: LLM tool name → Nexus orchestrator action ─────────────

function mapToolToNexus(toolName, args = {}) {
  const hasQuery = typeof args.query === 'string' && args.query.trim().length > 0;
  switch (toolName) {
    case 'execute_skill':  return 'execute_skill';
    case 'search_files':   return 'search';
    case 'read_document':  return 'read_document';
    case 'list_directory':  return 'list_dir';
    case 'read_emails':    return hasQuery ? 'search_emails' : 'list_emails';
    case 'read_calendar':  return 'read_calendar';
    case 'read_contacts':  return hasQuery ? 'search_contacts' : 'read_contacts';
    case 'read_clipboard': return 'read_clipboard';
    default:               return null;
  }
}

// ── DB lookup: find online Nexus node for workspace ──────────────────────────

async function getOnlineNexusNode(workspaceId, pool) {
  if (!pool) return null;
  try {
    const result = await pool.query(
      "SELECT id, name FROM tenant_vutler.nexus_nodes WHERE workspace_id = $1 AND status = 'online' ORDER BY last_heartbeat DESC LIMIT 1",
      [workspaceId]
    );
    return result.rows[0] ? { id: result.rows[0].id, name: result.rows[0].name } : null;
  } catch {
    return null;
  }
}

/**
 * Returns Nexus tool definitions if an online node exists for this workspace.
 * Otherwise returns an empty array (agents won't see Nexus tools).
 */
async function getNexusToolsForWorkspace(workspaceId, pool) {
  const node = await getOnlineNexusNode(workspaceId, pool);
  return node ? [...NEXUS_TOOLS] : [];
}

// ── WebSocket dispatch: send tool.call to Nexus, wait for tool.result ────────

function findWs(nodeId, wsConnections) {
  if (!wsConnections || !nodeId) return null;
  // wsConnections may be a Map or plain object
  if (typeof wsConnections.get === 'function') {
    return wsConnections.get(nodeId) || wsConnections.get(String(nodeId));
  }
  return wsConnections[nodeId] || wsConnections[String(nodeId)] || null;
}

async function executeNexusTool(nodeId, toolName, args, wsConnections) {
  if (!NEXUS_TOOL_NAMES.has(toolName)) {
    throw new Error(`Unknown Nexus tool: ${toolName}`);
  }
  const nexusAction = mapToolToNexus(toolName, args);
  if (!nexusAction) throw new Error(`No mapping for tool ${toolName}`);

  const conn = findWs(nodeId, wsConnections);
  const ws = conn?.ws || conn; // conn may be { ws, agentId, ... } or raw ws
  if (!ws || typeof ws.send !== 'function') {
    throw new Error(`No WebSocket connection for Nexus node ${nodeId}`);
  }

  const requestId = randomUUID();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingToolCalls.delete(requestId);
      reject(new Error(`Nexus tool call timed out after ${TOOL_TIMEOUT_MS}ms`));
    }, TOOL_TIMEOUT_MS);

    pendingToolCalls.set(requestId, { resolve, reject, timer });

    try {
      ws.send(JSON.stringify({
        type: TOOL_CALL_TYPE,
        payload: { request_id: requestId, tool_name: nexusAction, args: args || {}, timeout_ms: TOOL_TIMEOUT_MS },
      }));
    } catch (err) {
      clearTimeout(timer);
      pendingToolCalls.delete(requestId);
      reject(err);
    }
  });
}

/**
 * Called by websocket.js when a tool.result message arrives from Nexus.
 * Resolves the matching pending promise.
 */
function handleToolResult(requestId, success, data, error) {
  const pending = pendingToolCalls.get(requestId);
  if (!pending) return false;

  clearTimeout(pending.timer);
  pendingToolCalls.delete(requestId);

  if (success) {
    pending.resolve({ success: true, data });
  } else {
    pending.resolve({ success: false, error: typeof error === 'string' ? error : error?.message || 'Unknown error' });
  }
  return true;
}

module.exports = {
  NEXUS_TOOLS,
  NEXUS_TOOL_NAMES,
  SKILL_EXECUTION_TOOL,
  getOnlineNexusNode,
  getNexusToolsForWorkspace,
  executeNexusTool,
  handleToolResult,
};
