'use strict';

const pool = require('../../lib/vaultbrix');

const SCHEMA = 'tenant_vutler';

const DEFAULT_WORKSPACE_RLM_RUNTIME_POLICY = Object.freeze({
  enabled: false,
  default_backend: 'native',
  runtime_env: null,
});

function readWorkspaceSettingValue(rawValue) {
  if (rawValue === undefined || rawValue === null) return null;
  if (typeof rawValue === 'object' && rawValue !== null && 'value' in rawValue) {
    return rawValue.value;
  }
  return rawValue;
}

function normalizeBackendPreference(value, { allowInherit = false } = {}) {
  const normalized = String(value || '').trim().toLowerCase();

  if (allowInherit && (!normalized || normalized === 'inherit' || normalized === 'default' || normalized === 'workspace')) {
    return 'inherit';
  }

  if (normalized === 'rlm' || normalized === 'rlm_runtime' || normalized === 'prefer_rlm') {
    return 'rlm';
  }

  if (normalized === 'native' || normalized === 'sandbox' || normalized === 'sandbox_worker' || normalized === 'native_sandbox') {
    return 'native';
  }

  return allowInherit ? 'inherit' : 'native';
}

function normalizeWorkspaceRlmRuntimePolicy(value) {
  const raw = readWorkspaceSettingValue(value);

  if (typeof raw === 'boolean') {
    return {
      enabled: raw,
      default_backend: 'native',
      runtime_env: null,
    };
  }

  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (!normalized || normalized === 'disabled' || normalized === 'off' || normalized === 'native') {
      return { ...DEFAULT_WORKSPACE_RLM_RUNTIME_POLICY };
    }
    if (normalized === 'enabled' || normalized === 'allowed' || normalized === 'opt_in') {
      return {
        enabled: true,
        default_backend: 'native',
        runtime_env: null,
      };
    }
    if (normalized === 'rlm' || normalized === 'prefer_rlm' || normalized === 'default_rlm') {
      return {
        enabled: true,
        default_backend: 'rlm',
        runtime_env: null,
      };
    }
    return { ...DEFAULT_WORKSPACE_RLM_RUNTIME_POLICY };
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_WORKSPACE_RLM_RUNTIME_POLICY };
  }

  const enabled = typeof raw.enabled === 'boolean'
    ? raw.enabled
    : normalizeBackendPreference(raw.default_backend) === 'rlm';
  const runtimeEnv = typeof raw.runtime_env === 'string' && raw.runtime_env.trim()
    ? raw.runtime_env.trim()
    : null;

  return {
    enabled,
    default_backend: enabled
      ? normalizeBackendPreference(raw.default_backend)
      : 'native',
    runtime_env: runtimeEnv,
  };
}

function resolveAgentRlmRuntimePreference(agent = {}) {
  const config = agent?.config && typeof agent.config === 'object' && !Array.isArray(agent.config)
    ? agent.config
    : {};
  const governance = config?.governance && typeof config.governance === 'object' && !Array.isArray(config.governance)
    ? config.governance
    : {};

  return normalizeBackendPreference(
    governance.sandbox_backend || governance.sandbox_backend_preference,
    { allowInherit: true }
  );
}

async function resolveWorkspaceRlmRuntimePolicy({ workspaceId, db = pool } = {}) {
  if (!workspaceId || !db?.query) {
    return { ...DEFAULT_WORKSPACE_RLM_RUNTIME_POLICY };
  }

  try {
    const kvResult = await db.query(
      `SELECT value
         FROM ${SCHEMA}.workspace_settings
        WHERE workspace_id = $1
          AND key = 'rlm_runtime_policy'
        LIMIT 1`,
      [workspaceId]
    );

    if (kvResult.rows?.[0]) {
      return normalizeWorkspaceRlmRuntimePolicy(kvResult.rows[0].value);
    }
  } catch (_) {
    // Some environments still use a flat workspace_settings layout.
  }

  try {
    const flatResult = await db.query(
      `SELECT rlm_runtime_policy
         FROM ${SCHEMA}.workspace_settings
        WHERE workspace_id = $1
        LIMIT 1`,
      [workspaceId]
    );

    if (flatResult.rows?.[0]) {
      return normalizeWorkspaceRlmRuntimePolicy(flatResult.rows[0].rlm_runtime_policy);
    }
  } catch (_) {
    // Ignore unsupported flat layouts and keep the safe default.
  }

  return { ...DEFAULT_WORKSPACE_RLM_RUNTIME_POLICY };
}

module.exports = {
  DEFAULT_WORKSPACE_RLM_RUNTIME_POLICY,
  readWorkspaceSettingValue,
  normalizeBackendPreference,
  normalizeWorkspaceRlmRuntimePolicy,
  resolveAgentRlmRuntimePreference,
  resolveWorkspaceRlmRuntimePolicy,
};
