'use strict';

const {
  extractUserProfileMemoriesFromMessages,
  listAgentMemories,
  rememberScopedMemory,
  softDeleteAgentMemory,
} = require('./sniparaMemoryService');
const { filterNovelMemories } = require('./memoryConsolidationService');
const { isNearDuplicate } = require('./memoryConsolidationService');
const { isMemoryExpired, normalizeType } = require('./memoryPolicy');
const { logMemoryEvent } = require('./memoryTelemetryService');

const SCHEMA = 'tenant_vutler';
const DEFAULT_INTERVAL_MS = Number(process.env.MEMORY_MAINTENANCE_INTERVAL_MS) || (6 * 60 * 60 * 1000);
const MAINTENANCE_SCAN_LIMIT = Number(process.env.MEMORY_MAINTENANCE_SCAN_LIMIT) || 1000;
const SHORT_LIVED_TYPES = new Set(['action_log', 'tool_observation', 'task_episode', 'context']);
const DEDUPE_TYPES = new Set(['user_profile', 'decision', 'fact']);
const TYPE_LIMITS = {
  action_log: 20,
  tool_observation: 12,
  task_episode: 10,
  fact: Number(process.env.MEMORY_FACT_LIMIT_PER_AGENT) || 750,
};
const USER_PROFILE_HARVEST_CHANNEL_LIMIT = Number(process.env.MEMORY_USER_PROFILE_CHANNEL_LIMIT) || 6;
const USER_PROFILE_HARVEST_MESSAGE_LIMIT = Number(process.env.MEMORY_USER_PROFILE_MESSAGE_LIMIT) || 80;

function retentionScore(memory) {
  const importance = Number(memory?.importance) || 0;
  const usage = Number(memory?.usage_count) || 0;
  const promotion = Number(memory?.promotion_score) || 0;
  const createdAt = new Date(memory?.created_at || 0).getTime();
  const freshness = Number.isFinite(createdAt) ? Math.max(0, 1 - ((Date.now() - createdAt) / (30 * 24 * 60 * 60 * 1000))) : 0;
  return Number(((importance * 0.45) + (Math.min(usage, 6) / 6 * 0.25) + (Math.min(promotion, 3) / 3 * 0.15) + (freshness * 0.15)).toFixed(4));
}

function collectMaintenanceCandidates(memories = []) {
  const byType = new Map();
  const deletions = new Map();

  const markForDeletion = (memory, reason) => {
    if (!memory?.id || deletions.has(memory.id)) return;
    deletions.set(memory.id, { id: memory.id, type: memory.type, reason, memory });
  };

  for (const memory of memories) {
    const type = normalizeType(memory?.type);
    if (SHORT_LIVED_TYPES.has(type) && isMemoryExpired(memory)) {
      markForDeletion(memory, 'expired_short_lived');
      continue;
    }

    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(memory);
  }

  for (const [type, items] of byType.entries()) {
    if (DEDUPE_TYPES.has(type)) {
      const sorted = [...items].sort((left, right) => retentionScore(right) - retentionScore(left));
      const kept = [];
      for (const memory of sorted) {
        const duplicate = kept.find((existing) => isNearDuplicate(memory, existing));
        if (duplicate) {
          markForDeletion(memory, 'duplicate_compaction');
          continue;
        }
        kept.push(memory);
      }
    }

    const typeLimit = TYPE_LIMITS[type];
    if (typeLimit && items.length > typeLimit) {
      const overflow = [...items]
        .sort((left, right) => retentionScore(right) - retentionScore(left))
        .slice(typeLimit);

      for (const memory of overflow) {
        markForDeletion(memory, 'overflow_compaction');
      }
    }
  }

  return Array.from(deletions.values());
}

