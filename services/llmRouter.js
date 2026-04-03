'use strict';

const https = require('https');
const { buildAgentMemoryBindings } = require('./sniparaMemoryService');
const { createSniparaGateway } = require('./snipara/gateway');
const { createMemoryRuntimeService } = require('./memory/runtime');
const { resolveMemoryMode } = require('./memory/modeResolver');
const { insertChatActionRun, updateChatActionRun } = require('./chatActionRuns');
const { buildInternalPlacementInstruction, normalizeCapabilities } = require('./agentConfigPolicy');
const { resolveAgentRuntimeIntegrations, getSkillKeysForIntegrationProviders } = require('./agentIntegrationService');
const { isSandboxEligibleAgentType } = require('./agentTypeProfiles');
const {
  resolveLegacyWorkspaceProvider,
  syncLegacyWorkspaceProviders,
} = require('./llmProviderCompat');
const {
  resolveWorkspaceCapabilityAvailability,
  filterAvailableProviders,
  getUnavailableProviders,
  filterAvailableSkillKeys,
  isProviderAvailable,
  inferProviderForSkill,
} = require('./runtimeCapabilityAvailability');
const {
  resolveAgentEmailProvisioning,
  filterProvisionedSkillKeys,
  getProvisioningReasonForSkill,
  getUnavailableAgentProviders,
} = require('./agentProvisioningService');
const { orchestrateToolCall } = require('./orchestration/orchestrator');
const { governOrchestrationDecision } = require('./orchestration/policy');
const { executeOrchestrationDecision } = require('./orchestration/actionRouter');
const memoryRuntime = createMemoryRuntimeService();

function formatToolResultContent(result) {
  if (!result) return 'Tool completed with no result.';
  if (result.success === false) return `Error: ${result.error || 'Tool execution failed'}`;

  const payload = Object.prototype.hasOwnProperty.call(result, 'data') ? result.data : result;
  if (typeof payload === 'string') return payload;

  try {
    return JSON.stringify(payload);
  } catch (_) {
    return 'Tool completed successfully.';
  }
}

function normalizeToolCall(toolCall = {}) {
  const callId = toolCall.call_id || toolCall.id || null;
  return {
    id: callId,
    call_id: callId,
    name: toolCall.name || toolCall.function?.name || null,
    arguments: toolCall.arguments || toolCall.function?.arguments || {},
  };
}

function getToolCallId(toolCall = {}) {
  return toolCall.call_id || toolCall.id || null;
}

function getDefaultToolParameters() {
  return {
    type: 'object',
    properties: {},
    required: [],
  };
}

function normalizeFunctionToolDefinition(tool) {
  if (!tool || typeof tool !== 'object') return null;

  if (tool.type === 'function' && tool.function?.name) {
    return {
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters || getDefaultToolParameters(),
    };
  }

  if (tool.type === 'function' && tool.name) {
    return {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters || tool.input_schema || getDefaultToolParameters(),
    };
  }

  if (tool.name) {
    return {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters || tool.input_schema || getDefaultToolParameters(),
    };
  }

  return null;
}

function mapOpenAITool(tool) {
  const normalized = normalizeFunctionToolDefinition(tool);
  if (!normalized) return null;

  return {
    type: 'function',
    function: {
      name: normalized.name,
      description: normalized.description,
      parameters: normalized.parameters,
    },
  };
}

function mapResponsesTool(tool) {
  const normalized = normalizeFunctionToolDefinition(tool);
  if (!normalized) return null;

  return {
    type: 'function',
    name: normalized.name,
    description: normalized.description,
    parameters: normalized.parameters,
    strict: false,
  };
}

function mapAnthropicTool(tool) {
  if (!tool || typeof tool !== 'object') return null;
  if (!tool.type && tool.name && tool.input_schema) return tool;

  const normalized = normalizeFunctionToolDefinition(tool);
  if (!normalized) return null;

  return {
    name: normalized.name,
    description: normalized.description,
    input_schema: normalized.parameters,
  };
}

function prepareToolsForProvider(provider, tools) {
  if (!Array.isArray(tools) || tools.length === 0) return null;

  const mapper = provider === 'anthropic'
    ? mapAnthropicTool
    : provider === 'codex'
      ? mapResponsesTool
      : mapOpenAITool;

  const preparedTools = tools
    .map((tool, index) => {
      const mapped = mapper(tool);
      if (!mapped) {
        console.warn(
          `[LLM Router] Dropping invalid tool for provider ${provider} at index ${index}: ${JSON.stringify({
            type: tool?.type || null,
            name: tool?.name || tool?.function?.name || null,
          })}`
        );
      }
      return mapped;
    })
    .filter(Boolean);

  return preparedTools.length > 0 ? preparedTools : null;
}

function mapResponsesInputItem(message) {
  if (!message) return null;

  if (message.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
    const items = [];
    if (message.content) {
      items.push({
        role: 'assistant',
        content: String(message.content || ''),
      });
    }
    for (const rawToolCall of message.tool_calls) {
      const toolCall = normalizeToolCall(rawToolCall);
      if (!toolCall.call_id || !toolCall.name) continue;
      items.push({
        type: 'function_call',
        call_id: toolCall.call_id,
        name: toolCall.name,
        arguments: JSON.stringify(toolCall.arguments || {}),
      });
    }
    return items;
  }

  if (message.role === 'tool' && message.tool_call_id) {
    return {
      type: 'function_call_output',
      call_id: message.tool_call_id,
      output: String(message.content || ''),
    };
  }

  if (message.role === 'assistant' && !message.content) {
    return null;
  }

  if (message.role === 'assistant' || message.role === 'user') {
    return {
      role: message.role,
      content: String(message.content || ''),
    };
  }

  return null;
}

function normalizeDrivePath(pathValue) {
  const raw = String(pathValue || '').trim();
  if (!raw) return '';
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  return normalized.replace(/\/{2,}/g, '/');
}

function getDriveParentPath(pathValue) {
  const normalized = normalizeDrivePath(pathValue);
  if (!normalized || normalized === '/') return '/';
  const trimmed = normalized.replace(/\/+$/, '');
  const idx = trimmed.lastIndexOf('/');
  return idx <= 0 ? '/' : trimmed.slice(0, idx);
}

function buildDriveLink({ pathValue, fileId } = {}) {
  const query = [];
  const normalizedPath = normalizeDrivePath(pathValue);
  if (normalizedPath) query.push(`path=${encodeURIComponent(normalizedPath)}`);
  if (fileId) query.push(`file=${encodeURIComponent(String(fileId))}`);
  return `/drive${query.length > 0 ? `?${query.join('&')}` : ''}`;
}

function safeCalendarLink(data = {}, args = {}) {
  const eventId = data.id || data.eventId || data.event_id || data.googleEventId || data.sourceId || data.source_id || args.eventId || args.id || null;
  const candidate = data.start || data.start_time || data.date || args.start || args.date || null;
  const date = candidate ? String(candidate).slice(0, 10) : '';
  if (eventId && date) return `/calendar?date=${encodeURIComponent(date)}&event=${encodeURIComponent(String(eventId))}`;
  if (eventId) return `/calendar?event=${encodeURIComponent(String(eventId))}`;
  if (date) return `/calendar?date=${encodeURIComponent(date)}`;
  if (data.htmlLink) return String(data.htmlLink);
  return '/calendar';
}

function safeEmailLink(data = {}, args = {}) {
  const folder = String(data.folder || data.mailbox || data.box || args.folder || 'drafts').toLowerCase();
  const uid = data.uid || data.id || data.messageId || data.message_id || data.draftId || data.draft_id || args.uid || args.id || args.messageId || args.draftId || null;
  if (uid) return `/email?folder=${encodeURIComponent(folder)}&uid=${encodeURIComponent(String(uid))}`;
  return `/email?folder=${encodeURIComponent(folder)}`;
}

function safeTaskLink(data = {}, args = {}) {
  const taskId = data.taskId || data.task_id || data.id || args.taskId || args.task_id || args.id || null;
  if (data.taskUrl) return String(data.taskUrl);
  if (taskId) return `/tasks?task=${encodeURIComponent(String(taskId))}`;
  return '/tasks';
}

function buildArtifact({ kind, label, href, note, action = 'Open' }) {
  if (!href) return null;
  return {
    kind,
    label,
    href,
    note: note ? String(note) : undefined,
    action,
  };
}

