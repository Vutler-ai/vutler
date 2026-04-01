'use strict';

const {
  ACTION_KEYS,
  APPROVAL_MODES,
  EXECUTION_DECISIONS,
  buildOrchestrationDecision,
  buildGovernedExecutionPlan,
  uniqueStrings,
} = require('./types');

const MAX_SANDBOX_SYNC_TIMEOUT_MS = 15_000;
const MAX_SANDBOX_SYNC_CODE_CHARS = 8_000;
const RISK_ORDER = {
  low: 0,
  medium: 1,
  high: 2,
};

function normalizeToolCapabilities(agent = {}) {
  const agentCapabilities = Array.isArray(agent.capabilities) ? agent.capabilities : [];
  const overlayCapabilities = Array.isArray(agent.execution_overlay?.toolCapabilities)
    ? agent.execution_overlay.toolCapabilities
    : [];

  return uniqueStrings([
    ...agentCapabilities,
    ...overlayCapabilities,
  ]);
}

function buildDeniedDecision(reason) {
  return {
    allowed: false,
    decision: EXECUTION_DECISIONS.DENIED,
    reason,
    plan: null,
    risk_level: 'high',
  };
}

function buildGovernedDecisionPayload(decision, actions, policyBundle, executionMode = EXECUTION_DECISIONS.SYNC) {
  return buildOrchestrationDecision({
    workspaceId: decision.workspace_id,
    selectedAgentId: decision.selected_agent_id,
    selectedAgentReason: decision.selected_agent_reason,
    allowedTools: decision.allowed_tools,
    allowedSkills: decision.allowed_skills,
    actions,
    finalResponseStrategy: decision.final_response_strategy,
    metadata: {
      ...(decision.metadata || {}),
      policy_bundle: policyBundle,
      execution_mode: executionMode,
    },
  });
}

function rankRiskLevel(level) {
  const normalized = String(level || 'low').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(RISK_ORDER, normalized) ? RISK_ORDER[normalized] : RISK_ORDER.medium;
}

function mergeRiskLevel(levels = []) {
  let selected = 'low';
  for (const level of levels) {
    if (rankRiskLevel(level) > rankRiskLevel(selected)) selected = level;
  }
  return selected;
}

function normalizePlatformValue(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'x' ? 'twitter' : normalized;
}

function buildAllowedDecision({
  governedActions,
  decision,
  reason,
  actionDecision = EXECUTION_DECISIONS.SYNC,
  policyBundle,
} = {}) {
  const actions = Array.isArray(governedActions) ? governedActions : [];
  const riskLevel = mergeRiskLevel(actions.map((action) => action?.risk_level || 'low'));
  return {
    allowed: true,
    decision: actionDecision,
    reason,
    risk_level: riskLevel,
    actions,
    decisionPayload: buildGovernedDecisionPayload(decision, actions, policyBundle, actionDecision),
  };
}

function governSandboxIntent(intent, context = {}) {
  const toolCapabilities = normalizeToolCapabilities(context.agent);
  if (!toolCapabilities.includes('code_execution')) {
    return buildDeniedDecision('Sandbox execution is not allowed for this run.');
  }

  if (!intent.workspaceId || !intent.agentId) {
    return buildDeniedDecision('Sandbox execution requires persisted workspace and agent context.');
  }

  if (!intent.input?.language) {
    return buildDeniedDecision('Sandbox language must be javascript or python.');
  }

  if (!String(intent.input?.code || '').trim()) {
    return buildDeniedDecision('Sandbox code is required.');
  }

  const requiresApproval = intent.input.timeoutMs > MAX_SANDBOX_SYNC_TIMEOUT_MS
    || String(intent.input.code).length > MAX_SANDBOX_SYNC_CODE_CHARS;
  const decision = requiresApproval
    ? EXECUTION_DECISIONS.APPROVAL_REQUIRED
    : EXECUTION_DECISIONS.SYNC;
  const riskLevel = requiresApproval ? 'high' : 'medium';
  const reason = requiresApproval
    ? 'Sandbox execution exceeds the synchronous runtime policy and requires approval.'
    : 'Sandbox execution allowed.';

  return {
    allowed: true,
    decision,
    reason,
    risk_level: riskLevel,
    plan: buildGovernedExecutionPlan({
      intent,
      mode: decision,
      riskLevel,
      policy: {
        source: 'orchestration_policy',
        max_sync_timeout_ms: MAX_SANDBOX_SYNC_TIMEOUT_MS,
        max_sync_code_chars: MAX_SANDBOX_SYNC_CODE_CHARS,
      },
    }),
  };
}

