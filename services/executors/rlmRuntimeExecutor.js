'use strict';

const fs = require('fs');
const { spawn } = require('child_process');
const { isSandboxEligibleAgentType } = require('../agentTypeProfiles');

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

function canUseRlmRuntime(plan = {}, context = {}) {
  if (!isRlmRuntimeEnabled()) return false;
  if (normalizeLanguage(plan?.params?.language || plan?.input?.language) !== 'python') return false;

  const agent = context?.agent || null;
  if (!agent) return String(process.env.RLM_RUNTIME_ALLOW_UNKNOWN_AGENT || '').trim().toLowerCase() === 'true';
  return agentLooksTechnical(agent);
}

function runRlmCommand({ bin, args, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const startedAt = new Date();
    const startedMs = Date.now();
    const child = spawn(bin, args, {
      env: process.env,
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

async function executeRlmRuntimePlan(plan = {}, _context = {}) {
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
  const runtimeEnv = String(process.env.RLM_RUNTIME_ENV || DEFAULT_RLM_ENV).trim() || DEFAULT_RLM_ENV;
  const commandResult = await runRlmCommand({
    bin,
    args: ['run', '--env', runtimeEnv, code],
    timeoutMs,
  });

  return {
    id: `rlm-${Date.now()}`,
    execution_id: `rlm-${Date.now()}`,
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
  };
}

module.exports = {
  normalizeLanguage,
  isRlmRuntimeEnabled,
  resolveRlmRuntimeBinary,
  agentLooksTechnical,
  canUseRlmRuntime,
  executeRlmRuntimePlan,
};
