'use strict';

const ACTION_KEYS = Object.freeze({
  SANDBOX_CODE_EXEC: 'sandbox_code_exec',
  SKILL_EXEC: 'skill_exec',
  NEXUS_TOOL_EXEC: 'nexus_tool_exec',
  SOCIAL_POST: 'social_post',
  MEMORY_REMEMBER: 'memory_remember',
  MEMORY_RECALL: 'memory_recall',
});

const ACTION_KINDS = Object.freeze({
  LLM_REPLY: 'llm_reply',
  SKILL: 'skill',
  TOOL: 'tool',
});

const EXECUTION_DECISIONS = Object.freeze({
  SYNC: 'sync',
  ASYNC: 'async',
  APPROVAL_REQUIRED: 'approval_required',
  DENIED: 'denied',
});

const APPROVAL_MODES = Object.freeze({
  NONE: 'none',
  REQUIRED: 'required',
});

const EXECUTOR_KEYS = Object.freeze({
  SANDBOX: 'sandbox-worker',
  SKILL: 'skill-executor',
  NEXUS: 'nexus-executor',
  SOCIAL: 'social-executor',
  MEMORY: 'memory-executor',
});

const FINAL_RESPONSE_STRATEGIES = Object.freeze({
  AGENT_DIRECT: 'agent_direct',
  TOOL_THEN_AGENT: 'tool_then_agent',
  ASYNC_ACK: 'async_ack',
});

function uniqueStrings(values = []) {
  return Array.from(new Set(
    values
      .filter((value) => value !== null && value !== undefined && value !== '')
      .map((value) => String(value))
  ));
}

function buildExecutionIntent({
  actionKey,
  executor,
  workspaceId = null,
  agentId = null,
  requestedAgentId = null,
  displayAgentId = null,
  toolName = null,
  capabilityRequirements = [],
  input = {},
  metadata = {},
} = {}) {
  return {
    actionKey: actionKey || null,
    executor: executor || null,
    workspaceId: workspaceId || null,
    agentId: agentId || null,
    requestedAgentId: requestedAgentId || null,
    displayAgentId: displayAgentId || null,
    toolName: toolName || null,
    capabilityRequirements: uniqueStrings(capabilityRequirements),
    input: input && typeof input === 'object' ? input : {},
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
  };
}

function buildOrchestrationTarget({
  workspaceId,
  conversationId = null,
  taskId = null,
  requestedAgentId = null,
} = {}) {
  return {
    workspace_id: workspaceId || null,
    conversation_id: conversationId || null,
    task_id: taskId || null,
    requested_agent_id: requestedAgentId || null,
  };
}

function buildOrchestratedAction({
  id,
  kind,
  key,
  executor,
  mode = EXECUTION_DECISIONS.SYNC,
  approval = APPROVAL_MODES.NONE,
  timeoutMs = undefined,
  params = undefined,
  allowedAgentIds = [],
  requiredCapabilities = [],
  riskLevel = 'medium',
} = {}) {
  return {
    id: id || null,
    kind: kind || ACTION_KINDS.TOOL,
    key: key || null,
    executor: executor || null,
    mode,
    approval,
    timeout_ms: timeoutMs,
    params: params && typeof params === 'object' ? params : undefined,
    allowed_agent_ids: uniqueStrings(allowedAgentIds),
    required_capabilities: uniqueStrings(requiredCapabilities),
    risk_level: riskLevel || 'medium',
  };
}

function buildOrchestrationDecision({
  workspaceId,
  selectedAgentId,
  selectedAgentReason,
  allowedTools = [],
  allowedSkills = [],
  actions = [],
  finalResponseStrategy = FINAL_RESPONSE_STRATEGIES.TOOL_THEN_AGENT,
  metadata = {},
} = {}) {
  return {
    version: 'v1',
    workspace_id: workspaceId || null,
    selected_agent_id: selectedAgentId || null,
    selected_agent_reason: selectedAgentReason || '',
    allowed_tools: uniqueStrings(allowedTools),
    allowed_skills: uniqueStrings(allowedSkills),
    actions: Array.isArray(actions) ? actions : [],
    final_response_strategy: finalResponseStrategy,
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
  };
}

function buildGovernedExecutionPlan({
  intent,
  mode,
  policy = null,
  riskLevel = null,
  metadata = {},
} = {}) {
  if (!intent || typeof intent !== 'object') {
    throw new Error('Governed execution plans require an execution intent.');
  }

  return {
    actionKey: intent.actionKey || null,
    executor: intent.executor || null,
    mode: mode || null,
    workspaceId: intent.workspaceId || null,
    agentId: intent.agentId || null,
    requestedAgentId: intent.requestedAgentId || null,
    displayAgentId: intent.displayAgentId || null,
    toolName: intent.toolName || null,
    capabilityRequirements: uniqueStrings(intent.capabilityRequirements),
    input: intent.input && typeof intent.input === 'object' ? intent.input : {},
    policy: policy && typeof policy === 'object' ? policy : null,
    risk_level: riskLevel || null,
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
  };
}

function buildActionExecutionResult({
  actionId,
  success,
  status,
  outputText = undefined,
  outputJson = null,
  error = null,
  artifacts = [],
  usage = undefined,
} = {}) {
  const result = {
    action_id: actionId || null,
    success: Boolean(success),
    status: status || 'completed',
    output_json: outputJson && typeof outputJson === 'object' ? outputJson : null,
    error: error ? String(error) : null,
    artifacts: Array.isArray(artifacts) ? artifacts : [],
  };

  if (outputText) result.output_text = String(outputText);
  if (usage && typeof usage === 'object' && Object.keys(usage).length > 0) result.usage = usage;

  return result;
}

module.exports = {
  ACTION_KEYS,
  ACTION_KINDS,
  APPROVAL_MODES,
  EXECUTION_DECISIONS,
  EXECUTOR_KEYS,
  FINAL_RESPONSE_STRATEGIES,
  buildActionExecutionResult,
  buildExecutionIntent,
  buildOrchestratedAction,
  buildOrchestrationDecision,
  buildOrchestrationTarget,
  buildGovernedExecutionPlan,
  uniqueStrings,
};
