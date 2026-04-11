'use strict';

const {
  APPROVAL_MODES,
  EXECUTION_DECISIONS,
  EXECUTOR_KEYS,
  buildActionExecutionResult,
} = require('./types');
const { executeSandboxPlan } = require('../executors/sandboxExecutor');
const { executeSkillPlan } = require('../executors/skillExecutor');
const { executeNexusPlan } = require('../executors/nexusExecutor');
const { executeSocialPlan } = require('../executors/socialExecutor');
const { executeMemoryPlan } = require('../executors/memoryExecutor');

function normalizeStructuredOutput(payload) {
  if (payload && typeof payload === 'object') {
    return {
      outputJson: payload,
      outputText: undefined,
    };
  }

  if (payload === null || payload === undefined) {
    return {
      outputJson: null,
      outputText: undefined,
    };
  }

  return {
    outputJson: null,
    outputText: String(payload),
  };
}

function buildDeferredActionResult(action = {}, executionMode = EXECUTION_DECISIONS.ASYNC, reason = null) {
  const awaitingApproval = executionMode === EXECUTION_DECISIONS.APPROVAL_REQUIRED;
  return buildActionExecutionResult({
    actionId: action.id,
    success: true,
    status: awaitingApproval ? 'awaiting_approval' : 'scheduled',
    outputJson: {
      key: action.key || null,
      executor: action.executor,
      mode: executionMode,
      approval: awaitingApproval ? APPROVAL_MODES.REQUIRED : action.approval || APPROVAL_MODES.NONE,
      timeout_ms: action.timeout_ms ?? null,
      params: action.params || {},
      risk_level: action.risk_level || null,
      reason: reason || null,
    },
  });
}

async function dispatchExecutionPlan(plan = {}, context = {}) {
  if (!plan.executor) {
    throw new Error('Execution plan is missing an executor.');
  }

  if (plan.mode && plan.mode !== EXECUTION_DECISIONS.SYNC) {
    return {
      success: true,
      data: {
        status: plan.mode,
        executor: plan.executor,
        action_key: plan.actionKey || null,
        requires_approval: plan.mode === EXECUTION_DECISIONS.APPROVAL_REQUIRED,
        policy: plan.policy || null,
      },
    };
  }

  switch (plan.executor) {
    case EXECUTOR_KEYS.SANDBOX: {
      const execution = await executeSandboxPlan(plan, context);
      return {
        success: true,
        data: {
          executor: plan.executor,
          mode: EXECUTION_DECISIONS.SYNC,
          action_key: plan.actionKey || null,
          execution,
          policy: plan.policy || null,
          risk_level: plan.risk_level || null,
        },
      };
    }

    case EXECUTOR_KEYS.SKILL: {
      const result = await executeSkillPlan(plan, context);
      const normalizedOutput = normalizeStructuredOutput(result?.data);
      return {
        success: true,
        data: {
          executor: plan.executor,
          mode: EXECUTION_DECISIONS.SYNC,
          action_key: plan.actionKey || null,
          result: {
            ...result,
            data: normalizedOutput.outputJson ?? normalizedOutput.outputText ?? null,
          },
          policy: plan.policy || null,
          risk_level: plan.risk_level || null,
        },
      };
    }

    case EXECUTOR_KEYS.NEXUS: {
      const result = await executeNexusPlan(plan, context);
      const normalizedOutput = normalizeStructuredOutput(result?.data);
      return {
        success: true,
        data: {
          executor: plan.executor,
          mode: EXECUTION_DECISIONS.SYNC,
          action_key: plan.actionKey || null,
          result: {
            ...result,
            data: normalizedOutput.outputJson ?? normalizedOutput.outputText ?? null,
          },
          policy: plan.policy || null,
          risk_level: plan.risk_level || null,
        },
      };
    }

    case EXECUTOR_KEYS.SOCIAL: {
      const result = await executeSocialPlan(plan, context);
      const normalizedOutput = normalizeStructuredOutput(result?.data);
      return {
        success: true,
        data: {
          executor: plan.executor,
          mode: EXECUTION_DECISIONS.SYNC,
          action_key: plan.actionKey || null,
          result: {
            ...result,
            data: normalizedOutput.outputJson ?? normalizedOutput.outputText ?? null,
          },
          policy: plan.policy || null,
          risk_level: plan.risk_level || null,
        },
      };
    }

    case EXECUTOR_KEYS.MEMORY: {
      const result = await executeMemoryPlan(plan, context);
      const normalizedOutput = normalizeStructuredOutput(result?.data);
      return {
        success: true,
        data: {
          executor: plan.executor,
          mode: EXECUTION_DECISIONS.SYNC,
          action_key: plan.actionKey || null,
          result: {
            ...result,
            data: normalizedOutput.outputJson ?? normalizedOutput.outputText ?? null,
          },
          policy: plan.policy || null,
          risk_level: plan.risk_level || null,
        },
      };
    }

    default:
      throw new Error(`Unsupported executor: ${plan.executor}`);
  }
}