function extractResourceArtifacts(skillKey, result, args = {}) {
  const artifacts = [];
  const data = result?.data ?? {};
  const skill = String(skillKey || '').toLowerCase();
  const action = String(args.action || data.action || '').toLowerCase();

  if (skill.includes('workspace_drive') || skill.includes('google_drive')) {
    const fileLike =
      data.created ||
      data.file ||
      data.updated ||
      data.written ||
      data.downloaded ||
      data.read ||
      data;

    const pathValue =
      fileLike?.path ||
      data.path ||
      data.to ||
      data.filePath ||
      data.targetPath ||
      data.source?.path ||
      data.folder?.path ||
      args.path ||
      args.filePath ||
      args.targetPath ||
      null;

    const fileId = fileLike?.id || data.id || data.fileId || data.file_id || args.fileId || args.id || null;
    const isFolder = String(fileLike?.type || data.type || '').toLowerCase() === 'folder' || action === 'create_folder' || Boolean(data.created && !fileId);
    const isExactFileAction = ['read', 'download', 'write_text', 'create', 'update'].includes(action) || Boolean(fileId && !isFolder);
    const shouldRenderDriveArtifact = isFolder || isExactFileAction;

    if (!shouldRenderDriveArtifact && !skill.includes('google_drive')) {
      return artifacts;
    }

    if (skill.includes('google_drive')) {
      const webViewLink = fileLike?.webViewLink || data.webViewLink || data.htmlLink || null;
      const href = webViewLink || (fileId ? buildDriveLink({ pathValue: pathValue ? getDriveParentPath(pathValue) : '', fileId }) : null);
      const note = fileLike?.name || data.name || pathValue || undefined;
      const artifact = buildArtifact({
        kind: isFolder ? 'drive-folder' : 'drive-file',
        label: isFolder ? 'Open folder in Drive' : 'Open file in Drive',
        href,
        note,
      });
      if (artifact) artifacts.push(artifact);
    } else if (skill.includes('workspace_drive')) {
      const href = isFolder
        ? buildDriveLink({ pathValue })
        : buildDriveLink({
          pathValue: pathValue ? getDriveParentPath(pathValue) : args.path || '',
          fileId: isExactFileAction ? fileId : null,
        });
      const note = fileLike?.name || pathValue || undefined;
      const artifact = buildArtifact({
        kind: isFolder ? 'drive-folder' : 'drive-file',
        label: isFolder ? 'Open folder in Drive' : 'Open file in Drive',
        href,
        note,
      });
      if (artifact) artifacts.push(artifact);
    }
  }

  if (skill.includes('calendar')) {
    const href = safeCalendarLink(data, args);
    const eventLabel = data.summary || data.title || data.event?.summary || 'Calendar item';
    const artifact = buildArtifact({
      kind: 'calendar-event',
      label: data.htmlLink ? 'Open calendar event' : 'Open calendar',
      href,
      note: eventLabel,
    });
    if (artifact) artifacts.push(artifact);
  }

  if (skill.includes('email')) {
    const href = safeEmailLink(data, args);
    const draftId = data.draftId || data.draft_id || data.id || data.uid || data.messageId || data.message_id || null;
    const subject = data.subject || data.message || data.bodyPreview || data.snippet || undefined;
    const artifact = buildArtifact({
      kind: draftId ? 'email-draft' : 'email-message',
      label: draftId ? 'Open email draft' : 'Open email',
      href,
      note: draftId ? `Draft ${draftId}` : subject,
    });
    if (artifact) artifacts.push(artifact);
  }

  if (skill.includes('task_management') || skill.includes('project_management') || /(^|[_-])task(s)?($|[_-])/.test(skill)) {
    const href = safeTaskLink(data, args);
    const taskId = data.taskId || data.task_id || data.id || args.taskId || args.task_id || args.id || null;
    const taskTitle = data.title || data.task?.title || data.name || args.title || undefined;
    const artifact = buildArtifact({
      kind: 'task-item',
      label: taskId ? 'Open task' : 'Open tasks',
      href,
      note: taskTitle || (taskId ? `Task ${taskId}` : undefined),
    });
    if (artifact) artifacts.push(artifact);
  }

  return artifacts.filter((artifact) => artifact?.href);
}

function dedupeArtifacts(artifacts = []) {
  const unique = [];
  const seen = new Set();
  for (const artifact of artifacts) {
    if (!artifact?.href || seen.has(artifact.href)) continue;
    seen.add(artifact.href);
    unique.push(artifact);
  }
  return unique;
}

function appendResourceArtifacts(content, artifacts = []) {
  const current = String(content || '').trim();
  const unique = dedupeArtifacts(artifacts).filter((artifact) => !current.includes(artifact.href));

  if (unique.length === 0) return { content, artifacts: dedupeArtifacts(artifacts) };

  const block = ['Liens utiles:', ...unique.map((artifact) => {
    const note = artifact.note ? ` — ${artifact.note}` : '';
    return `- [${artifact.label}](${artifact.href})${note}`;
  })].join('\n');

  return {
    content: current ? `${current}\n\n${block}` : block,
    artifacts: dedupeArtifacts(artifacts),
  };
}

async function startToolActionRun(db, chatActionContext, agent, actionKey, adapter, inputJson) {
  if (!db || !chatActionContext?.messageId || !chatActionContext?.workspaceId || !chatActionContext?.channelId) {
    return null;
  }

  return insertChatActionRun(db, 'tenant_vutler', {
    workspace_id: chatActionContext.workspaceId,
    chat_message_id: chatActionContext.messageId,
    channel_id: chatActionContext.channelId,
    requested_agent_id: chatActionContext.requestedAgentId || agent?.id || null,
    display_agent_id: chatActionContext.displayAgentId || agent?.id || null,
    orchestrated_by: chatActionContext.orchestratedBy || 'jarvis',
    executed_by: agent?.id || null,
    action_key: actionKey,
    adapter,
    status: 'running',
    input_json: inputJson,
  });
}

async function finishToolActionRun(db, runId, agentId, result, err) {
  if (!db || !runId) return;

  const isError = Boolean(err) || result?.success === false;
  const persistedOutput = isError
    ? null
    : (result?.persisted_output ?? result?.data ?? result ?? null);
  await updateChatActionRun(db, 'tenant_vutler', runId, {
    status: isError ? 'error' : 'success',
    executed_by: agentId || null,
    output_json: persistedOutput,
    error_json: isError ? { error: err?.message || result?.error || 'Tool execution failed' } : null,
  }).catch(() => {});
}

async function storeToolObservation(db, workspaceId, agent, toolName, args, result) {
  if (!db || !workspaceId || !agent || !toolName || !result || result.success === false) return;
  await memoryRuntime.recordToolObservation({
    db,
    workspaceId,
    agent,
    toolName,
    args,
    result,
  }).catch((err) => {
    console.warn('[LLM Router] tool memory extraction failed:', err.message);
  });
}

function buildSandboxToolPayload(execution) {
  return {
    job_id: execution?.job_id || execution?.execution_id || execution?.id || null,
    execution_id: execution?.execution_id || execution?.id || null,
    language: execution?.language || null,
    status: execution?.status || 'failed',
    stdout: execution?.stdout || '',
    stderr: execution?.stderr || '',
    exit_code: execution?.exit_code ?? null,
    duration_ms: execution?.duration_ms ?? null,
    started_at: execution?.started_at || null,
    finished_at: execution?.finished_at || null,
  };
}

function buildToolOrchestrationPayload(orchestrationDecision, governance, actionResults) {
  return {
    orchestration_decision: orchestrationDecision || null,
    decision: governance?.decision || null,
    reason: governance?.reason || null,
    risk_level: governance?.risk_level || null,
    governed_decision: governance?.decisionPayload || null,
    action_results: Array.isArray(actionResults) ? actionResults : [],
  };
}

function buildPersistedOrchestrationOutput(data, orchestrationPayload) {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return {
      ...data,
      orchestration: orchestrationPayload,
    };
  }

  return {
    result: data ?? null,
    orchestration: orchestrationPayload,
  };
}

function buildOrchestratedToolResult(actionResult, orchestrationPayload) {
  const data = actionResult?.output_json ?? (actionResult?.output_text ? { text: actionResult.output_text } : null);
  return {
    success: actionResult?.success !== false,
    data,
    persisted_output: buildPersistedOrchestrationOutput(data, orchestrationPayload),
    orchestration: orchestrationPayload,
  };
}

function buildOrchestratedTextToolResult(outputText, data, orchestrationPayload) {
  const persistedData = data && typeof data === 'object'
    ? data
    : { text: outputText || null };
  return {
    success: true,
    data: outputText || 'Tool completed successfully.',
    persisted_output: buildPersistedOrchestrationOutput(persistedData, orchestrationPayload),
    orchestration: orchestrationPayload,
  };
}

function buildSocialToolResult(actionResult, orchestrationPayload) {
  const data = actionResult?.output_json || {};
  const accountCount = Number(data.account_count || 0);
  const postId = data.post_id || 'pending';
  return buildOrchestratedTextToolResult(
    `Post published successfully to ${accountCount} account(s). Post ID: ${postId}`,
    data,
    orchestrationPayload
  );
}

function buildMemoryToolResult(toolName, actionResult, orchestrationPayload) {
  const data = actionResult?.output_json || null;
  if (toolName === 'remember') {
    return buildOrchestratedTextToolResult(
      'Memory stored successfully.',
      data || { stored: true },
      orchestrationPayload
    );
  }

  const recalledText = typeof data?.text === 'string' && data.text.trim()
    ? data.text
    : (actionResult?.output_text || 'No relevant memories found.');
  return buildOrchestratedTextToolResult(
    recalledText,
    data || { text: recalledText },
    orchestrationPayload
  );
}

