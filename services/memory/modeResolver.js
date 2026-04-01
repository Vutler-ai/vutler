'use strict';

const { hasSniparaCapability } = require('../../packages/core/middleware/featureGate');
const { getWorkspacePlanId } = require('../workspacePlanService');

const SCHEMA = 'tenant_vutler';
const MEMORY_MODE_DISABLED = 'disabled';
const MEMORY_MODE_PASSIVE = 'passive';
const MEMORY_MODE_ACTIVE = 'active';
const VALID_MODES = new Set([
  MEMORY_MODE_DISABLED,
  MEMORY_MODE_PASSIVE,
  MEMORY_MODE_ACTIVE,
]);

function normalizeMemoryMode(value, fallback = MEMORY_MODE_PASSIVE) {
  const normalized = String(value || '').trim().toLowerCase();
  return VALID_MODES.has(normalized) ? normalized : fallback;
}

function parseAgentMemoryMode(agent = {}) {
  const candidates = [
    agent.memory_mode,
    agent.memoryMode,
    agent?.metadata?.memory_mode,
    agent?.config?.memory_mode,
  ];
  return candidates.find((value) => VALID_MODES.has(String(value || '').trim().toLowerCase())) || null;
}

async function resolveWorkspaceMemoryMode(db, workspaceId) {
  if (!db || !workspaceId) return null;

  try {
    const result = await db.query(
      `SELECT key, value
       FROM ${SCHEMA}.workspace_settings
       WHERE workspace_id = $1
         AND key IN ('memory_mode', 'snipara_memory_mode')
       ORDER BY CASE key WHEN 'memory_mode' THEN 0 ELSE 1 END
       LIMIT 2`,
      [workspaceId]
    );

    for (const row of result.rows || []) {
      const raw = typeof row.value === 'object' && row.value !== null
        ? (row.value.value || row.value.mode || null)
        : row.value;
      const mode = normalizeMemoryMode(raw, '');
      if (mode) return mode;
    }
  } catch (_) {}

  return null;
}

async function resolveMemoryMode({ db = null, workspaceId = null, agent = null, defaultMode = null } = {}) {
  const envDefault = normalizeMemoryMode(process.env.DEFAULT_MEMORY_MODE, MEMORY_MODE_PASSIVE);
  const fallback = normalizeMemoryMode(defaultMode, envDefault);

  const agentMode = parseAgentMemoryMode(agent || {});
  if (agentMode) {
    return {
      mode: agentMode,
      source: 'agent',
      read: agentMode === MEMORY_MODE_ACTIVE,
      write: agentMode !== MEMORY_MODE_DISABLED,
      inject: agentMode === MEMORY_MODE_ACTIVE,
    };
  }

  const workspaceMode = await resolveWorkspaceMemoryMode(db, workspaceId);
  if (workspaceMode) {
    return {
      mode: workspaceMode,
      source: 'workspace',
      read: workspaceMode === MEMORY_MODE_ACTIVE,
      write: workspaceMode !== MEMORY_MODE_DISABLED,
      inject: workspaceMode === MEMORY_MODE_ACTIVE,
    };
  }

  const workspacePlanId = await getWorkspacePlanId(db, workspaceId).catch(() => null);
  if (workspacePlanId && hasSniparaCapability(workspacePlanId, 'memory')) {
    return {
      mode: MEMORY_MODE_ACTIVE,
      source: 'plan',
      read: true,
      write: true,
      inject: true,
    };
  }

  return {
    mode: fallback,
    source: defaultMode ? 'argument' : 'env',
    read: fallback === MEMORY_MODE_ACTIVE,
    write: fallback !== MEMORY_MODE_DISABLED,
    inject: fallback === MEMORY_MODE_ACTIVE,
  };
}

module.exports = {
  MEMORY_MODE_DISABLED,
  MEMORY_MODE_PASSIVE,
  MEMORY_MODE_ACTIVE,
  normalizeMemoryMode,
  resolveWorkspaceMemoryMode,
  resolveMemoryMode,
};
