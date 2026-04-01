'use strict';

const {
  ACTION_KEYS,
  ACTION_KINDS,
  APPROVAL_MODES,
  EXECUTOR_KEYS,
  buildExecutionIntent,
  buildOrchestratedAction,
  buildOrchestrationDecision,
  buildOrchestrationTarget,
  FINAL_RESPONSE_STRATEGIES,
} = require('./types');

const MAX_SANDBOX_TIMEOUT_MS = 30_000;
const DEFAULT_SANDBOX_TIMEOUT_MS = 15_000;

function buildDecisionMetadata(context = {}, extras = {}) {
  const { policyBundle, ...rest } = extras;
  return {
    trace_id: context.chatActionContext?.messageId || null,
    policy_bundle: policyBundle || null,
    target: buildOrchestrationTarget({
      workspaceId: context.workspaceId || null,
      conversationId: context.chatActionContext?.channelId || null,
      taskId: context.chatActionContext?.taskId || null,
      requestedAgentId: context.chatActionContext?.requestedAgentId || context.agent?.id || null,
    }),
    requested_agent_id: context.chatActionContext?.requestedAgentId || context.agent?.id || null,
    display_agent_id: context.chatActionContext?.displayAgentId || context.agent?.id || null,
    ...rest,
  };
}

function normalizeSandboxLanguage(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'javascript' || normalized === 'js' || normalized === 'node') return 'javascript';
  if (normalized === 'python' || normalized === 'python3' || normalized === 'py') return 'python';
  return null;
}

function clampSandboxTimeout(timeoutMs) {
  return Math.min(
    Math.max(parseInt(timeoutMs, 10) || DEFAULT_SANDBOX_TIMEOUT_MS, 1_000),
    MAX_SANDBOX_TIMEOUT_MS
  );
}

function buildSandboxExecutionIntent(args = {}, context = {}) {
  return buildExecutionIntent({
    actionKey: ACTION_KEYS.SANDBOX_CODE_EXEC,
    executor: EXECUTOR_KEYS.SANDBOX,
    workspaceId: context.workspaceId || null,
    agentId: context.agent?.id || null,
    requestedAgentId: context.chatActionContext?.requestedAgentId || context.agent?.id || null,
    displayAgentId: context.chatActionContext?.displayAgentId || context.agent?.id || null,
    toolName: 'run_code_in_sandbox',
    capabilityRequirements: ['code_execution'],
    input: {
      language: normalizeSandboxLanguage(args.language),
      code: typeof args.code === 'string' ? args.code : '',
      timeoutMs: clampSandboxTimeout(args.timeout_ms),
    },
    metadata: {
      rawArguments: args,
    },
  });
}

function buildSandboxOrchestrationDecision(args = {}, context = {}) {
  const intent = buildSandboxExecutionIntent(args, context);
  const action = buildOrchestratedAction({
    id: 'act_sandbox_1',
    kind: ACTION_KINDS.TOOL,
    key: ACTION_KEYS.SANDBOX_CODE_EXEC,
    executor: EXECUTOR_KEYS.SANDBOX,
    mode: 'sync',
    approval: APPROVAL_MODES.NONE,
    timeoutMs: intent.input?.timeoutMs,
    params: {
      language: intent.input?.language || null,
      code: intent.input?.code || '',
    },
    allowedAgentIds: [context.agent?.id || null],
    requiredCapabilities: intent.capabilityRequirements,
    riskLevel: 'medium',
  });

  return buildOrchestrationDecision({
    workspaceId: context.workspaceId || null,
    selectedAgentId: context.agent?.id || null,
    selectedAgentReason: 'Current execution agent is authorized to fulfill this sandbox tool call.',
    allowedTools: ['run_code_in_sandbox'],
    allowedSkills: [],
    actions: [action],
    finalResponseStrategy: FINAL_RESPONSE_STRATEGIES.TOOL_THEN_AGENT,
    metadata: buildDecisionMetadata(context, {
      policyBundle: 'sandbox-default-v1',
    }),
  });
}

function extractSkillKey(toolName) {
  const normalized = String(toolName || '').trim();
  if (!normalized.startsWith('skill_')) return null;
  const skillKey = normalized.slice('skill_'.length).trim();
  return skillKey || null;
}

function buildSkillExecutionIntent(toolName, args = {}, context = {}) {
  const skillKey = extractSkillKey(toolName);
  return buildExecutionIntent({
    actionKey: ACTION_KEYS.SKILL_EXEC,
    executor: EXECUTOR_KEYS.SKILL,
    workspaceId: context.workspaceId || null,
    agentId: context.agent?.id || null,
    requestedAgentId: context.chatActionContext?.requestedAgentId || context.agent?.id || null,
    displayAgentId: context.chatActionContext?.displayAgentId || context.agent?.id || null,
    toolName,
    capabilityRequirements: skillKey ? [skillKey] : [],
    input: {
      skillKey,
      params: args && typeof args === 'object' ? args : {},
    },
    metadata: {
      rawArguments: args,
    },
  });
}