async function executeToolThroughOrchestration({
  toolName,
  args,
  adapter,
  agent,
  workspaceId,
  db,
  wsConnections,
  chatActionContext,
  chatActionRunId = null,
  model = null,
  provider = null,
  nexusNodeId = null,
  allowedSocialPlatforms = [],
  allowedSocialAccountIds = [],
  allowedSocialBrandIds = [],
  memoryBindings = null,
  memoryMode = null,
} = {}) {
  const orchestrationInput = {
    toolName,
    args,
    adapter,
    agent,
    workspaceId,
    chatActionContext,
    nexusNodeId,
  };
  if (Array.isArray(allowedSocialPlatforms) && allowedSocialPlatforms.length > 0) {
    orchestrationInput.allowedSocialPlatforms = allowedSocialPlatforms;
  }
  if (Array.isArray(allowedSocialAccountIds) && allowedSocialAccountIds.length > 0) {
    orchestrationInput.allowedSocialAccountIds = allowedSocialAccountIds;
  }
  if (Array.isArray(allowedSocialBrandIds) && allowedSocialBrandIds.length > 0) {
    orchestrationInput.allowedSocialBrandIds = allowedSocialBrandIds;
  }
  if (memoryBindings) {
    orchestrationInput.memoryBindings = memoryBindings;
  }
  if (memoryMode && (memoryMode.read || memoryMode.write || memoryMode.mode)) {
    orchestrationInput.memoryMode = memoryMode;
  }

  const orchestrationDecision = orchestrateToolCall(orchestrationInput);
  if (!orchestrationDecision) {
    throw new Error(`Unsupported orchestration tool: ${toolName}`);
  }

  const governance = governOrchestrationDecision(orchestrationDecision, {
    agent,
    workspaceId,
    db,
    wsConnections,
    chatActionContext,
    nexusNodeId,
    memoryMode,
  });
  if (!governance.allowed || !governance.decisionPayload) {
    throw new Error(governance.reason || `${toolName} execution was denied.`);
  }

  const actionResults = await executeOrchestrationDecision(governance.decisionPayload, {
    db,
    wsConnections,
    chatActionContext,
    chatActionRunId,
    model,
    provider,
    nexusNodeId,
  });
  const actionResult = Array.isArray(actionResults) ? actionResults[0] : null;

  return {
    orchestrationDecision,
    governance,
    actionResults,
    actionResult,
  };
}

// ── Memory tool definitions injected when an agent has a Snipara scope ────────

const MEMORY_REMEMBER_TOOL = {
  type: 'function',
  function: {
    name: 'remember',
    description: 'Store important information for future reference. Use when the user shares facts, preferences, decisions, or context you should remember.',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The information to remember' },
        importance: { type: 'integer', minimum: 1, maximum: 10, description: 'How important (1=trivial, 10=critical)' },
        type: { type: 'string', enum: ['fact', 'preference', 'decision', 'context', 'action_log'], description: 'Type of memory' },
      },
      required: ['content'],
    },
  },
};

const MEMORY_RECALL_TOOL = {
  type: 'function',
  function: {
    name: 'recall',
    description: 'Search your memory for relevant information before responding. Use when you need context about the user, project, or previous interactions.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for in memory' },
      },
      required: ['query'],
    },
  },
};

// ── Social media tool definition ──────────────────────────────────────────────

const SOCIAL_MEDIA_TOOL = {
  type: 'function',
  function: {
    name: 'vutler_post_social_media',
    description: 'Post content to connected social media accounts (LinkedIn, X, Instagram, TikTok, etc.). Use when asked to publish or share content on social media.',
    parameters: {
      type: 'object',
      properties: {
        caption: { type: 'string', description: 'The text content to post' },
        platforms: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: specific platforms to post to (e.g. ["linkedin", "twitter"]). If omitted, posts to all connected accounts.',
        },
        scheduled_at: { type: 'string', description: 'Optional: ISO 8601 datetime to schedule the post for later' },
      },
      required: ['caption'],
    },
  },
};

const SANDBOX_CODE_EXECUTION_TOOL = {
  type: 'function',
  function: {
    name: 'run_code_in_sandbox',
    description: 'Execute short JavaScript or Python code in the Vutler sandbox. Use for calculations, data transformation, parsing, validation, or lightweight technical checks. Shell access is not available.',
    parameters: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          enum: ['javascript', 'python'],
          description: 'Programming language to execute.',
        },
        code: {
          type: 'string',
          description: 'The code snippet to execute.',
        },
        timeout_ms: {
          type: 'integer',
          minimum: 1000,
          maximum: 30000,
          description: 'Optional execution timeout in milliseconds. Defaults to 15000 and is capped at 30000.',
        },
      },
      required: ['language', 'code'],
    },
  },
};

const PROVIDERS = {
  openai: {
    baseURL: 'https://api.openai.com/v1',
    path: '/chat/completions',
    format: 'openai',
    defaultModel: 'gpt-5.4',
    defaultHeaders: {},
  },
  anthropic: {
    baseURL: 'https://api.anthropic.com/v1',
    path: '/messages',
    format: 'anthropic',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultHeaders: { 'anthropic-version': '2023-06-01' },
  },
  openrouter: {
    baseURL: 'https://openrouter.ai/api/v1',
    path: '/chat/completions',
    format: 'openai',
    defaultModel: 'openrouter/auto',
    defaultHeaders: {
      'HTTP-Referer': 'https://app.vutler.ai',
      'X-Title': 'Vutler',
    },
  },
  mistral: {
    baseURL: 'https://api.mistral.ai/v1',
    path: '/chat/completions',
    format: 'openai',
    defaultModel: 'mistral-large-latest',
    defaultHeaders: {},
  },
  groq: {
    baseURL: 'https://api.groq.com/openai/v1',
    path: '/chat/completions',
    format: 'openai',
    defaultModel: 'llama-3.3-70b-versatile',
    defaultHeaders: {},
  },
  codex: {
    baseURL: 'https://chatgpt.com/backend-api',
    path: '/codex/responses',
    format: 'responses',
    defaultModel: 'gpt-5.3-codex',
    defaultHeaders: {},
  },
  'vutler-trial': {
    baseURL: 'https://api.openai.com/v1',
    path: '/chat/completions',
    format: 'openai',
    defaultModel: 'gpt-4o-mini',
    defaultHeaders: {},
  },
};

function detectProvider(model) {
  if (!model) return 'openrouter'; // default to OpenRouter auto
  const m = String(model).toLowerCase();
  if (m.startsWith('codex/')) return 'codex';
  if (m.includes('claude') || m.includes('sonnet') || m.includes('haiku') || m.includes('opus')) return 'anthropic';
  if (m.includes('/')) return 'openrouter';
  if (m.includes('mistral')) return 'mistral';
  if (m.includes('llama') || m.includes('mixtral') || m.includes('groq')) return 'groq';
  if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')) return 'openai';
  return 'openrouter'; // fallback to OpenRouter auto for unknown models
}

// Strip codex/ prefix to get the real OpenAI model ID
function resolveCodexModel(model) {
  return String(model).replace(/^codex\//, '');
}

// ── Trial token helpers ──────────────────────────────────────────────────────
const _trialRateWindows = new Map(); // workspaceId → timestamp[]
const TRIAL_RATE_LIMIT = 5;
const TRIAL_RATE_WINDOW_MS = 60000;

// Cleanup stale rate-limit entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - TRIAL_RATE_WINDOW_MS * 2;
  for (const [wsId, timestamps] of _trialRateWindows) {
    const fresh = timestamps.filter(t => t > cutoff);
    if (fresh.length === 0) _trialRateWindows.delete(wsId);
    else _trialRateWindows.set(wsId, fresh);
  }
}, 300000);

async function checkTrialQuota(db, workspaceId) {
  const rows = await db.query(
    `SELECT key, value FROM tenant_vutler.workspace_settings
     WHERE workspace_id = $1 AND key IN ('trial_tokens_total', 'trial_tokens_used', 'trial_expires_at')`,
    [workspaceId]
  );
  const s = {};
  for (const r of rows.rows) s[r.key] = r.value;

  const total = parseInt(s.trial_tokens_total, 10) || 0;
  const used = parseInt(s.trial_tokens_used, 10) || 0;
  const expiresAt = s.trial_expires_at ? new Date(s.trial_expires_at) : null;

  if (expiresAt && expiresAt < new Date()) {
    return { allowed: false, remaining: 0, reason: 'Trial expired' };
  }
  const remaining = total - used;
  if (remaining <= 0) {
    return { allowed: false, remaining: 0, reason: 'Trial tokens exhausted' };
  }
  return { allowed: true, remaining };
}

function checkTrialRateLimit(workspaceId) {
  const now = Date.now();
  const timestamps = _trialRateWindows.get(workspaceId) || [];
  const recent = timestamps.filter(t => t > now - TRIAL_RATE_WINDOW_MS);
  if (recent.length >= TRIAL_RATE_LIMIT) {
    return { allowed: false, reason: 'Trial rate limit exceeded (5 req/min)' };
  }
  recent.push(now);
  _trialRateWindows.set(workspaceId, recent);
  return { allowed: true };
}

async function debitTrialTokens(db, workspaceId, tokensUsed) {
  try {
    await db.query(
      `UPDATE tenant_vutler.workspace_settings
       SET value = to_jsonb((value::text::int + $1)), updated_at = NOW()
       WHERE workspace_id = $2 AND key = 'trial_tokens_used'`,
      [tokensUsed, workspaceId]
    );
  } catch (err) {
    console.warn('[LLM Router] debitTrialTokens error:', err.message);
  }
}

