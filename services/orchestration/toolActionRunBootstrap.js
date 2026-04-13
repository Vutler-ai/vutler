'use strict';

const pool = require('../../lib/vaultbrix');
const { getSwarmCoordinator } = require('../swarmCoordinator');
const { getRunEngine } = require('./runEngine');
const { bootstrapTaskRun } = require('./runBootstrap');
const { isMissingOrchestrationSchemaError } = require('./runStore');

function truncateText(value, maxLength = 140) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (_) {
    return '{}';
  }
}

function toolLabel(toolName) {
  switch (String(toolName || '').trim()) {
    case 'run_code_in_sandbox':
      return 'Sandbox execution';
    case 'vutler_post_social_media':
      return 'Social publication';
    case 'vutler_create_schedule':
      return 'Schedule creation';
    case 'remember':
      return 'Memory write';
    case 'recall':
      return 'Memory recall';
    default:
      if (String(toolName || '').startsWith('skill_')) {
        return `Skill ${String(toolName || '').slice('skill_'.length)}`;
      }
      return truncateText(toolName || 'Tool action', 80);
  }
}

function buildToolActionTitle(toolName, args = {}, executionMode = 'async') {
  const label = toolLabel(toolName);
  if (toolName === 'run_code_in_sandbox') {
    const language = String(args.language || '').trim();
    return truncateText(`${label}${language ? ` (${language})` : ''}`, 140);
  }
  if (toolName === 'vutler_post_social_media') {
    return truncateText(`${label}: ${String(args.caption || '').trim() || 'Queued post'}`, 140);
  }
  if (String(toolName || '').startsWith('skill_')) {
    return truncateText(`${label} (${executionMode})`, 140);
  }
  return truncateText(`${label} (${executionMode})`, 140);
}

function buildToolActionDescription({
  toolName,
  adapter,
  args,
  executionMode,
  latestUserMessage,
  governance,
} = {}) {
  return [
    `Tool action: ${toolName || 'unknown'}`,
    adapter ? `Adapter: ${adapter}` : '',
    executionMode ? `Execution mode: ${executionMode}` : '',
    governance?.reason ? `Reason: ${governance.reason}` : '',
    latestUserMessage ? `\nLatest user request:\n${String(latestUserMessage).trim()}` : '',
    `\nArguments:\n${safeJson(args)}`,
  ].filter(Boolean).join('\n');
}

function buildDeferredRunLinks(seed = {}) {
  const rootTaskId = seed?.task?.id || null;
  const runId = seed?.run?.id || null;
  return {
    orchestration_run_id: runId,
    orchestration_step_id: seed?.step?.id || null,
    root_task_id: rootTaskId,
    run_url: runId ? `/orchestration/runs/${encodeURIComponent(String(runId))}` : null,
    task_url: rootTaskId ? `/tasks?task=${encodeURIComponent(String(rootTaskId))}` : '/tasks',
  };
}