function buildSkillOrchestrationDecision(toolName, args = {}, context = {}) {
  const intent = buildSkillExecutionIntent(toolName, args, context);
  const skillKey = intent.input?.skillKey || null;
  const action = buildOrchestratedAction({
    id: 'act_skill_1',
    kind: ACTION_KINDS.SKILL,
    key: ACTION_KEYS.SKILL_EXEC,
    executor: EXECUTOR_KEYS.SKILL,
    mode: 'sync',
    approval: APPROVAL_MODES.NONE,
    params: {
      skill_key: skillKey,
      params: intent.input?.params || {},
    },
    allowedAgentIds: [context.agent?.id || null],
    requiredCapabilities: intent.capabilityRequirements,
    riskLevel: 'low',
  });

  return buildOrchestrationDecision({
    workspaceId: context.workspaceId || null,
    selectedAgentId: context.agent?.id || null,
    selectedAgentReason: 'Current execution agent is authorized to execute this skill.',
    allowedTools: [],
    allowedSkills: skillKey ? [skillKey] : [],
    actions: [action],
    finalResponseStrategy: FINAL_RESPONSE_STRATEGIES.TOOL_THEN_AGENT,
    metadata: buildDecisionMetadata(context, {
      policyBundle: 'skill-default-v1',
      tool_name: toolName || null,
    }),
  });
}

function buildNexusExecutionIntent(toolName, args = {}, context = {}) {
  return buildExecutionIntent({
    actionKey: ACTION_KEYS.NEXUS_TOOL_EXEC,
    executor: EXECUTOR_KEYS.NEXUS,
    workspaceId: context.workspaceId || null,
    agentId: context.agent?.id || null,
    requestedAgentId: context.chatActionContext?.requestedAgentId || context.agent?.id || null,
    displayAgentId: context.chatActionContext?.displayAgentId || context.agent?.id || null,
    toolName,
    capabilityRequirements: [],
    input: {
      toolName: toolName || null,
      params: args && typeof args === 'object' ? args : {},
    },
    metadata: {
      rawArguments: args,
      nexusNodeId: context.nexusNodeId || null,
    },
  });
}

function buildNexusOrchestrationDecision(toolName, args = {}, context = {}) {
  const intent = buildNexusExecutionIntent(toolName, args, context);
  const action = buildOrchestratedAction({
    id: 'act_nexus_1',
    kind: ACTION_KINDS.TOOL,
    key: ACTION_KEYS.NEXUS_TOOL_EXEC,
    executor: EXECUTOR_KEYS.NEXUS,
    mode: 'sync',
    approval: APPROVAL_MODES.NONE,
    params: {
      tool_name: intent.input?.toolName || null,
      args: intent.input?.params || {},
    },
    allowedAgentIds: [context.agent?.id || null],
    requiredCapabilities: [],
    riskLevel: 'medium',
  });

  return buildOrchestrationDecision({
    workspaceId: context.workspaceId || null,
    selectedAgentId: context.agent?.id || null,
    selectedAgentReason: 'Current execution agent is authorized to execute this Nexus tool.',
    allowedTools: intent.input?.toolName ? [intent.input.toolName] : [],
    allowedSkills: [],
    actions: [action],
    finalResponseStrategy: FINAL_RESPONSE_STRATEGIES.TOOL_THEN_AGENT,
    metadata: buildDecisionMetadata(context, {
      policyBundle: 'nexus-default-v1',
      nexus_node_id: context.nexusNodeId || null,
      tool_name: toolName || null,
    }),
  });
}

function normalizePlatformList(platforms = []) {
  return Array.from(new Set(
    (Array.isArray(platforms) ? platforms : [])
      .map((platform) => {
        const normalized = String(platform || '').trim().toLowerCase();
        return normalized === 'x' ? 'twitter' : normalized;
      })
      .filter(Boolean)
  ));
}

function normalizeScopeList(values = []) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  ));
}

