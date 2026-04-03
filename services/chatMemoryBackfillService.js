'use strict';

const {
  deriveMemoriesFromConversation,
  extractUserIdentityMemories,
  extractUserProfileMemoriesFromText,
} = require('./memoryExtractionService');
const { filterNovelMemories } = require('./memoryConsolidationService');
const { rememberScopedMemory } = require('./sniparaMemoryService');
const { logMemoryEvent } = require('./memoryTelemetryService');

const SCHEMA = 'tenant_vutler';
const DEFAULT_CHAT_SCAN_LIMIT = Number(process.env.MEMORY_CHAT_BACKFILL_SCAN_LIMIT) || 200;
const CHAT_BACKFILL_SOURCE = 'chat-history-memory-backfill';
const CHAT_BACKFILL_VERSION = 'v1';

function compactText(value, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function dedupeMemories(memories = []) {
  const seen = new Set();
  return (memories || []).filter((memory) => {
    const key = `${memory.scopeKey}|${memory.type}|${memory.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function agentMessageMatches(message = {}, agent = {}) {
  const senderId = String(message.sender_id || '').trim().toLowerCase();
  const senderName = String(message.sender_name || '').trim().toLowerCase();
  const agentIds = [
    agent.id,
    agent.agent_id,
    agent.username,
    agent.name,
  ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);

  return agentIds.includes(senderId) || agentIds.includes(senderName);
}

function buildConversationEpisodes(messages = [], agent = {}) {
  const ordered = [...(messages || [])].sort((left, right) => {
    return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
  });
  const episodes = [];
  const standalone = [];
  let pendingUser = null;

  for (const message of ordered) {
    if (!message || !String(message.content || '').trim()) continue;

    if (agentMessageMatches(message, agent)) {
      if (pendingUser) {
        episodes.push({
          userMessage: pendingUser,
          assistantMessage: message,
        });
        pendingUser = null;
      }
      continue;
    }

    if (pendingUser) standalone.push({ userMessage: pendingUser });
    pendingUser = message;
  }

  if (pendingUser) standalone.push({ userMessage: pendingUser });
  return { episodes, standalone };
}

function resolveHumanName(messages = [], fallbackName = null, agent = {}) {
  for (const message of [...(messages || [])].reverse()) {
    if (!message || agentMessageMatches(message, agent)) continue;
    const name = compactText(message.sender_name, 160);
    if (name) return name;
  }

  return compactText(fallbackName, 160) || null;
}

function appendMemoryMetadata(memory = {}, metadata = {}) {
  return {
    ...memory,
    metadata: {
      ...(memory.metadata || {}),
      ...metadata,
    },
  };
}

function deriveChatHistoryMemories({ messages = [], humanContext = null, agent = {} }) {
  const humanName = resolveHumanName(messages, humanContext?.name || null, agent);
  const effectiveHuman = {
    id: humanContext?.id || null,
    name: humanName || humanContext?.name || null,
  };
  const derived = [];

  derived.push(...extractUserIdentityMemories(effectiveHuman.name, effectiveHuman.id));

  const { episodes, standalone } = buildConversationEpisodes(messages, agent);
  for (const episode of episodes) {
    const memories = deriveMemoriesFromConversation({
      userMessage: episode.userMessage?.content || '',
      assistantMessage: episode.assistantMessage?.content || '',
      userId: effectiveHuman.id,
      userName: effectiveHuman.name,
    }).map((memory) => appendMemoryMetadata(memory, {
      backfill_channel_id: episode.userMessage?.channel_id || null,
      backfill_user_message_id: episode.userMessage?.id || null,
      backfill_assistant_message_id: episode.assistantMessage?.id || null,
      backfill_source_kind: 'chat_episode',
    }));
    derived.push(...memories);
  }

  for (const entry of standalone) {
    const memories = extractUserProfileMemoriesFromText(
      entry.userMessage?.content || '',
      effectiveHuman.name,
      effectiveHuman.id
    ).map((memory) => appendMemoryMetadata(memory, {
      backfill_channel_id: entry.userMessage?.channel_id || null,
      backfill_user_message_id: entry.userMessage?.id || null,
      backfill_source_kind: 'user_message',
    }));
    derived.push(...memories);
  }

  return dedupeMemories(derived.filter(Boolean));
}

async function listEligibleChatChannels(db, workspaceId) {
  const result = await db.query(
    `SELECT c.id AS channel_id,
            c.type,
            c.created_by,
            c.created_at,
            c.updated_at,
            m.user_id,
            a.id::text AS agent_id,
            a.username AS agent_username,
            a.name AS agent_name
       FROM ${SCHEMA}.chat_channels c
       JOIN ${SCHEMA}.chat_channel_members m
         ON m.channel_id = c.id
       LEFT JOIN ${SCHEMA}.agents a
         ON a.workspace_id = c.workspace_id
        AND a.id::text = m.user_id
      WHERE c.workspace_id = $1
        AND c.type IN ('dm', 'direct')
      ORDER BY COALESCE(c.updated_at, c.created_at) DESC, c.created_at DESC`,
    [workspaceId]
  );

  const grouped = new Map();
  for (const row of result.rows || []) {
    const key = String(row.channel_id);
    if (!grouped.has(key)) {
      grouped.set(key, {
        channelId: key,
        type: row.type,
        createdBy: row.created_by || null,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
        agents: [],
        humans: [],
      });
    }

    const entry = grouped.get(key);
    if (row.agent_id) {
      if (!entry.agents.find((agent) => String(agent.id) === String(row.agent_id))) {
        entry.agents.push({
          id: row.agent_id,
          username: row.agent_username || null,
          name: row.agent_name || row.agent_username || null,
        });
      }
    } else if (row.user_id) {
      if (!entry.humans.includes(String(row.user_id))) {
        entry.humans.push(String(row.user_id));
      }
    }
  }

  return [...grouped.values()]
    .filter((entry) => entry.agents.length === 1 && entry.humans.length === 1)
    .map((entry) => ({
      channelId: entry.channelId,
      agent: entry.agents[0],
      humanId: entry.humans[0],
      createdBy: entry.createdBy,
      updatedAt: entry.updatedAt,
      createdAt: entry.createdAt,
    }));
}

async function loadChannelMessages({ db, workspaceId, channelId, scanLimit = DEFAULT_CHAT_SCAN_LIMIT }) {
  const result = await db.query(
    `SELECT id,
            channel_id,
            sender_id,
            sender_name,
            content,
            created_at
       FROM ${SCHEMA}.chat_messages
      WHERE workspace_id = $1
        AND channel_id = $2
      ORDER BY created_at ASC
      LIMIT $3`,
    [workspaceId, channelId, scanLimit]
  );

  return result.rows || [];
}

async function persistBootstrapMemories({
  db,
  workspaceId,
  agent,
  memories = [],
  apply = false,
}) {
  const novel = await filterNovelMemories({
    db,
    workspaceId,
    agent,
    memories,
  }).catch(() => memories || []);

  if (!apply) {
    return {
      attempted: (memories || []).length,
      novel: novel.length,
      persisted: 0,
    };
  }

  for (const memory of novel) {
    await rememberScopedMemory({
      db,
      workspaceId,
      agent,
      scopeKey: memory.scopeKey,
      text: memory.text,
      type: memory.type,
      importance: memory.importance,
      visibility: memory.visibility,
      source: CHAT_BACKFILL_SOURCE,
      metadata: {
        ...(memory.metadata || {}),
        backfill_chat_history_version: CHAT_BACKFILL_VERSION,
        backfill_chat_history_at: new Date().toISOString(),
      },
    });
  }

  return {
    attempted: (memories || []).length,
    novel: novel.length,
    persisted: novel.length,
  };
}

async function runChatHistoryMemoryBackfill(db, {
  workspaceId,
  agentIdOrUsername = null,
  humanId = null,
  apply = false,
  scanLimit = DEFAULT_CHAT_SCAN_LIMIT,
} = {}) {
  const channels = await listEligibleChatChannels(db, workspaceId);
  const filteredChannels = channels.filter((entry) => {
    const agentMatches = !agentIdOrUsername
      || String(entry.agent.id) === String(agentIdOrUsername)
      || String(entry.agent.username || '') === String(agentIdOrUsername);
    const humanMatches = !humanId || String(entry.humanId) === String(humanId);
    return agentMatches && humanMatches;
  });

  const summary = {
    workspaceId,
    agent_filter: agentIdOrUsername || null,
    human_filter: humanId || null,
    dryRun: !apply,
    channels: filteredChannels.length,
    scanned_messages: 0,
    attempted_memories: 0,
    novel_memories: 0,
    persisted_memories: 0,
    summaries: [],
    errors: [],
  };

  for (const channel of filteredChannels) {
    try {
      const messages = await loadChannelMessages({
        db,
        workspaceId,
        channelId: channel.channelId,
        scanLimit,
      });
      const derived = deriveChatHistoryMemories({
        messages,
        humanContext: { id: channel.humanId },
        agent: channel.agent,
      });
      const persisted = await persistBootstrapMemories({
        db,
        workspaceId,
        agent: channel.agent,
        memories: derived,
        apply,
      });

      const channelSummary = {
        channel_id: channel.channelId,
        agent: channel.agent.username || channel.agent.id,
        human_id: channel.humanId,
        scanned_messages: messages.length,
        attempted_memories: derived.length,
        novel_memories: persisted.novel,
        persisted_memories: persisted.persisted,
      };

      summary.scanned_messages += messages.length;
      summary.attempted_memories += derived.length;
      summary.novel_memories += persisted.novel;
      summary.persisted_memories += persisted.persisted;
      summary.summaries.push(channelSummary);

      logMemoryEvent('backfill_chat_history_channel', {
        workspaceId,
        ...channelSummary,
        dry_run: !apply,
      });
    } catch (error) {
      summary.errors.push({
        channel_id: channel.channelId,
        message: error.message,
      });
    }
  }

  return summary;
}

module.exports = {
  DEFAULT_CHAT_SCAN_LIMIT,
  CHAT_BACKFILL_SOURCE,
  CHAT_BACKFILL_VERSION,
  agentMessageMatches,
  buildConversationEpisodes,
  deriveChatHistoryMemories,
  listEligibleChatChannels,
  loadChannelMessages,
  runChatHistoryMemoryBackfill,
};