async function harvestAgentUserProfiles({ db, workspaceId, agent }) {
  if (!agent?.id && !agent?.username) return { harvested: [] };

  const channelsResult = await db.query(
    `SELECT cm.channel_id, MAX(m.created_at) AS last_message_at
     FROM ${SCHEMA}.chat_channel_members cm
     LEFT JOIN ${SCHEMA}.chat_messages m ON m.channel_id = cm.channel_id AND m.workspace_id = $2
     WHERE cm.user_id = $1
     GROUP BY cm.channel_id
     ORDER BY last_message_at DESC NULLS LAST
     LIMIT $3`,
    [String(agent.id || agent.username), workspaceId, USER_PROFILE_HARVEST_CHANNEL_LIMIT]
  );

  const harvested = [];
  const agentKey = String(agent.id || agent.username || '').toLowerCase();

  for (const channelRow of channelsResult.rows) {
    const membersResult = await db.query(
      `SELECT a.id, a.username
       FROM ${SCHEMA}.chat_channel_members cm
       JOIN ${SCHEMA}.agents a ON a.id::text = cm.user_id OR LOWER(a.username) = LOWER(cm.user_id)
       WHERE cm.channel_id = $1 AND a.workspace_id = $2`,
      [channelRow.channel_id, workspaceId]
    );
    const assistantIds = new Set(
      membersResult.rows.flatMap((row) => [
        String(row.id || '').toLowerCase(),
        String(row.username || '').toLowerCase(),
      ]).filter(Boolean)
    );

    const messagesResult = await db.query(
      `SELECT sender_id, sender_name, content, created_at
       FROM ${SCHEMA}.chat_messages
       WHERE channel_id = $1 AND workspace_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [channelRow.channel_id, workspaceId, USER_PROFILE_HARVEST_MESSAGE_LIMIT]
    );

    const userMessages = messagesResult.rows
      .filter((message) => {
        const senderId = String(message.sender_id || '').toLowerCase();
        return !assistantIds.has(senderId) && senderId !== agentKey;
      })
      .map((message) => ({
        role: 'user',
        content: String(message.content || ''),
      }));

    const memories = extractUserProfileMemoriesFromMessages(userMessages, agent.username || agent.name || null);
    const payload = memories.map((memory) => ({
      ...memory,
      metadata: {
        ...memory.metadata,
        source_kind: 'chat_history',
        channel_id: channelRow.channel_id,
      },
    }));

    if (payload.length === 0) continue;

    const novelPayload = await filterNovelMemories({
      db,
      workspaceId,
      agent,
      memories: payload,
    }).catch(() => payload);

    const persisted = [];
    for (const memory of novelPayload) {
      try {
        await rememberScopedMemory({
          db,
          workspaceId,
          agent,
          scopeKey: memory.scopeKey,
          text: memory.text,
          type: memory.type,
          importance: memory.importance,
          visibility: memory.visibility,
          source: 'memory-user-profile-harvest',
          metadata: memory.metadata,
        });
        persisted.push(memory);
      } catch (err) {
        console.warn('[MemoryMaintenance] user profile harvest failed:', err.message);
      }
    }

    harvested.push(...persisted);
  }

  return { harvested };
}

async function maintainAgentMemories({ db, workspaceId, agent }) {
  const listed = await listAgentMemories({
    db,
    workspaceId,
    agentIdOrUsername: agent?.id || agent?.username,
    includeInternal: true,
    includeExpired: true,
    limit: MAINTENANCE_SCAN_LIMIT,
    fallbackAgent: agent || {},
  });

  const candidates = collectMaintenanceCandidates(listed.memories);
  const deleted = [];
  const harvestedProfiles = await harvestAgentUserProfiles({ db, workspaceId, agent: listed.agent }).catch(() => ({ harvested: [] }));

  for (const candidate of candidates) {
    try {
      await softDeleteAgentMemory({
        db,
        workspaceId,
        agent: listed.agent,
        memoryId: candidate.id,
      });
      deleted.push(candidate);
    } catch (err) {
      console.warn('[MemoryMaintenance] delete failed:', err.message);
    }
  }

  logMemoryEvent('maintenance_agent', {
    workspaceId,
    agent: listed.agent?.username || listed.agent?.id || 'unknown-agent',
    scanned: listed.memories.length,
    deleted: deleted.length,
    harvested_user_profiles: harvestedProfiles.harvested.length,
    reasons: deleted.reduce((acc, item) => {
      acc[item.reason] = (acc[item.reason] || 0) + 1;
      return acc;
    }, {}),
  });

  return {
    agent: listed.agent,
    scanned: listed.memories.length,
    deleted,
    harvested_user_profiles: harvestedProfiles.harvested.length,
  };
}

async function runWorkspaceMemoryMaintenance(db, workspaceId) {
  const result = await db.query(
    `SELECT id, username, role, workspace_id
     FROM ${SCHEMA}.agents
     WHERE workspace_id = $1`,
    [workspaceId]
  );

  const summaries = [];
  for (const agent of result.rows) {
    summaries.push(await maintainAgentMemories({ db, workspaceId, agent }));
  }

  return {
    workspaceId,
    agents: summaries.length,
    deleted: summaries.reduce((sum, item) => sum + item.deleted.length, 0),
    summaries,
  };
}

class MemoryMaintenanceService {
  constructor(db, options = {}) {
    this.db = db;
    this.intervalMs = options.intervalMs || DEFAULT_INTERVAL_MS;
    this.workspaceId = options.workspaceId || null;
    this._timer = null;
    this._running = false;
  }

  async tick() {
    if (this._running) return null;
    this._running = true;

    try {
      if (this.workspaceId) {
        return await runWorkspaceMemoryMaintenance(this.db, this.workspaceId);
      }

      const rows = await this.db.query(
        `SELECT DISTINCT workspace_id
         FROM ${SCHEMA}.agents
         ORDER BY workspace_id`
      );

      const results = [];
      for (const row of rows.rows) {
        results.push(await runWorkspaceMemoryMaintenance(this.db, row.workspace_id));
      }

      logMemoryEvent('maintenance_tick', {
        workspaces: results.length,
        deleted: results.reduce((sum, item) => sum + item.deleted, 0),
      });

      return results;
    } finally {
      this._running = false;
    }
  }

  start() {
    if (this._timer) return;
    console.log(`[MemoryMaintenance] Started (interval: ${this.intervalMs}ms)`);
    this._timer = setInterval(() => {
      this.tick().catch((err) => {
        console.error('[MemoryMaintenance] tick error:', err.message);
      });
    }, this.intervalMs);
  }

  stop() {
    if (!this._timer) return;
    clearInterval(this._timer);
    this._timer = null;
    console.log('[MemoryMaintenance] Stopped');
  }
}

module.exports = {
  DEFAULT_INTERVAL_MS,
  collectMaintenanceCandidates,
  maintainAgentMemories,
  runWorkspaceMemoryMaintenance,
  MemoryMaintenanceService,
};
