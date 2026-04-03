'use strict';

const {
  buildAgentMemoryBindings,
  listAgentMemories,
} = require('./sniparaMemoryService');
const { findRecentDuplicate } = require('./memoryConsolidationService');
const { normalizeScopeKey, normalizeType } = require('./memoryPolicy');
const { callSniparaTool } = require('./sniparaResolver');
const { logMemoryEvent } = require('./memoryTelemetryService');

const SCHEMA = 'tenant_vutler';
const DEFAULT_SCAN_LIMIT = Number(process.env.MEMORY_HUMAN_BACKFILL_SCAN_LIMIT) || 1000;
const BACKFILL_SOURCE = 'memory-human-scope-backfill';
const BACKFILL_VERSION = 'v1';

function getHumanContextFromMemory(memory = {}) {
  const metadata = memory.metadata || {};
  const id = String(metadata.user_id || memory.user_id || '').trim() || null;
  const name = String(metadata.user_name || memory.user_name || '').trim() || null;
  if (!id && !name) return null;
  return { id, name };
}

function resolveDesiredHumanScope(memory = {}) {
  const metadata = memory.metadata || {};
  const type = normalizeType(memory.type);
  const lane = String(metadata.memory_lane || '').trim().toLowerCase();
  const explicitScope = normalizeScopeKey(metadata.memory_scope_key || '');
  const hasHumanContext = Boolean(metadata.user_id || metadata.user_name || memory.user_id || memory.user_name);

  if (type === 'user_profile' || lane === 'user_profile') return 'human';
  if (hasHumanContext && (type === 'action_log' || type === 'context' || lane === 'conversation_log')) return 'human_agent';
  if (explicitScope === 'human' || explicitScope === 'human_agent') return explicitScope;
  return null;
}

function matchesTargetPlacement(memory = {}, target = null, desiredScopeKey = 'instance') {
  if (!target) return false;
  const actualScopeKey = normalizeScopeKey(memory.scope_key || memory.scope);
  if (actualScopeKey !== normalizeScopeKey(desiredScopeKey)) return false;

  const actualCategory = String(memory.category || '').trim();
  const targetCategory = String(target.category || '').trim();
  if (!actualCategory || !targetCategory) return false;

  return actualCategory === targetCategory;
}

function buildBackfillMemory(memory = {}, desiredScopeKey, humanContext = null) {
  return {
    scopeKey: desiredScopeKey,
    text: String(memory.text || '').trim(),
    type: normalizeType(memory.type),
    importance: Number(memory.importance) || 0.5,
    visibility: memory.visibility || memory.metadata?.visibility || null,
    metadata: {
      ...(memory.metadata || {}),
      user_id: humanContext?.id || memory.metadata?.user_id || null,
      user_name: humanContext?.name || memory.metadata?.user_name || null,
      memory_scope_key: desiredScopeKey,
    },
  };
}

function buildHumanScopeBackfillCandidate({ workspaceId, agent, memory }) {
  const humanContext = getHumanContextFromMemory(memory);
  if (!humanContext) return null;

  const desiredScopeKey = resolveDesiredHumanScope(memory);
  if (desiredScopeKey !== 'human' && desiredScopeKey !== 'human_agent') return null;

  const bindings = buildAgentMemoryBindings(agent, workspaceId, humanContext);
  const target = bindings[desiredScopeKey];
  if (!target) return null;
  if (matchesTargetPlacement(memory, target, desiredScopeKey)) return null;

  const migratedMemory = buildBackfillMemory(memory, desiredScopeKey, humanContext);
  if (!migratedMemory.text) return null;

  return {
    workspaceId,
    agent,
    sourceMemory: memory,
    desiredScopeKey,
    humanContext,
    target,
    migratedMemory,
  };
}

function collectHumanScopeBackfillCandidates({ workspaceId, agent, memories = [] }) {
  return (memories || [])
    .map((memory) => buildHumanScopeBackfillCandidate({ workspaceId, agent, memory }))
    .filter(Boolean);
}

async function forgetSourceMemory({ db, workspaceId, memoryId }) {
  if (!memoryId) return false;

  await callSniparaTool({
    db,
    workspaceId,
    toolName: 'rlm_forget',
    args: { memory_id: memoryId },
  });

  return true;
}

async function applyBackfillCandidate({ db, candidate, apply = false }) {
  const duplicate = await findRecentDuplicate({
    db,
    workspaceId: candidate.workspaceId,
    agent: candidate.agent,
    memory: candidate.migratedMemory,
  }).catch(() => null);

  if (!apply) {
    return {
      status: duplicate ? 'would_forget_duplicate' : 'would_migrate',
      duplicate: Boolean(duplicate),
      deleted: false,
      wrote: false,
    };
  }

  if (!duplicate) {
    const sourceMetadata = candidate.sourceMemory.metadata || {};
    await callSniparaTool({
      db,
      workspaceId: candidate.workspaceId,
      toolName: 'rlm_remember',
      args: {
        text: candidate.migratedMemory.text,
        type: candidate.migratedMemory.type,
        importance: candidate.migratedMemory.importance,
        scope: candidate.target.scope,
        category: candidate.target.category,
        ...(candidate.desiredScopeKey === 'human_agent'
          ? { agent_id: candidate.agent?.snipara_instance_id || candidate.agent?.id || candidate.agent?.username || null }
          : {}),
        metadata: {
          ...candidate.migratedMemory.metadata,
          visibility: candidate.migratedMemory.visibility || candidate.migratedMemory.metadata?.visibility || 'reviewable',
          source: BACKFILL_SOURCE,
          backfill_human_scope_version: BACKFILL_VERSION,
          backfill_human_scope_at: new Date().toISOString(),
          migrated_from_memory_id: candidate.sourceMemory.id || null,
          migrated_from_scope_key: candidate.sourceMemory.scope_key || null,
          migrated_from_scope: candidate.sourceMemory.scope || null,
          migrated_from_category: candidate.sourceMemory.category || null,
          migrated_from_agent_id: sourceMetadata.agent_id || candidate.sourceMemory.agent_id || null,
          migrated_from_agent_username: sourceMetadata.agent_username || candidate.agent?.username || null,
        },
      },
    });
  }

  const deleted = await forgetSourceMemory({
    db,
    workspaceId: candidate.workspaceId,
    memoryId: candidate.sourceMemory.id,
  }).catch(() => false);

  return {
    status: duplicate ? 'forgot_duplicate_source' : 'migrated',
    duplicate: Boolean(duplicate),
    deleted,
    wrote: !duplicate,
  };
}

