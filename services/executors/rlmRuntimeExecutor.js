'use strict';

const fs = require('fs');
const { spawn } = require('child_process');
const { isSandboxEligibleAgentType } = require('../agentTypeProfiles');
const {
  resolveAgentRlmRuntimePreference,
  resolveWorkspaceRlmRuntimePolicy,
} = require('./rlmRuntimePolicy');

const DEFAULT_RLM_ENV = String(process.env.RLM_RUNTIME_ENV || 'docker').trim() || 'docker';
const DEFAULT_TIMEOUT_BUFFER_MS = Number(process.env.RLM_RUNTIME_TIMEOUT_BUFFER_MS || 3_000);
const DEFAULT_ABSOLUTE_BIN_CANDIDATES = [
  '/home/ubuntu/rlm-venv/bin/rlm',
  '/Users/lopez/.openclaw/workspace/.venvs/rlm-runtime/bin/rlm',
];
const TECHNICAL_ROLE_PATTERN = /\b(technical|security|qa|devops|engineering)\b/i;

function normalizeLanguage(language) {
  const normalized = String(language || '').trim().toLowerCase();
  if (normalized === 'python' || normalized === 'python3' || normalized === 'py') return 'python';
  if (normalized === 'javascript' || normalized === 'js' || normalized === 'node') return 'javascript';
  return normalized;
}

function isRlmRuntimeEnabled() {
  return String(process.env.RLM_RUNTIME_ENABLED || '').trim().toLowerCase() === 'true';
}

function resolveRlmRuntimeBinary() {
  const explicit = String(process.env.RLM_RUNTIME_BIN || '').trim();
  if (explicit) return explicit;

  for (const candidate of DEFAULT_ABSOLUTE_BIN_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return 'rlm';
}

function agentLooksTechnical(agent = {}) {
  const type = agent?.type || agent?.types || [];
  if (isSandboxEligibleAgentType(type)) return true;
  return TECHNICAL_ROLE_PATTERN.test(String(agent?.role || '').trim());
}

async function resolveRlmRuntimeDecision(plan = {}, context = {}) {
  if (!isRlmRuntimeEnabled()) {
    return {
      allowed: false,
      reason: 'rlm_runtime_disabled',
      workspacePolicy: null,
      agentPreference: 'inherit',
    };
  }

  const language = normalizeLanguage(plan?.params?.language || plan?.input?.language);
  if (language !== 'python') {
    return {
      allowed: false,
      reason: 'language_not_supported',
      workspacePolicy: null,
      agentPreference: 'inherit',
    };
  }

  const workspaceId = plan?.workspace_id
    || plan?.workspaceId
    || context?.workspaceId
    || context?.agent?.workspace_id
    || context?.agent?.workspaceId
    || null;
  const workspacePolicy = await resolveWorkspaceRlmRuntimePolicy({
    workspaceId,
    db: context?.db,
  });

  const agent = context?.agent || null;
  const agentPreference = resolveAgentRlmRuntimePreference(agent);

  if (!workspacePolicy.enabled) {
    return {
      allowed: false,
      reason: 'workspace_policy_disabled',
      workspaceId,
      workspacePolicy,
      agentPreference,
    };
  }

  if (!agent) {
    const allowUnknownAgent = String(process.env.RLM_RUNTIME_ALLOW_UNKNOWN_AGENT || '').trim().toLowerCase() === 'true';
    return {
      allowed: allowUnknownAgent && workspacePolicy.default_backend === 'rlm',
      reason: allowUnknownAgent ? 'workspace_default_backend' : 'unknown_agent_not_allowed',
      workspaceId,
      workspacePolicy,
      agentPreference,
    };
  }

  if (!agentLooksTechnical(agent)) {
    return {
      allowed: false,
      reason: 'agent_not_technical',
      workspaceId,
      workspacePolicy,
      agentPreference,
    };
  }

  if (agentPreference === 'native') {
    return {
      allowed: false,
      reason: 'agent_forces_native',
      workspaceId,
      workspacePolicy,
      agentPreference,
    };
  }

  return {
    allowed: agentPreference === 'rlm' || workspacePolicy.default_backend === 'rlm',
    reason: agentPreference === 'rlm'
      ? 'agent_forces_rlm'
      : 'workspace_default_backend',
    workspaceId,
    workspacePolicy,
    agentPreference,
  };
}

async function canUseRlmRuntime(plan = {}, context = {}) {
  const decision = await resolveRlmRuntimeDecision(plan, context);
  return decision.allowed;
}

function runRlmCommand({ bin, args, timeoutMs, env = process.env }) {
  return new Promise((resolve, reject) => {
    const startedAt = new Date();
    const startedMs = Date.now();
    const child = spawn(bin, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, Math.max(1_000, timeoutMs + DEFAULT_TIMEOUT_BUFFER_MS));

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      const finishedAt = new Date();
      resolve({
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
        duration_ms: finishedAt.getTime() - startedMs,
        stdout,
        stderr,
        exit_code: Number.isFinite(exitCode) ? exitCode : null,
        signal: signal || null,
        timed_out: timedOut,
      });
    });
  });
}