async function dispatchOrchestratedAction(action = {}, context = {}) {
  if (!action.executor) {
    throw new Error('Orchestrated action is missing an executor.');
  }

  if (action.approval === APPROVAL_MODES.REQUIRED) {
    return buildActionExecutionResult({
      actionId: action.id,
      success: true,
      status: 'awaiting_approval',
      outputJson: {
        key: action.key || null,
        executor: action.executor,
        mode: action.mode || EXECUTION_DECISIONS.SYNC,
        approval: action.approval,
        timeout_ms: action.timeout_ms ?? null,
        params: action.params || {},
        risk_level: action.risk_level || null,
      },
    });
  }

  const startedAt = Date.now();
  try {
    switch (action.executor) {
      case EXECUTOR_KEYS.SANDBOX: {
        const execution = await executeSandboxPlan(action, context);
        return buildActionExecutionResult({
          actionId: action.id,
          success: true,
          status: 'completed',
          outputJson: {
            execution_id: execution?.execution_id || execution?.id || null,
            language: execution?.language || action.params?.language || null,
            status: execution?.status || 'completed',
            stdout: execution?.stdout || '',
            stderr: execution?.stderr || '',
            exit_code: execution?.exit_code ?? null,
            duration_ms: execution?.duration_ms ?? null,
            backend_selected: execution?.metadata?.backend_selected || execution?.backend || null,
            backend_effective: execution?.metadata?.backend_effective || execution?.backend || null,
            used_fallback: execution?.metadata?.used_fallback === true,
            fallback_from: execution?.metadata?.fallback_from || null,
            fallback_reason: execution?.metadata?.fallback_reason || null,
          },
          usage: {
            duration_ms: execution?.duration_ms ?? (Date.now() - startedAt),
          },
        });
      }

      case EXECUTOR_KEYS.SKILL: {
        const result = await executeSkillPlan(action, context);
        const normalizedOutput = normalizeStructuredOutput(result?.data);
        return buildActionExecutionResult({
          actionId: action.id,
          success: result?.success !== false,
          status: result?.success === false ? 'failed' : 'completed',
          outputJson: normalizedOutput.outputJson,
          outputText: normalizedOutput.outputText,
          error: result?.success === false ? (result.error || 'Skill execution failed.') : null,
        });
      }

      case EXECUTOR_KEYS.NEXUS: {
        const result = await executeNexusPlan(action, context);
        const normalizedOutput = normalizeStructuredOutput(result?.data);
        return buildActionExecutionResult({
          actionId: action.id,
          success: result?.success !== false,
          status: result?.success === false ? 'failed' : 'completed',
          outputJson: normalizedOutput.outputJson,
          outputText: normalizedOutput.outputText,
          error: result?.success === false ? (result.error || 'Nexus execution failed.') : null,
        });
      }

      case EXECUTOR_KEYS.SOCIAL: {
        const result = await executeSocialPlan(action, context);
        const normalizedOutput = normalizeStructuredOutput(result?.data);
        return buildActionExecutionResult({
          actionId: action.id,
          success: result?.success !== false,
          status: result?.success === false ? 'failed' : 'completed',
          outputJson: normalizedOutput.outputJson,
          outputText: normalizedOutput.outputText,
          error: result?.success === false ? (result.error || 'Social execution failed.') : null,
        });
      }

      case EXECUTOR_KEYS.MEMORY: {
        const result = await executeMemoryPlan(action, context);
        const normalizedOutput = normalizeStructuredOutput(result?.data);
        return buildActionExecutionResult({
          actionId: action.id,
          success: result?.success !== false,
          status: result?.success === false ? 'failed' : 'completed',
          outputJson: normalizedOutput.outputJson,
          outputText: normalizedOutput.outputText,
          error: result?.success === false ? (result.error || 'Memory execution failed.') : null,
        });
      }

      default:
        throw new Error(`Unsupported executor: ${action.executor}`);
    }
  } catch (err) {
    return buildActionExecutionResult({
      actionId: action.id,
      success: false,
      status: 'failed',
      error: err.message || 'Execution failed.',
      outputJson: null,
      usage: {
        duration_ms: Date.now() - startedAt,
      },
    });
  }
}

async function executeOrchestrationDecision(decision = {}, context = {}) {
  const actions = Array.isArray(decision.actions) ? decision.actions : [];
  const executionMode = decision?.metadata?.execution_mode || EXECUTION_DECISIONS.SYNC;
  if (executionMode !== EXECUTION_DECISIONS.SYNC) {
    return actions.map((action) => buildDeferredActionResult(action, executionMode, executionMode === EXECUTION_DECISIONS.APPROVAL_REQUIRED
      ? 'Execution plan requires approval before any action can start.'
      : 'Execution plan will be dispatched asynchronously.'));
  }

  const results = [];
  for (const action of actions) {
    const result = await dispatchOrchestratedAction(action, {
      ...context,
      workspaceId: decision.workspace_id || context.workspaceId || null,
      selectedAgentId: decision.selected_agent_id || context.selectedAgentId || null,
    });
    results.push(result);
    if (result?.success === false || result?.status === 'awaiting_approval' || result?.status === 'timeout') {
      break;
    }
  }
  return results;
}

module.exports = {
  dispatchExecutionPlan,
  dispatchOrchestratedAction,
  executeOrchestrationDecision,
};