function buildSocialExecutionIntent(args = {}, context = {}) {
  const requestedPlatforms = normalizePlatformList(args.platforms);
  const allowedPlatforms = normalizePlatformList(context.allowedSocialPlatforms);
  const allowedAccountIds = normalizeScopeList(context.allowedSocialAccountIds);
  const allowedBrandIds = normalizeScopeList(context.allowedSocialBrandIds);
  return buildExecutionIntent({
    actionKey: ACTION_KEYS.SOCIAL_POST,
    executor: EXECUTOR_KEYS.SOCIAL,
    workspaceId: context.workspaceId || null,
    agentId: context.agent?.id || null,
    requestedAgentId: context.chatActionContext?.requestedAgentId || context.agent?.id || null,
    displayAgentId: context.chatActionContext?.displayAgentId || context.agent?.id || null,
    toolName: 'vutler_post_social_media',
    capabilityRequirements: ['social_media'],
    input: {
      caption: typeof args.caption === 'string' ? args.caption : '',
      scheduledAt: typeof args.scheduled_at === 'string' ? args.scheduled_at : null,
      requestedPlatforms,
      allowedPlatforms,
      allowedAccountIds,
      allowedBrandIds,
      externalId: context.workspaceId ? `ws_${context.workspaceId}` : null,
    },
    metadata: {
      rawArguments: args,
    },
  });
}

function buildSocialOrchestrationDecision(args = {}, context = {}) {
  const intent = buildSocialExecutionIntent(args, context);
  const action = buildOrchestratedAction({
    id: 'act_social_1',
    kind: ACTION_KINDS.TOOL,
    key: ACTION_KEYS.SOCIAL_POST,
    executor: EXECUTOR_KEYS.SOCIAL,
    mode: 'sync',
    approval: APPROVAL_MODES.NONE,
    params: {
      caption: intent.input?.caption || '',
      scheduled_at: intent.input?.scheduledAt || null,
      platforms: intent.input?.requestedPlatforms || [],
      allowed_platforms: intent.input?.allowedPlatforms || [],
      allowed_account_ids: intent.input?.allowedAccountIds || [],
      allowed_brand_ids: intent.input?.allowedBrandIds || [],
      external_id: intent.input?.externalId || null,
    },
    allowedAgentIds: [context.agent?.id || null],
    requiredCapabilities: intent.capabilityRequirements,
    riskLevel: 'medium',
  });

  return buildOrchestrationDecision({
    workspaceId: context.workspaceId || null,
    selectedAgentId: context.agent?.id || null,
    selectedAgentReason: 'Current execution agent is authorized to publish to social media for this run.',
    allowedTools: ['vutler_post_social_media'],
    allowedSkills: [],
    actions: [action],
    finalResponseStrategy: FINAL_RESPONSE_STRATEGIES.TOOL_THEN_AGENT,
    metadata: buildDecisionMetadata(context, {
      policyBundle: 'social-default-v1',
      tool_name: 'vutler_post_social_media',
    }),
  });
}

function buildMemoryBindingsPayload(memoryBindings = null) {
  if (!memoryBindings?.instance) return null;
  return {
    scope: memoryBindings.instance.scope || null,
    category: memoryBindings.instance.category || null,
    agent_id: memoryBindings.agentId || memoryBindings.sniparaInstanceId || memoryBindings.agentRef || null,
  };
}

function buildMemoryRememberExecutionIntent(args = {}, context = {}) {
  return buildExecutionIntent({
    actionKey: ACTION_KEYS.MEMORY_REMEMBER,
    executor: EXECUTOR_KEYS.MEMORY,
    workspaceId: context.workspaceId || null,
    agentId: context.agent?.id || null,
    requestedAgentId: context.chatActionContext?.requestedAgentId || context.agent?.id || null,
    displayAgentId: context.chatActionContext?.displayAgentId || context.agent?.id || null,
    toolName: 'remember',
    capabilityRequirements: ['memory_write'],
    input: {
      content: typeof args.content === 'string' ? args.content : '',
      importance: args.importance,
      memoryType: typeof args.type === 'string' ? args.type : 'fact',
      bindings: buildMemoryBindingsPayload(context.memoryBindings),
    },
    metadata: {
      rawArguments: args,
      memory_mode: context.memoryMode?.mode || null,
    },
  });
}

function buildMemoryRememberOrchestrationDecision(args = {}, context = {}) {
  const intent = buildMemoryRememberExecutionIntent(args, context);
  const action = buildOrchestratedAction({
    id: 'act_memory_remember_1',
    kind: ACTION_KINDS.TOOL,
    key: ACTION_KEYS.MEMORY_REMEMBER,
    executor: EXECUTOR_KEYS.MEMORY,
    mode: 'sync',
    approval: APPROVAL_MODES.NONE,
    params: {
      operation: 'remember',
      content: intent.input?.content || '',
      importance: intent.input?.importance,
      memory_type: intent.input?.memoryType || 'fact',
      bindings: intent.input?.bindings || null,
    },
    allowedAgentIds: [context.agent?.id || null],
    requiredCapabilities: intent.capabilityRequirements,
    riskLevel: 'low',
  });

  return buildOrchestrationDecision({
    workspaceId: context.workspaceId || null,
    selectedAgentId: context.agent?.id || null,
    selectedAgentReason: 'Current execution agent is authorized to persist memory for this run.',
    allowedTools: ['remember'],
    allowedSkills: [],
    actions: [action],
    finalResponseStrategy: FINAL_RESPONSE_STRATEGIES.TOOL_THEN_AGENT,
    metadata: buildDecisionMetadata(context, {
      policyBundle: 'memory-default-v1',
      tool_name: 'remember',
    }),
  });
}

