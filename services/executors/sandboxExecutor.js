'use strict';

const {
  createSandboxJob,
  updateSandboxJob,
  executeInSandbox,
} = require('../sandbox');
const {
  resolveRlmRuntimeDecision,
  executeRlmRuntimePlan,
} = require('./rlmRuntimeExecutor');

function buildSandboxTelemetryMetadata({
  plan = {},
  decision = null,
  selectedBackend = 'native_sandbox',
  effectiveBackend = 'native_sandbox',
  fallbackFrom = null,
  fallbackReason = null,
  backendExecutionId = null,
  runtimeEnv = null,
} = {}) {
  return {
    action_id: plan.id || null,
    action_key: plan.actionKey || plan.key || null,
    executor: 'sandbox-worker',
    backend_selected: selectedBackend,
    backend_effective: effectiveBackend,
    fallback_from: fallbackFrom,
    fallback_reason: fallbackReason,
    used_fallback: Boolean(fallbackFrom),
    backend_execution_id: backendExecutionId,
    rlm_runtime: decision
      ? {
        decision_reason: decision.reason || null,
        agent_preference: decision.agentPreference || 'inherit',
        workspace_default_backend: decision.workspacePolicy?.default_backend || 'native',
        runtime_env: runtimeEnv || decision.workspacePolicy?.runtime_env || null,
      }
      : null,
  };
}

async function executeSandboxPlan(plan = {}, context = {}) {
  const timeoutMs = plan.timeout_ms || plan.input?.timeoutMs;
  const rlmRuntimeDecision = await resolveRlmRuntimeDecision(plan, context);
  if (rlmRuntimeDecision.allowed) {
    try {
      const workspaceId = plan.workspace_id || plan.workspaceId || context.workspaceId || null;
      const agentId = plan.agentId || plan.selectedAgentId || context.agent?.id || null;
      const execution = await executeRlmRuntimePlan(plan, {
        ...context,
        rlmRuntimeDecision,
      });
      const telemetryMetadata = buildSandboxTelemetryMetadata({
        plan,
        decision: rlmRuntimeDecision,
        selectedBackend: 'rlm_runtime',
        effectiveBackend: 'rlm_runtime',
        backendExecutionId: execution.execution_id || execution.id || null,
        runtimeEnv: execution.metadata?.runtime_env || null,
      });

      try {
        const job = await createSandboxJob({
          language: plan.params?.language || plan.input?.language,
          code: plan.params?.code || plan.input?.code,
          agentId,
          timeoutMs,
          workspaceId,
          source: 'orchestration',
          metadata: telemetryMetadata,
        });

        return await updateSandboxJob(job.id, {
          stdout: execution.stdout || null,
          stderr: execution.stderr || null,
          exit_code: execution.exit_code ?? null,
          status: execution.status || 'completed',
          duration_ms: execution.duration_ms ?? null,
          error: execution.status === 'failed' || execution.status === 'timeout'
            ? (execution.stderr || `Sandbox execution ${execution.status || 'failed'}.`)
            : null,
          started_at: execution.started_at || undefined,
          finished_at: execution.finished_at || new Date().toISOString(),
          metadata: telemetryMetadata,
        });
      } catch (persistError) {
        console.warn('[SandboxExecutor] Unable to persist RLM Runtime telemetry:', persistError.message);
        return {
          ...execution,
          metadata: telemetryMetadata,
        };
      }
    } catch (error) {
      console.warn('[SandboxExecutor] RLM Runtime unavailable, falling back to native sandbox:', error.message);
      return executeInSandbox(
        plan.params?.language || plan.input?.language,
        plan.params?.code || plan.input?.code,
        plan.agentId || plan.selectedAgentId || null,
        timeoutMs,
        {
          workspaceId: plan.workspace_id || plan.workspaceId || null,
          source: 'orchestration',
          metadata: buildSandboxTelemetryMetadata({
            plan,
            decision: rlmRuntimeDecision,
            selectedBackend: 'rlm_runtime',
            effectiveBackend: 'native_sandbox',
            fallbackFrom: 'rlm_runtime',
            fallbackReason: error.message || 'rlm_runtime_unavailable',
          }),
          waitForCompletion: true,
          maxWaitMs: Math.min((timeoutMs || 15_000) + 3_000, 20_000),
          throwOnWaitTimeout: true,
        }
      );
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
      metadata: buildSandboxTelemetryMetadata({
        plan,
        decision: rlmRuntimeDecision,
        selectedBackend: rlmRuntimeDecision.allowed ? 'rlm_runtime' : 'native_sandbox',
        effectiveBackend: 'native_sandbox',
        fallbackFrom: rlmRuntimeDecision.allowed ? 'rlm_runtime' : null,
        fallbackReason: rlmRuntimeDecision.allowed ? 'rlm_runtime_unavailable' : null,
      }),
      waitForCompletion: true,
      maxWaitMs: Math.min((timeoutMs || 15_000) + 3_000, 20_000),
      throwOnWaitTimeout: true,
    }
  );
}

module.exports = {
  executeSandboxPlan,
};