function governExecutionIntent(intent, context = {}) {
  if (!intent || !intent.actionKey) {
    return buildDeniedDecision('Missing execution intent.');
  }

  switch (intent.actionKey) {
    case ACTION_KEYS.SANDBOX_CODE_EXEC:
      return governSandboxIntent(intent, context);
    default:
      return buildDeniedDecision(`Unsupported execution intent: ${intent.actionKey}`);
  }
}

function governSandboxAction(action = {}, decision = {}, context = {}) {
  const toolCapabilities = normalizeToolCapabilities(context.agent);
  if (!toolCapabilities.includes('code_execution')) {
    return buildDeniedDecision('Sandbox execution is not allowed for this run.');
  }

  const language = String(action.params?.language || '').trim().toLowerCase();
  if (!language || !['javascript', 'python'].includes(language)) {
    return buildDeniedDecision('Sandbox language must be javascript or python.');
  }

  const code = typeof action.params?.code === 'string' ? action.params.code : '';
  if (!code.trim()) {
    return buildDeniedDecision('Sandbox code is required.');
  }

  const timeoutMs = Math.min(
    Math.max(parseInt(action.timeout_ms, 10) || MAX_SANDBOX_SYNC_TIMEOUT_MS, 1_000),
    30_000
  );
  const requiresApproval = timeoutMs > MAX_SANDBOX_SYNC_TIMEOUT_MS || code.length > MAX_SANDBOX_SYNC_CODE_CHARS;
  const riskLevel = requiresApproval ? 'high' : 'medium';
  const governedAction = {
    ...action,
    timeout_ms: timeoutMs,
    approval: requiresApproval ? APPROVAL_MODES.REQUIRED : APPROVAL_MODES.NONE,
    risk_level: riskLevel,
  };

  return {
    allowed: true,
    decision: requiresApproval ? EXECUTION_DECISIONS.APPROVAL_REQUIRED : EXECUTION_DECISIONS.SYNC,
    reason: requiresApproval
      ? 'Sandbox execution exceeds the synchronous runtime policy and requires approval.'
      : 'Sandbox execution allowed.',
    risk_level: riskLevel,
    action: governedAction,
    decisionPayload: buildGovernedDecisionPayload(decision, [governedAction], 'sandbox-default-v1'),
  };
}

function governSkillAction(action = {}, decision = {}, context = {}) {
  const skillKey = String(action.params?.skill_key || '').trim();
  if (!skillKey) {
    return buildDeniedDecision('Skill execution requires a skill key.');
  }

  if (!Array.isArray(decision.allowed_skills) || !decision.allowed_skills.includes(skillKey)) {
    return buildDeniedDecision('Skill execution is not allowed for this run.');
  }

  const selectedAgentId = String(decision.selected_agent_id || '');
  const allowedAgentIds = uniqueStrings(action.allowed_agent_ids || []);
  if (allowedAgentIds.length > 0 && selectedAgentId && !allowedAgentIds.includes(selectedAgentId)) {
    return buildDeniedDecision('Skill execution is not allowed for the selected agent.');
  }

  const governedAction = {
    ...action,
    mode: EXECUTION_DECISIONS.SYNC,
    approval: APPROVAL_MODES.NONE,
    risk_level: action.risk_level || 'low',
  };

  return {
    allowed: true,
    decision: EXECUTION_DECISIONS.SYNC,
    reason: 'Skill execution allowed.',
    risk_level: governedAction.risk_level,
    action: governedAction,
    decisionPayload: buildGovernedDecisionPayload(decision, [governedAction], 'skill-default-v1'),
  };
}

function governNexusAction(action = {}, decision = {}, context = {}) {
  const toolName = String(action.params?.tool_name || '').trim();
  if (!toolName) {
    return buildDeniedDecision('Nexus execution requires a tool name.');
  }

  if (!Array.isArray(decision.allowed_tools) || !decision.allowed_tools.includes(toolName)) {
    return buildDeniedDecision('Nexus tool execution is not allowed for this run.');
  }

  if (!context.nexusNodeId) {
    return buildDeniedDecision('Nexus execution requires an online node.');
  }

  const selectedAgentId = String(decision.selected_agent_id || '');
  const allowedAgentIds = uniqueStrings(action.allowed_agent_ids || []);
  if (allowedAgentIds.length > 0 && selectedAgentId && !allowedAgentIds.includes(selectedAgentId)) {
    return buildDeniedDecision('Nexus execution is not allowed for the selected agent.');
  }

  const governedAction = {
    ...action,
    mode: EXECUTION_DECISIONS.SYNC,
    approval: APPROVAL_MODES.NONE,
    risk_level: action.risk_level || 'medium',
  };

  return {
    allowed: true,
    decision: EXECUTION_DECISIONS.SYNC,
    reason: 'Nexus execution allowed.',
    risk_level: governedAction.risk_level,
    action: governedAction,
    decisionPayload: buildGovernedDecisionPayload(decision, [governedAction], 'nexus-default-v1'),
  };
}

