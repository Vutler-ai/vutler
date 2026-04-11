'use strict';

const { executeInSandbox } = require('../sandbox');
const {
  canUseRlmRuntime,
  executeRlmRuntimePlan,
} = require('./rlmRuntimeExecutor');

async function executeSandboxPlan(plan = {}, context = {}) {
  const timeoutMs = plan.timeout_ms || plan.input?.timeoutMs;
  if (canUseRlmRuntime(plan, context)) {
    try {
      return await executeRlmRuntimePlan(plan, context);
    } catch (error) {
      console.warn('[SandboxExecutor] RLM Runtime unavailable, falling back to native sandbox:', error.message);
    }
  }

  return executeInSandbox(
    plan.params?.language || plan.input?.language,
    plan.params?.code || plan.input?.code,
    plan.agentId || plan.selectedAgentId || null,
    timeoutMs,
    {
      workspaceId: plan.workspace_id || plan.workspaceId || null,
      source: 'orchestration',
      metadata: {
        action_id: plan.id || null,
        action_key: plan.actionKey || plan.key || null,
        executor: 'sandbox-worker',
      },
      waitForCompletion: true,
      maxWaitMs: Math.min((timeoutMs || 15_000) + 3_000, 20_000),
      throwOnWaitTimeout: true,
    }
  );
}

module.exports = {
  executeSandboxPlan,
};