async function queueToolActionRun({
  db = pool,
  workspaceId,
  agent,
  chatActionContext,
  humanContext = null,
  actionRun = null,
  toolName,
  adapter,
  args = {},
  orchestrationDecision = null,
  governance = null,
  latestUserMessage = '',
  model = null,
  provider = null,
  nexusNodeId = null,
  memoryBindings = null,
  memoryMode = null,
  originTaskId = null,
  wsConnections = null,
} = {}) {
  if (!workspaceId || !chatActionContext?.messageId || !chatActionContext?.channelId) {
    return null;
  }

  const executionMode = governance?.decision || governance?.decisionPayload?.metadata?.execution_mode || 'async';
  const requestedAgentId = chatActionContext.requestedAgentId || agent?.id || null;
  const displayAgentId = chatActionContext.displayAgentId || agent?.id || requestedAgentId;
  const rootTitle = buildToolActionTitle(toolName, args, executionMode);
  const rootDescription = buildToolActionDescription({
    toolName,
    adapter,
    args,
    executionMode,
    latestUserMessage,
    governance,
  });

  const coordinator = getSwarmCoordinator();
  const rootTask = await coordinator.createTask({
    title: rootTitle,
    description: rootDescription,
    priority: executionMode === 'approval_required' ? 'high' : 'medium',
    for_agent_id: agent?.username || agent?.id || requestedAgentId,
    suppress_coordination: true,
    metadata: {
      origin: 'chat',
      origin_chat_channel_id: chatActionContext.channelId,
      origin_chat_message_id: chatActionContext.messageId,
      origin_chat_user_id: humanContext?.id || null,
      origin_chat_user_name: humanContext?.name || null,
      requested_agent_id: requestedAgentId,
      display_agent_id: displayAgentId,
      workflow_mode: 'FULL',
      execution_backend: 'orchestration_run',
      execution_mode: 'autonomous',
      autonomous: true,
      orchestration_required: true,
      orchestration_entrypoint: 'tool_action',
      orchestration_tool_name: toolName || null,
      orchestration_tool_adapter: adapter || null,
      orchestration_tool_execution_mode: executionMode,
      orchestration_tool_args: args,
      chat_action_run_id: actionRun?.id || null,
      approval_required: executionMode === 'approval_required',
      approval_mode: executionMode === 'approval_required' ? 'manual' : null,
      visible_in_kanban: true,
    },
  }, workspaceId);

  try {
    const seed = await bootstrapTaskRun({
      db,
      task: rootTask,
      workspaceId,
      requestedAgent: {
        id: requestedAgentId,
        username: agent?.username || requestedAgentId || null,
      },
      displayAgent: {
        id: displayAgentId,
        username: agent?.username || displayAgentId || null,
      },
      orchestratedBy: chatActionContext.orchestratedBy || 'jarvis',
      summary: `${toolLabel(toolName)} delegated to a durable orchestration run.`,
      plan: {
        goal: rootTitle,
        summary: `${toolLabel(toolName)} queued for durable execution.`,
        strategy: 'tool_actions',
        source: 'tool_action',
        execution_mode: executionMode,
        action_count: Array.isArray(governance?.decisionPayload?.actions) ? governance.decisionPayload.actions.length : 0,
        tool_name: toolName || null,
        tool_adapter: adapter || null,
        controls: {
          approval: executionMode === 'approval_required',
          verification: false,
          finalize: true,
        },
        phases: [{
          key: 'tool_action',
          title: rootTitle,
          objective: truncateText(rootDescription, 260),
          agent_id: requestedAgentId,
          agent_username: agent?.username || null,
        }],
      },
      context: {
        source: 'chat_tool_action',
        workspace_id: workspaceId,
        chat_action_run_id: actionRun?.id || null,
        chat_action_context: chatActionContext,
        human_context: humanContext || null,
        tool_name: toolName || null,
        tool_adapter: adapter || null,
        tool_args: args,
        orchestration_decision: orchestrationDecision,
        governed_decision: governance?.decisionPayload || null,
        governance: governance ? {
          decision: governance.decision || null,
          reason: governance.reason || null,
          risk_level: governance.risk_level || null,
        } : null,
        latest_user_message: latestUserMessage || '',
        model: model || null,
        provider: provider || null,
        nexus_node_id: nexusNodeId || null,
        memory_bindings: memoryBindings || null,
        memory_mode: memoryMode || null,
        origin_task_id: originTaskId || null,
      },
      taskStatus: executionMode === 'approval_required' ? 'in_progress' : 'in_progress',
      taskMetadataPatch: {
        execution_backend: 'orchestration_run',
        execution_mode: 'autonomous',
        workflow_mode: 'FULL',
      },
    });

    getRunEngine({ wsConnections }).requestImmediatePoll();

    return {
      ...seed,
      links: buildDeferredRunLinks(seed),
      execution_mode: executionMode,
      approval_required: executionMode === 'approval_required',
    };
  } catch (err) {
    if (isMissingOrchestrationSchemaError(err)) return null;
    throw err;
  }
}

module.exports = {
  buildDeferredRunLinks,
  buildToolActionDescription,
  buildToolActionTitle,
  queueToolActionRun,
  toolLabel,
};