function governSocialAction(action = {}, decision = {}, context = {}) {
  const caption = typeof action.params?.caption === 'string' ? action.params.caption.trim() : '';
  if (!caption) {
    return buildDeniedDecision('Social execution requires a caption.');
  }

  if (!Array.isArray(decision.allowed_tools) || !decision.allowed_tools.includes('vutler_post_social_media')) {
    return buildDeniedDecision('Social execution is not allowed for this run.');
  }

  const selectedAgentId = String(decision.selected_agent_id || '');
  const allowedAgentIds = uniqueStrings(action.allowed_agent_ids || []);
  if (allowedAgentIds.length > 0 && selectedAgentId && !allowedAgentIds.includes(selectedAgentId)) {
    return buildDeniedDecision('Social execution is not allowed for the selected agent.');
  }

  const requestedPlatforms = uniqueStrings(action.params?.platforms || []).map(normalizePlatformValue);
  const allowedPlatforms = uniqueStrings(action.params?.allowed_platforms || []).map(normalizePlatformValue);
  if (allowedPlatforms.length > 0) {
    const blockedPlatforms = requestedPlatforms.filter((platform) => !allowedPlatforms.includes(platform));
    if (blockedPlatforms.length > 0) {
      return buildDeniedDecision(`Social execution is not allowed for: ${blockedPlatforms.join(', ')}`);
    }
  }

  const governedAction = {
    ...action,
    mode: EXECUTION_DECISIONS.SYNC,
    approval: APPROVAL_MODES.NONE,
    risk_level: action.risk_level || 'medium',
  };

  return {
    allowed: true,
    decision: EXECUTION_DECISIONS.SYNC,
    reason: 'Social execution allowed.',
    risk_level: governedAction.risk_level,
    action: governedAction,
    decisionPayload: buildGovernedDecisionPayload(decision, [governedAction], 'social-default-v1'),
  };
}

function normalizeMemoryBindings(bindings = null) {
  if (!bindings || typeof bindings !== 'object') return null;
  return {
    scope: bindings.scope || null,
    category: bindings.category || null,
    agent_id: bindings.agent_id || null,
  };
}

function buildMemoryDeniedDecision(operation) {
  return buildDeniedDecision(`Memory ${operation} is not allowed for this run.`);
}

function governMemoryAction(action = {}, decision = {}, context = {}) {
  const operation = String(action.params?.operation || '').trim().toLowerCase();
  if (!operation || !['remember', 'recall'].includes(operation)) {
    return buildDeniedDecision('Memory execution requires an operation.');
  }

  if (!Array.isArray(decision.allowed_tools) || !decision.allowed_tools.includes(operation)) {
    return buildMemoryDeniedDecision(operation);
  }

  const selectedAgentId = String(decision.selected_agent_id || '');
  const allowedAgentIds = uniqueStrings(action.allowed_agent_ids || []);
  if (allowedAgentIds.length > 0 && selectedAgentId && !allowedAgentIds.includes(selectedAgentId)) {
    return buildDeniedDecision('Memory execution is not allowed for the selected agent.');
  }

  const memoryMode = context.memoryMode || {};
  if (operation === 'remember' && !memoryMode.write) {
    return buildMemoryDeniedDecision('write');
  }
  if (operation === 'recall' && !memoryMode.read) {
    return buildMemoryDeniedDecision('read');
  }

  const bindings = normalizeMemoryBindings(action.params?.bindings);
  if (!bindings?.scope || !bindings?.category || !bindings?.agent_id) {
    return buildDeniedDecision('Memory execution requires persisted bindings.');
  }

  if (operation === 'remember') {
    const content = typeof action.params?.content === 'string' ? action.params.content.trim() : '';
    if (!content) {
      return buildDeniedDecision('Memory remember requires content.');
    }
  }

  if (operation === 'recall') {
    const query = typeof action.params?.query === 'string' ? action.params.query.trim() : '';
    if (!query) {
      return buildDeniedDecision('Memory recall requires a query.');
    }
  }

  const governedAction = {
    ...action,
    mode: EXECUTION_DECISIONS.SYNC,
    approval: APPROVAL_MODES.NONE,
    risk_level: action.risk_level || 'low',
  };

  return {
    allowed: true,
    decision: EXECUTION_DECISIONS.SYNC,
    reason: `Memory ${operation} allowed.`,
    risk_level: governedAction.risk_level,
    action: governedAction,
    decisionPayload: buildGovernedDecisionPayload(decision, [governedAction], 'memory-default-v1'),
  };
}