function parseUrl(baseURL) {
  const u = new URL(baseURL);
  return { hostname: u.hostname, pathPrefix: u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '') };
}

function readWorkspaceSettingValue(rawValue) {
  if (rawValue === undefined || rawValue === null) return null;
  if (typeof rawValue === 'object' && rawValue !== null && 'value' in rawValue) {
    return rawValue.value;
  }
  return rawValue;
}

async function resolveWorkspaceProvider(db, workspaceId, providerName, options = {}) {
  if (!db || !workspaceId || (!providerName && !options.id)) return null;
  try {
    await syncLegacyWorkspaceProviders(db, workspaceId).catch(() => {});

    let r;
    if (options.id) {
      r = await db.query(
        `SELECT id, provider, api_key, base_url, config, is_enabled, is_default
           FROM tenant_vutler.llm_providers
          WHERE workspace_id = $1 AND id = $2 AND is_enabled = true
          LIMIT 1`,
        [workspaceId, options.id]
      );
      if (r.rows?.[0]?.api_key) return r.rows[0];
    }

    if (!providerName) return null;

    r = await db.query(
        `SELECT id, provider, api_key, base_url, config, is_enabled, is_default
         FROM tenant_vutler.llm_providers
        WHERE workspace_id = $1 AND provider = $2 AND is_enabled = true
        ORDER BY is_default DESC, created_at DESC
        LIMIT 1`,
      [workspaceId, providerName]
    );
    if (r.rows?.[0]?.api_key) return r.rows[0];
  } catch (err) {
    console.warn('[LLM Router] resolveWorkspaceProvider failed:', err.message);
  }

  try {
    return await resolveLegacyWorkspaceProvider(db, workspaceId, providerName, options);
  } catch (err) {
    console.warn('[LLM Router] resolveLegacyWorkspaceProvider failed:', err.message);
    return null;
  }
}

async function resolveWorkspaceDefaultProvider(db, workspaceId) {
  if (!db || !workspaceId) return null;

  try {
    const kvResult = await db.query(
      `SELECT value
         FROM tenant_vutler.workspace_settings
        WHERE workspace_id = $1 AND key = 'default_provider'
        LIMIT 1`,
      [workspaceId]
    );
    const kvValue = readWorkspaceSettingValue(kvResult.rows?.[0]?.value);
    const explicit = await resolveWorkspaceProvider(db, workspaceId, typeof kvValue === 'string' ? kvValue : null, {
      id: typeof kvValue === 'string' ? kvValue : null,
    });
    if (explicit) return explicit;
  } catch (_) {
    // Workspace settings may use a flat schema in some environments.
  }

  try {
    const flatResult = await db.query(
      `SELECT default_provider
         FROM tenant_vutler.workspace_settings
        WHERE workspace_id = $1
        LIMIT 1`,
      [workspaceId]
    );
    const flatValue = readWorkspaceSettingValue(flatResult.rows?.[0]?.default_provider);
    const explicit = await resolveWorkspaceProvider(db, workspaceId, typeof flatValue === 'string' ? flatValue : null, {
      id: typeof flatValue === 'string' ? flatValue : null,
    });
    if (explicit) return explicit;
  } catch (_) {
    // Ignore and fall back to the provider flag below.
  }

  try {
    const result = await db.query(
      `SELECT id, provider, api_key, base_url, config, is_enabled, is_default
         FROM tenant_vutler.llm_providers
        WHERE workspace_id = $1 AND is_enabled = true AND is_default = true
        ORDER BY created_at DESC
        LIMIT 1`,
      [workspaceId]
    );
    return result.rows?.[0] || null;
  } catch (err) {
    console.warn('[LLM Router] resolveWorkspaceDefaultProvider failed:', err.message);
    return null;
  }
}

// Resolve OAuth token for the "codex" provider from workspace_integrations (ChatGPT OAuth)
async function resolveCodexOAuthToken(db, workspaceId) {
  if (!db || !workspaceId) return null;
  try {
    const r = await db.query(
      `SELECT access_token, refresh_token, token_expires_at
       FROM tenant_vutler.workspace_integrations
       WHERE workspace_id = $1 AND provider = 'chatgpt' AND connected = TRUE
       LIMIT 1`,
      [workspaceId]
    );
    const row = r.rows?.[0];
    if (!row?.access_token) return null;

    // Check if token is expired or about to expire (within 5 min)
    const expiresAt = row.token_expires_at ? new Date(row.token_expires_at) : null;
    if (expiresAt && expiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
      try {
        const { refreshChatGPTToken } = require('../api/integrations');
        const newToken = await refreshChatGPTToken(workspaceId);
        return newToken || row.access_token; // Fall back to existing token
      } catch (refreshErr) {
        console.warn('[LLM Router] ChatGPT token refresh failed:', refreshErr.message);
        return row.access_token; // Try the existing token anyway
      }
    }

    return row.access_token;
  } catch (err) {
    console.warn('[LLM Router] resolveCodexOAuthToken failed:', err.message);
    return null;
  }
}

function buildRequest(provider, model, messages, systemPrompt, options = {}) {
  const cfg = PROVIDERS[provider];
  if (!cfg) throw new Error(`Unsupported provider: ${provider}`);

  const temperature = options.temperature ?? 0.7;
  const maxTokens = options.maxTokens ?? 4096;
  const apiKey = options.apiKey;
  if (!apiKey) throw new Error(`Missing api_key for provider ${provider}`);

  const baseURL = options.baseURL || cfg.baseURL;
  const { hostname, pathPrefix } = parseUrl(baseURL);
  const path = `${pathPrefix}${cfg.path}`;
  const tools = prepareToolsForProvider(provider, options.tools || null);

  if (cfg.format === 'anthropic') {
    const sysMsg = systemPrompt || messages.find(m => m.role === 'system')?.content || '';
    const userMsgs = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

    const body = {
      model: model || cfg.defaultModel,
      max_tokens: maxTokens,
      temperature,
      system: sysMsg,
      messages: userMsgs,
    };
    if (tools && tools.length > 0) body.tools = tools;

    return {
      hostname,
      path,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        ...cfg.defaultHeaders,
      },
      body,
    };
  }

  // Responses API format (used by Codex via chatgpt.com/backend-api)
  if (cfg.format === 'responses') {
    const input = messages
      .filter((message) => message.role !== 'system')
      .flatMap((message) => {
        const item = mapResponsesInputItem(message);
        if (Array.isArray(item)) return item;
        return item ? [item] : [];
      });

    const body = {
      model: model || cfg.defaultModel,
      instructions: systemPrompt || 'You are a helpful AI assistant.',
      input,
      store: false,
      stream: true,
    };
    if (tools && tools.length > 0) body.tools = tools;

    return {
      hostname,
      path,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...cfg.defaultHeaders,
      },
      body,
    };
  }

  const allMsgs = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages.filter(m => m.role !== 'system')]
    : messages;

  const body = {
    model: model || cfg.defaultModel,
    messages: allMsgs,
    temperature,
    max_tokens: maxTokens,
  };
  if (tools && tools.length > 0) body.tools = tools;

  return {
    hostname,
    path,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...cfg.defaultHeaders,
    },
    body,
  };
}