async function backfillAgentHumanMemories({
  db,
  workspaceId,
  agent,
  apply = false,
  scanLimit = DEFAULT_SCAN_LIMIT,
} = {}) {
  const listed = await listAgentMemories({
    db,
    workspaceId,
    agentIdOrUsername: agent?.id || agent?.username,
    includeInternal: true,
    includeExpired: true,
    limit: scanLimit,
    fallbackAgent: agent || {},
  });

  const candidates = collectHumanScopeBackfillCandidates({
    workspaceId,
    agent: listed.agent,
    memories: listed.memories,
  });

  const summary = {
    workspaceId,
    agent: listed.agent,
    dryRun: !apply,
    scanned: listed.memories.length,
    candidates: candidates.length,
    migrated: 0,
    duplicate_targets: 0,
    deleted_sources: 0,
    errors: [],
    has_more: Boolean(listed.has_more || listed.count_is_estimate),
  };

  for (const candidate of candidates) {
    try {
      const result = await applyBackfillCandidate({ db, candidate, apply });
      if (result.duplicate) summary.duplicate_targets += 1;
      if (result.wrote) summary.migrated += 1;
      if (result.deleted) summary.deleted_sources += 1;
    } catch (error) {
      summary.errors.push({
        memory_id: candidate.sourceMemory.id || null,
        message: error.message,
      });
    }
  }

  logMemoryEvent('backfill_human_scope_agent', {
    workspaceId,
    agent: listed.agent?.username || listed.agent?.id || 'unknown-agent',
    dry_run: !apply,
    scanned: summary.scanned,
    candidates: summary.candidates,
    migrated: summary.migrated,
    duplicate_targets: summary.duplicate_targets,
    deleted_sources: summary.deleted_sources,
    errors: summary.errors.length,
    has_more: summary.has_more,
  });

  return summary;
}

async function listWorkspaceAgents(db, workspaceId, agentFilter = null) {
  if (workspaceId && agentFilter) {
    const result = await db.query(
      `SELECT id, username, role, workspace_id
       FROM ${SCHEMA}.agents
       WHERE workspace_id = $1
         AND (id::text = $2 OR username = $2)`,
      [workspaceId, String(agentFilter)]
    );
    return result.rows;
  }

  if (workspaceId) {
    const result = await db.query(
      `SELECT id, username, role, workspace_id
       FROM ${SCHEMA}.agents
       WHERE workspace_id = $1`,
      [workspaceId]
    );
    return result.rows;
  }

  if (agentFilter) {
    const result = await db.query(
      `SELECT id, username, role, workspace_id
       FROM ${SCHEMA}.agents
       WHERE id::text = $1 OR username = $1`,
      [String(agentFilter)]
    );
    return result.rows;
  }

  const result = await db.query(
    `SELECT id, username, role, workspace_id
     FROM ${SCHEMA}.agents`
  );
  return result.rows;
}

async function runHumanMemoryBackfill(db, {
  workspaceId = null,
  agentIdOrUsername = null,
  apply = false,
  scanLimit = DEFAULT_SCAN_LIMIT,
} = {}) {
  const agents = await listWorkspaceAgents(db, workspaceId, agentIdOrUsername);
  const summaries = [];

  for (const agent of agents) {
    summaries.push(await backfillAgentHumanMemories({
      db,
      workspaceId: agent.workspace_id,
      agent,
      apply,
      scanLimit,
    }));
  }

  return {
    workspaceId: workspaceId || null,
    agent_filter: agentIdOrUsername || null,
    dryRun: !apply,
    agents: summaries.length,
    scanned: summaries.reduce((sum, item) => sum + item.scanned, 0),
    candidates: summaries.reduce((sum, item) => sum + item.candidates, 0),
    migrated: summaries.reduce((sum, item) => sum + item.migrated, 0),
    duplicate_targets: summaries.reduce((sum, item) => sum + item.duplicate_targets, 0),
    deleted_sources: summaries.reduce((sum, item) => sum + item.deleted_sources, 0),
    errors: summaries.flatMap((item) => item.errors || []),
    summaries,
  };
}

module.exports = {
  BACKFILL_SOURCE,
  BACKFILL_VERSION,
  DEFAULT_SCAN_LIMIT,
  getHumanContextFromMemory,
  resolveDesiredHumanScope,
  matchesTargetPlacement,
  buildHumanScopeBackfillCandidate,
  collectHumanScopeBackfillCandidates,
  applyBackfillCandidate,
  backfillAgentHumanMemories,
  runHumanMemoryBackfill,
};