function buildAggregateDecision(decision, governedActions = []) {
  const actionModes = governedActions.map((action) => String(action?.mode || EXECUTION_DECISIONS.SYNC));
  const requiresApproval = governedActions.some((action) => action?.approval === APPROVAL_MODES.REQUIRED);
  const decisionMode = requiresApproval
    ? EXECUTION_DECISIONS.APPROVAL_REQUIRED
    : actionModes.includes(EXECUTION_DECISIONS.ASYNC)
      ? EXECUTION_DECISIONS.ASYNC
      : EXECUTION_DECISIONS.SYNC;

  const normalizedActions = governedActions.map((action) => {
    if (decisionMode !== EXECUTION_DECISIONS.SYNC) {
      return {
        ...action,
        mode: decisionMode,
        approval: decisionMode === EXECUTION_DECISIONS.APPROVAL_REQUIRED ? APPROVAL_MODES.REQUIRED : action.approval,
      };
    }
    return action;
  });

  const policyBundle = normalizedActions.length > 1
    ? 'multi-action-v1'
    : (() => {
      switch (normalizedActions[0]?.key) {
        case ACTION_KEYS.SANDBOX_CODE_EXEC:
          return 'sandbox-default-v1';
        case ACTION_KEYS.SKILL_EXEC:
          return 'skill-default-v1';
        case ACTION_KEYS.NEXUS_TOOL_EXEC:
          return 'nexus-default-v1';
        case ACTION_KEYS.SOCIAL_POST:
          return 'social-default-v1';
        case ACTION_KEYS.MEMORY_RECALL:
        case ACTION_KEYS.MEMORY_REMEMBER:
          return 'memory-default-v1';
        default:
          return 'orchestration-default-v1';
      }
    })();

  const reason = decisionMode === EXECUTION_DECISIONS.APPROVAL_REQUIRED
    ? 'The orchestration plan requires approval before execution.'
    : decisionMode === EXECUTION_DECISIONS.ASYNC
      ? 'The orchestration plan will execute asynchronously.'
      : normalizedActions.length > 1
        ? 'The orchestration plan is allowed.'
        : 'Tool execution allowed.';

  return buildAllowedDecision({
    governedActions: normalizedActions,
    decision,
    reason,
    actionDecision: decisionMode,
    policyBundle,
  });
}

function governOrchestrationDecision(decision, context = {}) {
  if (!decision || decision.version !== 'v1') {
    return buildDeniedDecision('Missing orchestration decision.');
  }

  if (!decision.workspace_id || !decision.selected_agent_id) {
    return buildDeniedDecision('Orchestration decision requires workspace and selected agent ids.');
  }

  if (!Array.isArray(decision.actions) || decision.actions.length === 0) {
    return buildDeniedDecision('Orchestration decision does not contain any action.');
  }

  const governedActions = [];
  for (const action of decision.actions) {
    let outcome;
    if (action.key === ACTION_KEYS.SANDBOX_CODE_EXEC) {
      if (!Array.isArray(decision.allowed_tools) || !decision.allowed_tools.includes('run_code_in_sandbox')) {
        return buildDeniedDecision('Sandbox tool call is not allowed for this run.');
      }
      outcome = governSandboxAction(action, decision, context);
    } else if (action.key === ACTION_KEYS.SKILL_EXEC) {
      outcome = governSkillAction(action, decision, context);
    } else if (action.key === ACTION_KEYS.NEXUS_TOOL_EXEC) {
      outcome = governNexusAction(action, decision, context);
    } else if (action.key === ACTION_KEYS.SOCIAL_POST) {
      outcome = governSocialAction(action, decision, context);
    } else if (action.key === ACTION_KEYS.MEMORY_REMEMBER || action.key === ACTION_KEYS.MEMORY_RECALL) {
      outcome = governMemoryAction(action, decision, context);
    } else {
      return buildDeniedDecision(`Unsupported orchestration action: ${action.key}`);
    }

    if (!outcome.allowed || !outcome.action) {
      return outcome;
    }

    governedActions.push(outcome.action);
  }

  return buildAggregateDecision(decision, governedActions);
}

module.exports = {
  MAX_SANDBOX_SYNC_TIMEOUT_MS,
  MAX_SANDBOX_SYNC_CODE_CHARS,
  governExecutionIntent,
  governOrchestrationDecision,
};