function buildMemoryRecallExecutionIntent(args = {}, context = {}) {
  return buildExecutionIntent({
    actionKey: ACTION_KEYS.MEMORY_RECALL,
    executor: EXECUTOR_KEYS.MEMORY,
    workspaceId: context.workspaceId || null,
    agentId: context.agent?.id || null,
    requestedAgentId: context.chatActionContext?.requestedAgentId || context.agent?.id || null,
    displayAgentId: context.chatActionContext?.displayAgentId || context.agent?.id || null,
    toolName: 'recall',
    capabilityRequirements: ['memory_read'],
    input: {
      query: typeof args.query === 'string' ? args.query : '',
      bindings: buildMemoryBindingsPayload(context.memoryBindings),
    },
    metadata: {
      rawArguments: args,
      memory_mode: context.memoryMode?.mode || null,
    },
  });
}

function buildMemoryRecallOrchestrationDecision(args = {}, context = {}) {
  const intent = buildMemoryRecallExecutionIntent(args, context);
  const action = buildOrchestratedAction({
    id: 'act_memory_recall_1',
    kind: ACTION_KINDS.TOOL,
    key: ACTION_KEYS.MEMORY_RECALL,
    executor: EXECUTOR_KEYS.MEMORY,
    mode: 'sync',
    approval: APPROVAL_MODES.NONE,
    params: {
      operation: 'recall',
      query: intent.input?.query || '',
      bindings: intent.input?.bindings || null,
    },
    allowedAgentIds: [context.agent?.id || null],
    requiredCapabilities: intent.capabilityRequirements,
    riskLevel: 'low',
  });

  return buildOrchestrationDecision({
    workspaceId: context.workspaceId || null,
    selectedAgentId: context.agent?.id || null,
    selectedAgentReason: 'Current execution agent is authorized to read memory for this run.',
    allowedTools: ['recall'],
    allowedSkills: [],
    actions: [action],
    finalResponseStrategy: FINAL_RESPONSE_STRATEGIES.TOOL_THEN_AGENT,
    metadata: buildDecisionMetadata(context, {
      policyBundle: 'memory-default-v1',
      tool_name: 'recall',
    }),
  });
}

function orchestrateToolCall({
  toolName,
  args = {},
  agent = null,
  workspaceId = null,
  chatActionContext = null,
  adapter = null,
  nexusNodeId = null,
  allowedSocialPlatforms = [],
  allowedSocialAccountIds = [],
  allowedSocialBrandIds = [],
  memoryBindings = null,
  memoryMode = null,
} = {}) {
  const context = {
    agent,
    workspaceId,
    chatActionContext,
    nexusNodeId,
    allowedSocialPlatforms,
    allowedSocialAccountIds,
    allowedSocialBrandIds,
    memoryBindings,
    memoryMode,
  };

  if (adapter === 'skill' || String(toolName || '').startsWith('skill_')) {
    return buildSkillOrchestrationDecision(toolName, args, context);
  }

  if (adapter === 'nexus') {
    return buildNexusOrchestrationDecision(toolName, args, context);
  }

  switch (toolName) {
    case 'remember':
      return buildMemoryRememberOrchestrationDecision(args, context);
    case 'recall':
      return buildMemoryRecallOrchestrationDecision(args, context);
    case 'vutler_post_social_media':
      return buildSocialOrchestrationDecision(args, context);
    case 'run_code_in_sandbox':
      return buildSandboxOrchestrationDecision(args, context);
    default:
      return null;
  }
}

module.exports = {
  MAX_SANDBOX_TIMEOUT_MS,
  DEFAULT_SANDBOX_TIMEOUT_MS,
  normalizeSandboxLanguage,
  extractSkillKey,
  buildSandboxExecutionIntent,
  buildSandboxOrchestrationDecision,
  buildSkillExecutionIntent,
  buildSkillOrchestrationDecision,
  buildNexusExecutionIntent,
  buildNexusOrchestrationDecision,
  buildSocialExecutionIntent,
  buildSocialOrchestrationDecision,
  buildMemoryRememberExecutionIntent,
  buildMemoryRememberOrchestrationDecision,
  buildMemoryRecallExecutionIntent,
  buildMemoryRecallOrchestrationDecision,
  orchestrateToolCall,
};