function httpPost(hostname, path, headers, body, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    headers['Content-Length'] = Buffer.byteLength(data);

    const req = https.request({ hostname, port: 443, path, method: 'POST', headers }, (res) => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        let obj;
        try {
          obj = raw ? JSON.parse(raw) : {};
        } catch (e) {
          return reject(new Error(`LLM parse error: ${e.message}`));
        }
        if (res.statusCode >= 400) return reject(new Error(`LLM HTTP ${res.statusCode}: ${JSON.stringify(obj)}`));
        resolve(obj);
      });
    });

    req.setTimeout(timeoutMs, () => req.destroy(new Error('LLM timeout')));
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Stream SSE response from Codex/Responses API and collect the final response object
function httpPostStream(hostname, path, headers, body, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    headers['Content-Length'] = Buffer.byteLength(data);

    const req = https.request({ hostname, port: 443, path, method: 'POST', headers }, (res) => {
      if (res.statusCode >= 400) {
        let raw = '';
        res.on('data', c => { raw += c; });
        res.on('end', () => {
          try { reject(new Error(`LLM HTTP ${res.statusCode}: ${raw}`)); }
          catch { reject(new Error(`LLM HTTP ${res.statusCode}`)); }
        });
        return;
      }

      let raw = '';
      let lastResponseObj = null;
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        // Parse SSE events: collect all "response.completed" or last "response.*" event
        const lines = raw.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const payload = line.slice(6).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
              const evt = JSON.parse(payload);
              // Prefer the completed response event
              if (evt.type === 'response.completed' && evt.response) {
                lastResponseObj = evt.response;
              } else if (evt.type === 'response.done' && evt.response) {
                lastResponseObj = evt.response;
              } else if (evt.output_text !== undefined) {
                // Some endpoints return the final object directly
                lastResponseObj = evt;
              }
            } catch (_) {
              continue;
            }
          }
        }
        if (lastResponseObj) {
          resolve(lastResponseObj);
        } else {
          // Fallback: try to parse the entire raw as JSON (non-streaming response)
          try { resolve(JSON.parse(raw)); }
          catch { reject(new Error('LLM stream parse error: no valid response event found')); }
        }
      });
    });

    req.setTimeout(timeoutMs, () => req.destroy(new Error('LLM timeout')));
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function normalizeResponse(provider, model, result, latency_ms) {
  if (provider === 'anthropic') {
    // Anthropic: content is an array of blocks (text | tool_use)
    const contentBlocks = result.content || [];
    const textContent = contentBlocks.filter(b => b.type === 'text').map(b => b.text).join('');
    const toolCalls = contentBlocks
      .filter(b => b.type === 'tool_use')
      .map((block) => normalizeToolCall({ id: block.id, call_id: block.id, name: block.name, arguments: block.input || {} }));

    return {
      content: textContent,
      tool_calls: toolCalls.length > 0 ? toolCalls : null,
      stop_reason: result.stop_reason || null,
      provider,
      model: result.model || model,
      usage: {
        input_tokens: result.usage?.input_tokens || 0,
        output_tokens: result.usage?.output_tokens || 0,
      },
      cost: 0,
      latency_ms,
    };
  }

  // Responses API format (Codex): output is an array of items
  if (result.output && !result.choices) {
    const outputItems = Array.isArray(result.output) ? result.output : [];
    const textContent = outputItems
      .filter(o => o.type === 'message')
      .flatMap(o => (o.content || []).filter(c => c.type === 'output_text').map(c => c.text))
      .join('');
    const toolCalls = outputItems
      .filter((item) => item.type === 'function_call')
      .map((item) => normalizeToolCall({
        id: item.id || item.call_id,
        call_id: item.call_id || item.id,
        name: item.name,
        arguments: (() => {
          try {
            return JSON.parse(item.arguments || '{}');
          } catch (_) {
            return {};
          }
        })(),
      }));
    return {
      content: textContent || result.output_text || '',
      tool_calls: toolCalls.length > 0 ? toolCalls : null,
      stop_reason: result.status || 'completed',
      provider,
      model: result.model || model,
      usage: {
        input_tokens: result.usage?.input_tokens || 0,
        output_tokens: result.usage?.output_tokens || 0,
      },
      cost: 0,
      latency_ms,
    };
  }

  // OpenAI-compatible: tool_calls live on message
  const message = result.choices?.[0]?.message || {};
  const rawToolCalls = message.tool_calls || null;
  const toolCalls = rawToolCalls
    ? rawToolCalls.map((tc) => normalizeToolCall({
      id: tc.id,
      call_id: tc.id,
      name: tc.function?.name,
      arguments: (() => {
        try { return JSON.parse(tc.function?.arguments || '{}'); } catch { return {}; }
      })(),
    }))
    : null;

  return {
    content: message.content || '',
    tool_calls: toolCalls,
    stop_reason: result.choices?.[0]?.finish_reason || null,
    provider,
    model: result.model || model,
    usage: {
      input_tokens: result.usage?.prompt_tokens || 0,
      output_tokens: result.usage?.completion_tokens || 0,
    },
    cost: 0,
    latency_ms,
  };
}

async function logUsage(db, workspaceId, agent, llmResult) {
  console.log('[LLM_USAGE]', JSON.stringify({
    workspace_id: workspaceId || null,
    provider: llmResult.provider,
    model: llmResult.model,
    input_tokens: llmResult.usage?.input_tokens || 0,
    output_tokens: llmResult.usage?.output_tokens || 0,
    latency_ms: llmResult.latency_ms || 0,
  }));

  if (!db || !workspaceId) return;
  try {
    await db.query(
      `INSERT INTO tenant_vutler.llm_usage_logs
       (workspace_id, agent_id, provider, model, tokens_input, tokens_output, latency_ms, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
      [
        workspaceId,
        agent?.id || null,
        llmResult.provider,
        llmResult.model,
        llmResult.usage?.input_tokens || 0,
        llmResult.usage?.output_tokens || 0,
        llmResult.latency_ms || 0,
      ]
    );
  } catch (_) {
    try {
      await db.query(
        `INSERT INTO tenant_vutler.usage_logs
         (workspace_id, agent_id, provider, model, input_tokens, output_tokens, latency_ms, estimated_cost, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
        [
          workspaceId,
          agent?.id || null,
          llmResult.provider,
          llmResult.model,
          llmResult.usage?.input_tokens || 0,
          llmResult.usage?.output_tokens || 0,
          llmResult.latency_ms || 0,
          llmResult.cost || 0,
        ]
      );
    } catch (_) {
      return;
    }
  }
}

async function runOnce(attempt, messages, tools) {
  const start = Date.now();
  const req = buildRequest(attempt.provider, attempt.model, messages, attempt.system_prompt, {
    temperature: attempt.temperature,
    maxTokens: attempt.max_tokens,
    apiKey: attempt.api_key,
    baseURL: attempt.base_url,
    tools: tools || null,
  });
  const cfg = PROVIDERS[attempt.provider];
  const poster = (cfg && cfg.format === 'responses') ? httpPostStream : httpPost;
  const result = await poster(req.hostname, req.path, req.headers, req.body);
  return normalizeResponse(attempt.provider, attempt.model, result, Date.now() - start);
}