async function executeRlmRuntimePlan(plan = {}, context = {}) {
  const language = normalizeLanguage(plan?.params?.language || plan?.input?.language);
  if (language !== 'python') {
    throw new Error('RLM Runtime backend currently supports Python sandbox executions only.');
  }

  const code = String(plan?.params?.code || plan?.input?.code || '');
  if (!code.trim()) {
    throw new Error('Sandbox code is required.');
  }

  const timeoutMs = Math.max(1_000, Number(plan?.timeout_ms || plan?.input?.timeoutMs || 15_000) || 15_000);
  const bin = resolveRlmRuntimeBinary();
  const decision = context?.rlmRuntimeDecision || await resolveRlmRuntimeDecision(plan, context);
  const runtimeEnv = String(decision?.workspacePolicy?.runtime_env || process.env.RLM_RUNTIME_ENV || DEFAULT_RLM_ENV).trim() || DEFAULT_RLM_ENV;
  const workspaceId = decision?.workspaceId || plan?.workspace_id || plan?.workspaceId || context?.workspaceId || null;
  const agentId = context?.agent?.id || plan?.agentId || plan?.selectedAgentId || null;
  const commandResult = await runRlmCommand({
    bin,
    args: ['run', '--env', runtimeEnv, code],
    timeoutMs,
    env: {
      ...process.env,
      VUTLER_SANDBOX_BACKEND: 'rlm_runtime',
      ...(workspaceId ? { VUTLER_WORKSPACE_ID: String(workspaceId) } : {}),
      ...(agentId ? { VUTLER_AGENT_ID: String(agentId) } : {}),
    },
  });

  return {
    id: `rlm-${Date.now()}`,
    execution_id: `rlm-${Date.now()}`,
    backend: 'rlm_runtime',
    language,
    status: commandResult.timed_out
      ? 'timeout'
      : (commandResult.exit_code === 0 ? 'completed' : 'failed'),
    stdout: commandResult.stdout,
    stderr: commandResult.stderr,
    exit_code: commandResult.exit_code,
    duration_ms: commandResult.duration_ms,
    started_at: commandResult.started_at,
    finished_at: commandResult.finished_at,
    signal: commandResult.signal,
    metadata: {
      workspace_id: workspaceId,
      agent_id: agentId,
      runtime_env: runtimeEnv,
      agent_preference: decision?.agentPreference || 'inherit',
      workspace_default_backend: decision?.workspacePolicy?.default_backend || 'native',
    },
  };
}

module.exports = {
  normalizeLanguage,
  isRlmRuntimeEnabled,
  resolveRlmRuntimeBinary,
  agentLooksTechnical,
  resolveRlmRuntimeDecision,
  canUseRlmRuntime,
  executeRlmRuntimePlan,
};
