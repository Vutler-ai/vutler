'use strict';

const { randomUUID } = require('crypto');
const { dispatchNodeAction } = require('./nexusCommandService');
const { getNodeMode } = require('./nexusBilling');

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

const NEXUS_BASE_TOOLS = [
  SKILL_EXECUTION_TOOL,
  {
    name: 'send_email',
    description: "Send an email immediately from the current agent's workspace email identity. Use this when the user explicitly tells you to send, reply, or forward an email now. Do not look up contacts if the email address is already provided.",
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address or comma-separated list.' },
        subject: { type: 'string', description: 'Email subject line.' },
        body: { type: 'string', description: 'Final plain-text email body.' },
        htmlBody: { type: 'string', description: 'Optional HTML email body.' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'draft_email',
    description: 'Create an email draft for later review or manual sending. Use this when the user asks for a draft, asks to review before sending, or does not clearly authorize immediate delivery.',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address or comma-separated list.' },
        subject: { type: 'string', description: 'Email subject line.' },
        body: { type: 'string', description: 'Final plain-text email body.' },
        htmlBody: { type: 'string', description: 'Optional HTML email body.' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
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

const NEXUS_TERMINAL_TOOLS = [
  {
    name: 'open_terminal_session',
    description: 'Open a persistent terminal session on the Nexus node in a specific working directory.',
    input_schema: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Absolute working directory path to open the session in.' },
        cols: { type: 'number', description: 'Optional terminal width in columns.' },
        rows: { type: 'number', description: 'Optional terminal height in rows.' },
        env: { type: 'object', description: 'Optional environment variable overrides.' },
        shell: { type: 'string', description: 'Optional shell binary override.' },
      },
      required: ['cwd'],
    },
  },
  {
    name: 'exec_terminal_session',
    description: 'Send input to an existing Nexus terminal session and return incremental output.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'The terminal session identifier returned by open_terminal_session.' },
        input: { type: 'string', description: 'Exact input to send to the terminal.' },
        wait_ms: { type: 'number', description: 'Milliseconds to wait before collecting output (default 150).' },
        append_newline: { type: 'boolean', description: 'Whether to append a newline automatically when missing.' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'read_terminal_session',
    description: 'Read new output from an existing Nexus terminal session using the last known cursor.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'The terminal session identifier.' },
        cursor: { type: 'number', description: 'The last cursor position already consumed by the agent.' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'snapshot_terminal_session',
    description: 'Inspect the current state of a Nexus terminal session, including cwd and closed status.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'The terminal session identifier.' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'close_terminal_session',
    description: 'Close an existing Nexus terminal session when it is no longer needed.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'The terminal session identifier.' },
      },
      required: ['session_id'],
    },
  },
];

const NEXUS_TOOLS = [...NEXUS_BASE_TOOLS, ...NEXUS_TERMINAL_TOOLS];
const NEXUS_TOOL_NAMES = new Set(NEXUS_TOOLS.map((t) => t.name));
const LOCAL_TERMINAL_TOOL_NAMES = new Set(NEXUS_TERMINAL_TOOLS.map((tool) => tool.name));
const TOOL_GATES = {
  send_email: {
    runtime: 'workspace_email',
  },
  draft_email: {
    runtime: 'workspace_email',
  },
  search_files: {
    runtime: 'search',
    localActions: ['search'],
  },
  read_document: {
    runtime: 'documents',
    localActions: ['read_document'],
  },
  list_directory: {
    runtime: 'filesystem',
    localActions: ['list_dir'],
  },
  read_emails: {
    runtime: 'mail',
    localActions: ['list_emails', 'search_emails'],
  },
  read_calendar: {
    runtime: 'calendar',
    localActions: ['read_calendar'],
  },
  read_contacts: {
    runtime: 'contacts',
    localActions: ['read_contacts', 'search_contacts'],
  },
  read_clipboard: {
    runtime: 'clipboard',
    localActions: ['read_clipboard'],
  },
  open_terminal_session: {
    runtime: 'terminal',
    localActions: ['terminal_open'],
  },
  exec_terminal_session: {
    runtime: 'terminal',
    localActions: ['terminal_exec'],
  },
  read_terminal_session: {
    runtime: 'terminal',
    localActions: ['terminal_read'],
  },
  snapshot_terminal_session: {
    runtime: 'terminal',
    localActions: ['terminal_snapshot'],
  },
  close_terminal_session: {
    runtime: 'terminal',
    localActions: ['terminal_close'],
  },
};

// ── Tool name mapping: LLM tool name → Nexus orchestrator action ─────────────

function mapToolToNexus(toolName, args = {}) {
  const hasQuery = typeof args.query === 'string' && args.query.trim().length > 0;
  switch (toolName) {
    case 'execute_skill':  return 'execute_skill';
    case 'send_email':    return 'send_email';
    case 'draft_email':   return 'draft_email';
    case 'search_files':   return 'search';
    case 'read_document':  return 'read_document';
    case 'list_directory':  return 'list_dir';
    case 'read_emails':    return hasQuery ? 'search_emails' : 'list_emails';
    case 'read_calendar':  return 'read_calendar';
    case 'read_contacts':  return hasQuery ? 'search_contacts' : 'read_contacts';
    case 'read_clipboard': return 'read_clipboard';
    case 'open_terminal_session': return 'terminal_open';
    case 'exec_terminal_session': return 'terminal_exec';
    case 'read_terminal_session': return 'terminal_read';
    case 'snapshot_terminal_session': return 'terminal_snapshot';
    case 'close_terminal_session': return 'terminal_close';
    default:               return null;
  }
}

function mapToolArgs(toolName, args = {}) {
  const input = args && typeof args === 'object' ? args : {};
  switch (toolName) {
    case 'exec_terminal_session':
      return {
        sessionId: input.sessionId || input.session_id,
        input: input.input,
        waitMs: input.waitMs ?? input.wait_ms,
        appendNewline: input.appendNewline ?? input.append_newline,
      };
    case 'read_terminal_session':
      return {
        sessionId: input.sessionId || input.session_id,
        cursor: input.cursor,
      };
    case 'snapshot_terminal_session':
    case 'close_terminal_session':
      return {
        sessionId: input.sessionId || input.session_id,
      };
    default:
      return input;
  }
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(
    values
      .filter((value) => value !== null && value !== undefined && value !== '')
      .map((value) => String(value).trim())
      .filter(Boolean)
  ));
}

function getNodeConsentState(node = null) {
  return node?.config?.consent_state || node?.config?.consentState || null;
}

function getNodeDiscoverySnapshot(node = null) {
  return node?.config?.discovery_snapshot || node?.config?.discoverySnapshot || null;
}

function buildLocalActionGate(node = null) {
  const allowedActions = normalizeStringArray(node?.config?.permissions?.allowedActions);
  if (allowedActions.length > 0) {
    return {
      restrictive: true,
      actions: new Set(allowedActions),
    };
  }

  const consentSources = getNodeConsentState(node)?.sources;
  if (!consentSources || typeof consentSources !== 'object') {
    return {
      restrictive: false,
      actions: new Set(),
    };
  }

  const sourceEntries = Object.values(consentSources).filter((entry) => entry && typeof entry === 'object');
  const configured = sourceEntries.some((entry) =>
    entry.enabled
    || (Array.isArray(entry.apps) && entry.apps.length > 0)
    || (Array.isArray(entry.actions) && entry.actions.length > 0)
    || (Array.isArray(entry.allowedFolders) && entry.allowedFolders.length > 0)
  );
  const consentActions = normalizeStringArray(
    sourceEntries
      .filter((entry) => entry.enabled)
      .flatMap((entry) => entry.actions || [])
  );

  return {
    restrictive: configured,
    actions: new Set(consentActions),
  };
}

function isWorkspaceBackedNode(node = null) {
  return getNodeMode(node) === 'enterprise' || node?.type === 'docker';
}

function isLocalActionAllowed(gate, requiredActions = []) {
  if (!Array.isArray(requiredActions) || requiredActions.length === 0) return true;
  if (!gate?.restrictive) return true;
  return requiredActions.some((action) => gate.actions.has(action));
}

function isRuntimeAvailable(node, runtimeKey, options = {}) {
  const workspaceBacked = isWorkspaceBackedNode(node);
  const discoveryProviders = getNodeDiscoverySnapshot(node)?.providers || {};
  const discoveryEntry = runtimeKey ? discoveryProviders[runtimeKey] : null;

  if (runtimeKey === 'workspace_email') {
    if (!workspaceBacked) return false;
    return options.emailCapabilityEffective !== false;
  }

  if (runtimeKey === 'mail') {
    if (workspaceBacked) return options.workspaceMailAvailable !== false;
    if (discoveryEntry && discoveryEntry.available === false) return false;
    return true;
  }

  if (runtimeKey === 'calendar') {
    if (workspaceBacked) return options.workspaceCalendarAvailable !== false;
    if (discoveryEntry && discoveryEntry.available === false) return false;
    return true;
  }

  if (runtimeKey === 'contacts') {
    if (workspaceBacked) return options.workspaceContactsAvailable !== false;
    if (discoveryEntry && discoveryEntry.available === false) return false;
    return true;
  }

  if (discoveryEntry && discoveryEntry.available === false) {
    return false;
  }

  return true;
}

async function getOnlineNexusNodeRecord(workspaceId, pool) {
  if (!pool) return null;
  try {
    const result = await pool.query(
      `SELECT id, name, type, mode, config
         FROM tenant_vutler.nexus_nodes
        WHERE workspace_id = $1
          AND status = 'online'
        ORDER BY last_heartbeat DESC
        LIMIT 1`,
      [workspaceId]
    );
    return result.rows[0] || null;
  } catch {
    return null;
  }
}

// ── DB lookup: find online Nexus node for workspace ──────────────────────────

async function getOnlineNexusNode(workspaceId, pool) {
  const node = await getOnlineNexusNodeRecord(workspaceId, pool);
  return node ? { id: node.id, name: node.name } : null;
}

/**
 * Returns Nexus tool definitions if an online node exists for this workspace.
 * Otherwise returns an empty array (agents won't see Nexus tools).
 */
async function getNexusToolsForWorkspace(workspaceId, pool, options = {}) {
  const node = await getOnlineNexusNodeRecord(workspaceId, pool);
  if (!node) return [];
  const localActionGate = buildLocalActionGate(node);
  const visibleTools = options.allowTerminalSessions
    ? NEXUS_TOOLS
    : NEXUS_BASE_TOOLS;

  return visibleTools.filter((tool) => {
    if (tool.name === 'execute_skill') return true;

    const gate = TOOL_GATES[tool.name];
    if (!gate) return true;

    if (LOCAL_TERMINAL_TOOL_NAMES.has(tool.name) && !options.allowTerminalSessions) {
      return false;
    }

    if (!isRuntimeAvailable(node, gate.runtime, options)) {
      return false;
    }

    const runtimeIsWorkspaceBackedPim = isWorkspaceBackedNode(node)
      && (gate.runtime === 'mail' || gate.runtime === 'calendar' || gate.runtime === 'contacts');

    if (runtimeIsWorkspaceBackedPim) {
      return true;
    }

    return isLocalActionAllowed(localActionGate, gate.localActions);
  });
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

  const executionContext = normalizeExecutionContext(wsConnections);
  const mappedArgs = mapToolArgs(toolName, args);

  if (executionContext.workspaceId && executionContext.db) {
    const outcome = await dispatchNodeAction({
      db: executionContext.db,
      workspaceId: executionContext.workspaceId,
      nodeId,
      action: nexusAction,
      args: mappedArgs,
      wait: true,
      waitTimeoutMs: TOOL_TIMEOUT_MS,
    });

    if (outcome.queued || !outcome.done) {
      throw new Error(`Nexus tool call timed out after ${TOOL_TIMEOUT_MS}ms`);
    }

    const payload = outcome.done.result || {};
    if (outcome.done.status !== 'completed' || payload.status === 'error') {
      const errorMessage = payload.error?.message || payload.error || outcome.done.error || 'Nexus execution failed.';
      return { success: false, error: String(errorMessage) };
    }

    return { success: true, data: payload.data };
  }

  const conn = findWs(nodeId, executionContext.wsConnections);
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
        payload: { request_id: requestId, tool_name: nexusAction, args: mappedArgs || {}, timeout_ms: TOOL_TIMEOUT_MS },
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

function normalizeExecutionContext(value) {
  if (!value) return { wsConnections: null, workspaceId: null, db: null };

  if (value instanceof Map || typeof value.get === 'function') {
    return {
      wsConnections: value,
      workspaceId: null,
      db: null,
    };
  }

  if (typeof value === 'object') {
    const hasWrappedContext = Object.prototype.hasOwnProperty.call(value, 'wsConnections')
      || Object.prototype.hasOwnProperty.call(value, 'workspaceId')
      || Object.prototype.hasOwnProperty.call(value, 'db');

    return {
      wsConnections: hasWrappedContext ? (value.wsConnections || null) : value,
      workspaceId: hasWrappedContext ? (value.workspaceId || null) : null,
      db: hasWrappedContext ? (value.db || null) : null,
    };
  }

  return { wsConnections: null, workspaceId: null, db: null };
}

module.exports = {
  NEXUS_TOOLS,
  NEXUS_BASE_TOOLS,
  NEXUS_TERMINAL_TOOLS,
  NEXUS_TOOL_NAMES,
  SKILL_EXECUTION_TOOL,
  getOnlineNexusNode,
  getNexusToolsForWorkspace,
  executeNexusTool,
  handleToolResult,
};