async function chat(agent, messages, db, opts = {}) {
  const MODEL_MAP = {
    // Legacy OpenAI models → current
    'gpt-4o': 'gpt-5.4',
    'gpt-4o-mini': 'gpt-5.4-mini',
    'gpt-4.1': 'gpt-5.4',
    'gpt-4.1-mini': 'gpt-5.4-mini',
    'gpt-5.2': 'gpt-5.4',
    'gpt-5.3': 'gpt-5.4',
    'o4-mini': 'o3',
    // Legacy Codex models → current
    'codex/gpt-4o': 'codex/gpt-5.4',
    'codex/gpt-4o-mini': 'codex/gpt-5.4-mini',
    'codex/gpt-4.1': 'codex/gpt-5.4',
    'codex/gpt-4.1-mini': 'codex/gpt-5.4-mini',
    // Legacy Anthropic models → current
    'claude-sonnet-4.5': 'claude-sonnet-4-20250514',
    'claude-3.5-sonnet': 'claude-sonnet-4-20250514',
    'claude-3-opus': 'claude-opus-4-20250514',
    'claude-3-5-haiku-latest': 'claude-haiku-4-5',
  };

  const workspaceId = agent?.workspace_id || agent?.workspaceId || null;
  const workspaceDefaultProvider = await resolveWorkspaceDefaultProvider(db, workspaceId);
  const requestedModel = agent?.model || null;
  const normalizedRequestedModel = requestedModel ? (MODEL_MAP[requestedModel] || requestedModel) : null;
  const inferredProvider = requestedModel ? detectProvider(normalizedRequestedModel) : null;
  const primaryProvider = agent?.provider || inferredProvider || workspaceDefaultProvider?.provider || 'anthropic';
  const primaryProviderId = (!agent?.provider && !inferredProvider && workspaceDefaultProvider?.provider === primaryProvider)
    ? workspaceDefaultProvider.id
    : null;
  const model = normalizedRequestedModel || PROVIDERS[primaryProvider]?.defaultModel || 'claude-sonnet-4-20250514';
  const fallbackProvider = agent?.fallback_provider || agent?.fallback?.provider || null;
  const fallbackModel = agent?.fallback_model || agent?.fallback?.model || null;

  // Determine memory scope — prefer snipara_instance_id, fall back to memory_scope,
  // then username (the Snipara scope used by sniparaClient), then null
  const memoryScope = agent?.snipara_instance_id || agent?.memory_scope
    || agent?.username
    || (agent?.name ? agent.name.toLowerCase().replace(/\s+/g, '-') : null)
    || null;

  const memoryMode = memoryScope
    ? await resolveMemoryMode({ db, workspaceId, agent })
    : { mode: 'disabled', read: false, write: false, inject: false, source: 'none' };
  const memoryBindings = memoryScope
    ? buildAgentMemoryBindings(agent || {
      snipara_instance_id: memoryScope,
      username: memoryScope,
      role: agent?.role,
    }, workspaceId)
    : null;
  const memoryGateway = memoryScope ? createSniparaGateway({ db, workspaceId }) : null;
  const memoryTools = [];
  if (memoryScope && memoryMode.write) memoryTools.push(MEMORY_REMEMBER_TOOL);
  if (memoryScope && memoryMode.read) memoryTools.push(MEMORY_RECALL_TOOL);

  const integrationAccess = await resolveAgentRuntimeIntegrations({
    workspaceId,
    agentId: agent?.id || null,
    agent,
    integrations: agent?.integrations,
    db,
  });
  const runtimeCapabilityAvailability = await resolveWorkspaceCapabilityAvailability({
    workspaceId,
    db,
  }).catch(() => ({
    planId: 'free',
    planLabel: 'Free',
    planFeatures: [],
    planProducts: [],
    planLimits: {},
    connectedProviders: [],
    providerStates: {},
    availableProviders: [],
    unavailableProviders: [],
  }));
  const emailProvisioning = await resolveAgentEmailProvisioning({
    workspaceId,
    agentId: agent?.id || null,
    agent,
    db,
  }).catch(() => ({
    provisioned: false,
    email: null,
    source: 'none',
  }));
  const executionOverlay = agent?.execution_overlay || {};
  const overlaySkillKeys = Array.isArray(executionOverlay.skillKeys) ? executionOverlay.skillKeys : [];
  const overlayProviders = Array.isArray(executionOverlay.integrationProviders) ? executionOverlay.integrationProviders : [];
  const overlayToolCapabilities = Array.isArray(executionOverlay.toolCapabilities) ? executionOverlay.toolCapabilities : [];
  const workspaceAvailableOverlayProviders = filterAvailableProviders(overlayProviders, runtimeCapabilityAvailability);
  const availableOverlayProviders = workspaceAvailableOverlayProviders.filter((provider) =>
    getUnavailableAgentProviders([provider], { agent, emailProvisioning }).length === 0
  );
  const unavailableOverlayProviders = [
    ...getUnavailableProviders(overlayProviders, runtimeCapabilityAvailability),
    ...getUnavailableAgentProviders(workspaceAvailableOverlayProviders, { agent, emailProvisioning }),
  ];
  const overlayDerivedSkillKeys = getSkillKeysForIntegrationProviders(availableOverlayProviders);

  // Inject tools from explicit capabilities plus agent-enabled integrations
  const rawAgentSkillKeys = normalizeCapabilities([
    ...(Array.isArray(agent?.skills) ? agent.skills : []),
    ...(Array.isArray(agent?.tools) ? agent.tools : []),
    ...(Array.isArray(agent?.capabilities) ? agent.capabilities : []),
    ...overlayToolCapabilities,
    ...overlaySkillKeys,
    ...overlayDerivedSkillKeys,
    ...(Array.isArray(integrationAccess?.derivedSkillKeys) ? integrationAccess.derivedSkillKeys : []),
  ]);
  const hasNexusTerminalAccess = isSandboxEligibleAgentType(agent?.type)
    && rawAgentSkillKeys.includes('code_execution');
  const agentSkillKeys = normalizeCapabilities(
    filterProvisionedSkillKeys(
      filterAvailableSkillKeys(rawAgentSkillKeys, runtimeCapabilityAvailability),
      { agent, emailProvisioning }
    )
  );
  const blockedSkillReasonByKey = new Map();
  for (const skillKey of rawAgentSkillKeys) {
    if (agentSkillKeys.includes(skillKey)) continue;
    const provisioningReason = getProvisioningReasonForSkill(skillKey, { agent, emailProvisioning });
    const provider = inferProviderForSkill(skillKey);
    const reason = provider
      ? runtimeCapabilityAvailability?.providerStates?.[provider]?.reason
      : null;
    blockedSkillReasonByKey.set(skillKey, provisioningReason || reason || 'Skill is not available for this workspace run.');
  }
  const allowedSkillToolNames = new Set(
    agentSkillKeys
      .filter((skillKey) => typeof skillKey === 'string' && skillKey.length > 0)
      .map((skillKey) => `skill_${skillKey}`)
  );
  const hasSocialSkill = agentSkillKeys.some((skillKey) =>
    typeof skillKey === 'string' && (skillKey.includes('social') || skillKey.includes('posting') || skillKey.includes('content_scheduling') || skillKey.includes('multi_platform'))
  );
  const hasCodeExecution = agentSkillKeys.includes('code_execution')
    && isProviderAvailable(runtimeCapabilityAvailability, 'sandbox');
  const hasLegacySocialAccess = !integrationAccess?.hasSocialAccessOverrides
    && hasSocialSkill
    && isProviderAvailable(runtimeCapabilityAvailability, 'social_media')
    && Array.isArray(integrationAccess?.connectedSocialPlatforms)
    && integrationAccess.connectedSocialPlatforms.length > 0;
  const hasOverlaySocialAccess = availableOverlayProviders.includes('social_media')
    && Array.isArray(integrationAccess?.connectedSocialPlatforms)
    && integrationAccess.connectedSocialPlatforms.length > 0;
  const hasSocialMediaAccess = isProviderAvailable(runtimeCapabilityAvailability, 'social_media')
    && (Boolean(integrationAccess?.hasSocialMediaAccess) || hasLegacySocialAccess || hasOverlaySocialAccess);
  const socialMediaTools = hasSocialMediaAccess ? [SOCIAL_MEDIA_TOOL] : [];
  let nexusTools = [];
  let nexusNodeId = null;
  if (workspaceId) {
    try {
      const { getNexusToolsForWorkspace, getOnlineNexusNode } = require('./nexusTools');
      const onlineNexusNode = await getOnlineNexusNode(workspaceId, db);
      nexusNodeId = onlineNexusNode?.id || null;
      if (nexusNodeId) {
        nexusTools = await getNexusToolsForWorkspace(workspaceId, db, {
          allowTerminalSessions: hasNexusTerminalAccess,
        });
      }
    } catch (_) {
      nexusTools = [];
      nexusNodeId = null;
    }
  }
  const allowedSocialPlatforms = hasSocialMediaAccess
    && Array.isArray(integrationAccess?.allowedSocialPlatforms) && integrationAccess.allowedSocialPlatforms.length > 0
    ? integrationAccess.allowedSocialPlatforms
    : (hasLegacySocialAccess ? integrationAccess.connectedSocialPlatforms : []);
  const allowedSocialAccountIds = hasSocialMediaAccess && Array.isArray(integrationAccess?.allowedSocialAccountIds)
    ? integrationAccess.allowedSocialAccountIds
    : [];
  const allowedSocialBrandIds = hasSocialMediaAccess && Array.isArray(integrationAccess?.allowedSocialBrandIds)
    ? integrationAccess.allowedSocialBrandIds
    : [];
  const effectiveDriveRoot =
    agent?.workspaceToolPolicy?.agentDriveRoot
    || agent?.workspaceToolPolicy?.driveRoot
    || '/projects/Vutler';
  const internalPlacementInstruction = agent?.workspaceToolPolicy?.placementInstruction || buildInternalPlacementInstruction();

  let effectiveSystemPrompt = agent?.system_prompt || '';
  if (memoryTools.length > 0) {
    const memoryInstruction = memoryMode.read
      ? '\n\nYou have access to persistent memory. Use remember() to store important information and recall() to search your memory before responding to questions about past context.'
      : '\n\nYou can store durable memory with remember() when the user shares important facts, preferences, or decisions.';
    effectiveSystemPrompt = effectiveSystemPrompt + memoryInstruction;
  }
  effectiveSystemPrompt += `\n\n${internalPlacementInstruction}`;
  if (hasSocialMediaAccess) {
    const platformHint = allowedSocialPlatforms.length > 0
      ? ` Limit social posting to these enabled platforms unless the user asks otherwise and you have access: ${allowedSocialPlatforms.join(', ')}.`
      : '';
    const accountHint = allowedSocialAccountIds.length > 0 || allowedSocialBrandIds.length > 0
      ? ' Posts are automatically restricted to the social accounts assigned to this agent.'
      : '';
    effectiveSystemPrompt += `\n\nYou can post to social media using vutler_post_social_media(). Use this tool when asked to publish, share, or schedule content on social media.${platformHint}${accountHint}`;
  }
  if (hasCodeExecution) {
    effectiveSystemPrompt += '\n\nYou can execute short JavaScript or Python snippets with run_code_in_sandbox(). Use it when a result depends on actual code execution, computation, parsing, or validation. Prefer concise snippets, avoid unnecessary execution, and never assume shell or host access.';
  }
  if (nexusTools.some((tool) => tool.name === 'open_terminal_session')) {
    effectiveSystemPrompt += '\n\nYou can manage persistent terminal sessions on the connected Nexus node. Open one session, keep the returned session_id, reuse it across commands in the same cwd, read incremental output with the cursor, snapshot when you need cwd/closed state, and close the session when finished.';
  }
  if (agentSkillKeys.some((skill) => typeof skill === 'string' && (skill.includes('drive') || skill.includes('calendar') || skill.includes('email') || skill.includes('task')))) {
    effectiveSystemPrompt += `\n\nWhen you create or update a file, task, calendar event, or email draft, include a short final line with a clickable Markdown link to the result. Prefer exact app links such as [Open in Drive](/drive?path=/path/to/folder&file=<fileId>) for files, [Open task](/tasks?task=<taskId>) for tasks, [Open in Calendar](/calendar?date=YYYY-MM-DD&event=<eventId>) for events, and [Open email draft](/email?folder=drafts&uid=<uid>) for drafts. The canonical Vutler Drive root is ${effectiveDriveRoot}. When the file destination is not explicitly specified, place the file into the best matching Generated/ folder under ${effectiveDriveRoot} instead of asking the user for a path. Ask for a path only if the destination is genuinely ambiguous. If a direct webViewLink or external URL is available, include it too.`;
  }
  if (unavailableOverlayProviders.length > 0) {
    const providerNames = unavailableOverlayProviders.map((entry) => entry.key).join(', ');
    effectiveSystemPrompt += `\n\nDo not assume access to unavailable workspace capabilities in this run. The following providers are unavailable: ${providerNames}.`;
  }

  const attempts = [
    { provider: primaryProvider, model, providerId: primaryProviderId },
    ...(fallbackProvider ? [{ provider: fallbackProvider, model: fallbackModel || PROVIDERS[fallbackProvider]?.defaultModel }] : []),
  ];

  let lastErr;
  const chatActionContext = opts.chatActionContext || null;
  for (const a of attempts) {
    const providerCfg = PROVIDERS[a.provider];
    if (!providerCfg) {
      lastErr = new Error(`Unknown provider: ${a.provider}`);
      continue;
    }

    let api_key, base_url;
    if (a.provider === 'vutler-trial') {
      // Trial tokens: enforce quota, rate limit, and gpt-4o-mini only
      const quota = await checkTrialQuota(db, workspaceId);
      if (!quota.allowed) {
        lastErr = new Error(quota.reason);
        continue;
      }
      const rateCheck = checkTrialRateLimit(workspaceId);
      if (!rateCheck.allowed) {
        lastErr = new Error(rateCheck.reason);
        continue;
      }
      const row = await resolveWorkspaceProvider(db, workspaceId, 'vutler-trial');
      api_key = row?.api_key || process.env.VUTLER_TRIAL_OPENAI_KEY;
      base_url = providerCfg.baseURL;
      a.model = 'gpt-4o-mini'; // force trial model
      if (!api_key) {
        lastErr = new Error('Trial not provisioned. No shared key available.');
        continue;
      }
    } else if (a.provider === 'codex') {
      // Codex uses OAuth token from workspace_integrations (ChatGPT OAuth)
      api_key = await resolveCodexOAuthToken(db, workspaceId);
      base_url = providerCfg.baseURL;
      if (!api_key) {
        lastErr = new Error('ChatGPT not connected. Connect via Integrations > ChatGPT.');
        continue;
      }
    } else {
      const row = await resolveWorkspaceProvider(db, workspaceId, a.provider, { id: a.providerId });
      api_key = row?.api_key || process.env[`${a.provider.toUpperCase()}_API_KEY`] || process.env.OPENAI_API_KEY;
      base_url = row?.base_url || providerCfg.baseURL;
    }

    // For codex provider, strip the codex/ prefix to get the real OpenAI model ID
    const resolvedModel = a.provider === 'codex'
      ? resolveCodexModel(a.model || providerCfg.defaultModel)
      : (a.model || providerCfg.defaultModel);

    const attempt = {
      ...agent,
      provider: a.provider,
      model: resolvedModel,
      api_key,
      base_url,
      system_prompt: effectiveSystemPrompt,
    };

    try {
      // ── Tool-call loop (max 3 iterations to prevent infinite loops) ──────────
      let currentMessages = [...messages];
      let llmResult;
      const resourceArtifacts = [];
      const MAX_TOOL_ITERATIONS = 3;

      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        // Inject skill tools when the agent has skills configured
        let skillTools = [];
        if (agentSkillKeys.length > 0) {
          try {
            const { getSkillRegistry } = require('./skills');
            skillTools = getSkillRegistry().getSkillTools(agentSkillKeys);
          } catch (_) { /* skills not available — skip */ }
        }
        const sandboxTools = hasCodeExecution ? [SANDBOX_CODE_EXECUTION_TOOL] : [];
        const allTools = [...memoryTools, ...socialMediaTools, ...sandboxTools, ...nexusTools, ...skillTools];
        llmResult = await runOnce(attempt, currentMessages, allTools.length > 0 ? allTools : null);

        // No tool calls → we have the final answer
        if (!llmResult.tool_calls || llmResult.tool_calls.length === 0) break;

        // Process each tool call
        let continueLoop = false;
        for (const toolCall of llmResult.tool_calls) {
          const agentName = agent?.name || agent?.username || 'agent';
          const args = toolCall.arguments || {};

          if (toolCall.name === 'remember' && memoryScope && memoryMode.write && memoryGateway && memoryBindings) {
            const actionRun = await startToolActionRun(db, chatActionContext, agent, 'remember', 'memory', args);
            try {
              const {
                orchestrationDecision,
                governance,
                actionResults,
                actionResult,
              } = await executeToolThroughOrchestration({
                toolName: toolCall.name,
                args,
                adapter: 'memory',
                agent,
                workspaceId,
                db,
                wsConnections: opts.wsConnections,
                chatActionContext,
                chatActionRunId: actionRun?.id || null,
                model: attempt.model,
                provider: attempt.provider,
                memoryBindings,
                memoryMode,
              });
              if (actionResult && actionResult.success === false) {
                throw new Error(actionResult.error || 'Memory remember failed.');
              }
              const orchestrationPayload = buildToolOrchestrationPayload(orchestrationDecision, governance, actionResults);
              const memoryResult = buildMemoryToolResult(toolCall.name, actionResult, orchestrationPayload);
              await finishToolActionRun(db, actionRun?.id, agent?.id || null, memoryResult, null);
              currentMessages = [
                ...currentMessages,
                { role: 'assistant', content: llmResult.content || '', tool_calls: llmResult.tool_calls },
                { role: 'tool', tool_call_id: getToolCallId(toolCall), name: 'remember', content: formatToolResultContent(memoryResult) },
              ];
            } catch (rememberErr) {
              await finishToolActionRun(db, actionRun?.id, agent?.id || null, null, rememberErr);
              currentMessages = [
                ...currentMessages,
                { role: 'assistant', content: llmResult.content || '', tool_calls: llmResult.tool_calls },
                { role: 'tool', tool_call_id: getToolCallId(toolCall), name: 'remember', content: `Error: ${rememberErr.message}` },
              ];
            }
            continueLoop = true;

          } else if (toolCall.name === 'recall' && memoryScope && memoryMode.read && memoryGateway && memoryBindings) {
            const actionRun = await startToolActionRun(db, chatActionContext, agent, 'recall', 'memory', args);
            try {
              const {
                orchestrationDecision,
                governance,
                actionResults,
                actionResult,
              } = await executeToolThroughOrchestration({
                toolName: toolCall.name,
                args,
                adapter: 'memory',
                agent,
                workspaceId,
                db,
                wsConnections: opts.wsConnections,
                chatActionContext,
                chatActionRunId: actionRun?.id || null,
                model: attempt.model,
                provider: attempt.provider,
                memoryBindings,
                memoryMode,
              });
              if (actionResult && actionResult.success === false) {
                throw new Error(actionResult.error || 'Memory recall failed.');
              }
              const orchestrationPayload = buildToolOrchestrationPayload(orchestrationDecision, governance, actionResults);
              const memoryResult = buildMemoryToolResult(toolCall.name, actionResult, orchestrationPayload);
              await finishToolActionRun(db, actionRun?.id, agent?.id || null, memoryResult, null);
              currentMessages = [
                ...currentMessages,
                { role: 'assistant', content: llmResult.content || '', tool_calls: llmResult.tool_calls },
                { role: 'tool', tool_call_id: getToolCallId(toolCall), name: 'recall', content: formatToolResultContent(memoryResult) },
              ];
            } catch (recallErr) {
              await finishToolActionRun(db, actionRun?.id, agent?.id || null, null, recallErr);
              currentMessages = [
                ...currentMessages,
                { role: 'assistant', content: llmResult.content || '', tool_calls: llmResult.tool_calls },
                { role: 'tool', tool_call_id: getToolCallId(toolCall), name: 'recall', content: `Error: ${recallErr.message}` },
              ];
            }
            continueLoop = true;

          } else if (toolCall.name === 'vutler_post_social_media' && hasSocialMediaAccess) {
            const actionRun = await startToolActionRun(db, chatActionContext, agent, 'vutler_post_social_media', 'social', args);
            try {
              const {
                orchestrationDecision,
                governance,
                actionResults,
                actionResult,
              } = await executeToolThroughOrchestration({
                toolName: toolCall.name,
                args,
                adapter: 'social',
                agent,
                workspaceId,
                db,
                wsConnections: opts.wsConnections,
                chatActionContext,
                chatActionRunId: actionRun?.id || null,
                model: attempt.model,
                provider: attempt.provider,
                allowedSocialPlatforms,
                allowedSocialAccountIds,
                allowedSocialBrandIds,
              });
              if (actionResult && actionResult.success === false) {
                throw new Error(actionResult.error || 'Social execution failed.');
              }
              const orchestrationPayload = buildToolOrchestrationPayload(orchestrationDecision, governance, actionResults);
              const socialResult = buildSocialToolResult(actionResult, orchestrationPayload);
              await finishToolActionRun(db, actionRun?.id, agent?.id || null, socialResult, null);
              await storeToolObservation(db, workspaceId, agent, 'vutler_post_social_media', args, socialResult);
              currentMessages = [
                ...currentMessages,
                { role: 'assistant', content: llmResult.content || '', tool_calls: llmResult.tool_calls },
                { role: 'tool', tool_call_id: getToolCallId(toolCall), name: 'vutler_post_social_media', content: formatToolResultContent(socialResult) },
              ];
            } catch (socialErr) {
              await finishToolActionRun(db, actionRun?.id, agent?.id || null, null, socialErr);
              currentMessages = [
                ...currentMessages,
                { role: 'assistant', content: llmResult.content || '', tool_calls: llmResult.tool_calls },
                { role: 'tool', tool_call_id: getToolCallId(toolCall), name: 'vutler_post_social_media', content: `Error: ${socialErr.message}` },
              ];
            }
            continueLoop = true;

          } else if (toolCall.name === 'run_code_in_sandbox' && hasCodeExecution) {
            const actionRun = await startToolActionRun(db, chatActionContext, agent, 'run_code_in_sandbox', 'sandbox', args);
            try {
              const {
                orchestrationDecision,
                governance,
                actionResults,
                actionResult,
              } = await executeToolThroughOrchestration({
                toolName: toolCall.name,
                args,
                adapter: 'sandbox',
                agent,
                workspaceId,
                db,
                wsConnections: opts.wsConnections,
                chatActionContext,
                chatActionRunId: actionRun?.id || null,
                model: attempt.model,
                provider: attempt.provider,
              });
              if (actionResult && actionResult.success === false) {
                throw new Error(actionResult.error || 'Sandbox execution failed.');
              }
              const sandboxToolPayload = actionResult?.status === 'completed'
                ? buildSandboxToolPayload(actionResult.output_json || {})
                : {
                  status: actionResult?.status || 'awaiting_approval',
                  language: governance.decisionPayload.actions?.[0]?.params?.language || null,
                  executor: governance.decisionPayload.actions?.[0]?.executor || null,
                  requires_approval: actionResult?.status === 'awaiting_approval',
                  timeout_ms: governance.decisionPayload.actions?.[0]?.timeout_ms ?? null,
                  reason: governance.reason || null,
                };
              const orchestrationPayload = buildToolOrchestrationPayload(orchestrationDecision, governance, actionResults);
              const sandboxResult = {
                success: true,
                data: sandboxToolPayload,
                persisted_output: {
                  ...sandboxToolPayload,
                  orchestration: orchestrationPayload,
                },
                orchestration: orchestrationPayload,
              };

              await finishToolActionRun(db, actionRun?.id, agent?.id || null, sandboxResult, null);
              await storeToolObservation(db, workspaceId, agent, 'run_code_in_sandbox', args, sandboxResult);
              currentMessages = [
                ...currentMessages,
                { role: 'assistant', content: llmResult.content || '', tool_calls: llmResult.tool_calls },
                { role: 'tool', tool_call_id: getToolCallId(toolCall), name: 'run_code_in_sandbox', content: formatToolResultContent(sandboxResult) },
              ];
            } catch (sandboxErr) {
              await finishToolActionRun(db, actionRun?.id, agent?.id || null, null, sandboxErr);
              currentMessages = [
                ...currentMessages,
                { role: 'assistant', content: llmResult.content || '', tool_calls: llmResult.tool_calls },
                { role: 'tool', tool_call_id: getToolCallId(toolCall), name: 'run_code_in_sandbox', content: `Error: ${sandboxErr.message}` },
              ];
            }
            continueLoop = true;

          } else if (toolCall.name && toolCall.name.startsWith('skill_')) {
            const skillKey = toolCall.name.slice('skill_'.length);
            if (!allowedSkillToolNames.has(toolCall.name)) {
              const deniedReason = blockedSkillReasonByKey.get(skillKey) || 'Skill is not available for this workspace run.';
              const actionRun = await startToolActionRun(db, chatActionContext, agent, skillKey, 'skill', args);
              await finishToolActionRun(db, actionRun?.id, agent?.id || null, null, new Error(deniedReason));
              currentMessages = [
                ...currentMessages,
                { role: 'assistant', content: llmResult.content || '', tool_calls: llmResult.tool_calls },
                { role: 'tool', tool_call_id: getToolCallId(toolCall), name: toolCall.name, content: `Error: ${deniedReason}` },
              ];
              continueLoop = true;
              continue;
            }
            console.log(`[Skills] Agent ${agentName} calling skill: ${skillKey}(${JSON.stringify(args).slice(0, 100)})`);
            const actionRun = await startToolActionRun(db, chatActionContext, agent, skillKey, 'skill', args);
            try {
              const {
                orchestrationDecision,
                governance,
                actionResults,
                actionResult,
              } = await executeToolThroughOrchestration({
                toolName: toolCall.name,
                args,
                adapter: 'skill',
                agent,
                workspaceId,
                db,
                wsConnections: opts.wsConnections,
                chatActionContext,
                chatActionRunId: actionRun?.id || null,
                model: attempt.model,
                provider: attempt.provider,
              });
              if (actionResult && actionResult.success === false) {
                throw new Error(actionResult.error || 'Skill execution failed.');
              }
              const orchestrationPayload = buildToolOrchestrationPayload(orchestrationDecision, governance, actionResults);
              const skillResult = buildOrchestratedToolResult(actionResult, orchestrationPayload);

              await finishToolActionRun(db, actionRun?.id, agent?.id || null, skillResult, null);
              await storeToolObservation(db, workspaceId, agent, toolCall.name, args, skillResult);
              resourceArtifacts.push(...extractResourceArtifacts(toolCall.name, skillResult, args));

              currentMessages = [
                ...currentMessages,
                { role: 'assistant', content: llmResult.content || '', tool_calls: llmResult.tool_calls },
                { role: 'tool', tool_call_id: getToolCallId(toolCall), name: toolCall.name, content: formatToolResultContent(skillResult) },
              ];
            } catch (skillErr) {
              await finishToolActionRun(db, actionRun?.id, agent?.id || null, null, skillErr);
              currentMessages = [
                ...currentMessages,
                { role: 'assistant', content: llmResult.content || '', tool_calls: llmResult.tool_calls },
                { role: 'tool', tool_call_id: getToolCallId(toolCall), name: toolCall.name, content: `Error: ${skillErr.message}` },
              ];
            }
            continueLoop = true;

          // ── Nexus tool execution (local node bridge) ──────────────────
          } else if (nexusNodeId) {
            const { NEXUS_TOOL_NAMES } = require('./nexusTools');
            if (NEXUS_TOOL_NAMES.has(toolCall.name)) {
              const agentName = agent?.name || agent?.username || 'agent';
              console.log(`[Nexus] Agent ${agentName} calling tool: ${toolCall.name}(${JSON.stringify(args).slice(0, 100)})`);
              const actionRun = await startToolActionRun(db, chatActionContext, agent, toolCall.name, 'nexus', args);
              try {
                const {
                  orchestrationDecision,
                  governance,
                  actionResults,
                  actionResult,
                } = await executeToolThroughOrchestration({
                  toolName: toolCall.name,
                  args,
                  adapter: 'nexus',
                  agent,
                  workspaceId,
                  db,
                  wsConnections: opts.wsConnections,
                  chatActionContext,
                  chatActionRunId: actionRun?.id || null,
                  model: attempt.model,
                  provider: attempt.provider,
                  nexusNodeId,
                });
                if (actionResult && actionResult.success === false) {
                  throw new Error(actionResult.error || 'Nexus execution failed.');
                }
                const orchestrationPayload = buildToolOrchestrationPayload(orchestrationDecision, governance, actionResults);
                const toolResult = buildOrchestratedToolResult(actionResult, orchestrationPayload);
                const content = formatToolResultContent(toolResult);
                await finishToolActionRun(db, actionRun?.id, agent?.id || null, toolResult, null);
                await storeToolObservation(db, workspaceId, agent, toolCall.name, args, toolResult);
                currentMessages = [
                  ...currentMessages,
                  { role: 'assistant', content: llmResult.content || '', tool_calls: llmResult.tool_calls },
                  { role: 'tool', tool_call_id: getToolCallId(toolCall), name: toolCall.name, content },
                ];
              } catch (nexusErr) {
                await finishToolActionRun(db, actionRun?.id, agent?.id || null, null, nexusErr);
                currentMessages = [
                  ...currentMessages,
                  { role: 'assistant', content: llmResult.content || '', tool_calls: llmResult.tool_calls },
                  { role: 'tool', tool_call_id: getToolCallId(toolCall), name: toolCall.name, content: `Error: ${nexusErr.message}` },
                ];
              }
              continueLoop = true;
            }
          }
        }

        if (!continueLoop) break;
      }

      await logUsage(db, workspaceId, agent, llmResult);

      const enriched = appendResourceArtifacts(llmResult.content || '', resourceArtifacts);
      if (enriched.content !== (llmResult.content || '')) {
        llmResult = { ...llmResult, content: enriched.content };
      }
      llmResult = {
        ...llmResult,
        resource_artifacts: enriched.artifacts,
      };

      // Debit trial tokens if using the shared trial provider
      if (a.provider === 'vutler-trial' && llmResult.usage) {
        const totalTokens = (llmResult.usage.input_tokens || 0) + (llmResult.usage.output_tokens || 0);
        if (totalTokens > 0) await debitTrialTokens(db, workspaceId, totalTokens);
      }

      return llmResult;
    } catch (err) {
      lastErr = err;
      console.warn(`[LLM Router] attempt failed (${a.provider}/${a.model}):`, err.message);
    }
  }

  throw lastErr || new Error('No provider attempt available');
}

async function testProviderConnection({ provider, model, apiKey, baseURL }) {
  const req = buildRequest(provider, model, [{ role: 'user', content: 'Hello' }], '', {
    apiKey,
    baseURL,
    temperature: 0,
    maxTokens: 16,
  });
  await httpPost(req.hostname, req.path, req.headers, req.body, 30000);
  return { ok: true };
}

module.exports = { chat, detectProvider, PROVIDERS, testProviderConnection };
