'use strict';

const { rememberScopedMemory } = require('./sniparaMemoryService');
const { filterNovelMemories } = require('./memoryConsolidationService');
const { maybeAutoPromoteMemories } = require('./memoryPromotionService');
const { logMemoryEvent, summarizeMemoryTypes, summarizeMemoryScopes } = require('./memoryTelemetryService');

function compactText(value, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function dedupeMemories(memories) {
  const seen = new Set();
  return memories.filter((memory) => {
    const key = `${memory.scopeKey}|${memory.type}|${memory.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function inferDecisionScope(text) {
  if (/(workspace|global|platform|all agents|tous les agents|organization|organisation)/i.test(text)) return 'global';
  if (/(standard|policy|stack|default|always use|toujours|on utilise|dorénavant|desormais|désormais)/i.test(text)) return 'template';
  return 'instance';
}

function buildMemory(scopeKey, type, visibility, importance, text, metadata = {}) {
  const compact = compactText(text, 500);
  if (compact.length < 12) return null;
  return { scopeKey, type, visibility, importance, text: compact, metadata };
}

function isEmailLike(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function getUserMemoryScope(userId, userName) {
  return userId || userName ? 'human' : 'instance';
}

function getConversationScope(userId, userName) {
  return userId || userName ? 'human_agent' : 'instance';
}

function extractUserIdentityMemories(userName, userId = null) {
  const scopeKey = getUserMemoryScope(userId, userName);
  const normalizedName = compactText(userName, 160);
  if (!normalizedName) return [];

  const label = isEmailLike(normalizedName)
    ? `User contact: ${normalizedName}`
    : `User display name: ${normalizedName}`;
  const memory = buildMemory(
    scopeKey,
    'user_profile',
    'reviewable',
    0.82,
    label,
    {
      memory_lane: 'user_profile',
      source_kind: 'conversation',
      user_id: userId || null,
      user_name: userName || null,
      signal: isEmailLike(normalizedName) ? 'contact' : 'identity',
    }
  );

  return memory ? [memory] : [];
}

function extractUserProfileMemoriesFromText(userText, userName, userId = null) {
  const text = compactText(userText, 500);
  if (!text) return [];

  const memories = [];
  const scopeKey = getUserMemoryScope(userId, userName);
  const add = (importance, textValue, metadata = {}) => {
    const memory = buildMemory(
      scopeKey,
      'user_profile',
      'reviewable',
      importance,
      textValue,
      {
        memory_lane: 'user_profile',
        source_kind: 'conversation',
        user_id: userId || null,
        user_name: userName || null,
        ...metadata,
      }
    );
    if (memory) memories.push(memory);
  };

  const nameMatch = text.match(/(?:my name is|call me|i am called|je m'appelle|je suis|appelle-moi)\s+([^.,!\n;]+)/i);
  if (nameMatch) {
    add(0.92, `User identity: ${compactText(nameMatch[1], 80)}`, { signal: 'identity' });
  }

  const preferencePatterns = [
    /(?:i prefer|i like|i dislike|i want|i need|i usually|i always|i never|je prefere|je préfère|j'aime|je n'aime pas|toujours|jamais|souvent|rarement)/i,
    /(?:reply|answer|respond|speak|write) (?:in|with|using) [^.,!\n;]+/i,
    /(?:use|prefer) (?:codex|claude|anthropic|gpt|openrouter|mistral|groq|google)[^.,!\n;]*/i,
    /(?:timezone|time zone|fuseau horaire|language|langue|locale|dialect)/i,
    /(?:based in|located in|working from|je suis basé|je travaille depuis)/i,
  ];

  const matchedPreference = preferencePatterns.find((pattern) => pattern.test(text));
  if (matchedPreference) {
    add(0.78, `User preference/context: ${text}`, { signal: 'preference', pattern: String(matchedPreference) });
  }

  const roleMatch = text.match(/(?:i am|i'm|je suis)\s+(?:a|an|the)?\s*([^.,!\n;]+?)(?:\s+(?:at|in|from|for|working as|working on|chez|dans)\b|[.,!\n;]|$)/i);
  if (roleMatch) {
    const roleText = compactText(roleMatch[1], 80);
    if (roleText && !/^(here|there|ok|okay|fine|good|ready)$/i.test(roleText)) {
      add(0.7, `User role/background: ${roleText}`, { signal: 'background' });
    }
  }

  const goalMatch = text.match(/(?:i need|i want|i'm trying to|i am trying to|je veux|j'ai besoin de|we need|nous avons besoin de)\s+([^.,!\n;]+)/i);
  if (goalMatch) {
    add(0.66, `User goal: ${compactText(goalMatch[1], 100)}`, { signal: 'goal' });
  }

  const deduped = dedupeMemories(memories.filter(Boolean));
  return deduped;
}

function extractUserProfileMemoriesFromMessages(messages = [], userName, userId = null) {
  const memories = [];
  for (const message of messages || []) {
    const content = typeof message === 'string' ? message : message?.content;
    const role = typeof message === 'object' ? message?.role : null;
    if (role && role !== 'user') continue;
    memories.push(...extractUserProfileMemoriesFromText(content, userName, userId));
  }
  return dedupeMemories(memories);
}

function deriveMemoriesFromConversation({ userMessage, assistantMessage, userId, userName }) {
  const userText = compactText(userMessage, 500);
  const assistantText = compactText(assistantMessage, 500);
  const memories = [];
  memories.push(...extractUserIdentityMemories(userName, userId));
  memories.push(...extractUserProfileMemoriesFromText(userText, userName, userId));

  const decisionSource = [userText, assistantText].find((text) => /(decision|décision|we will|we'll|on utilise|always use|standard|policy|default|desormais|désormais|dorénavant)/i.test(text));
  if (decisionSource) {
    const scopeKey = inferDecisionScope(decisionSource);
    memories.push(buildMemory(
      scopeKey,
      'decision',
      'reviewable',
      0.78,
      `Decision: ${decisionSource}`,
      {
        memory_lane: 'decision',
        source_kind: 'conversation',
        promoted_hint: scopeKey !== 'instance',
        preferred_target_scope: scopeKey === 'instance' ? 'template' : scopeKey,
      }
    ));
  }

  if (userText.length >= 20 && assistantText.length >= 20) {
    memories.push(buildMemory(
      getConversationScope(userId, userName),
      'action_log',
      'internal',
      0.25,
      `Conversation note: User said "${compactText(userText, 180)}" and agent replied "${compactText(assistantText, 180)}"`,
      {
        memory_lane: 'conversation_log',
        source_kind: 'conversation',
        user_id: userId || null,
        user_name: userName || null,
      }
    ));
  }

  return dedupeMemories(memories.filter(Boolean));
}

function deriveTaskEpisodeMemory({ task, response }) {
  const title = compactText(task?.title, 140);
  const result = compactText(response, 320);
  if (!title || result.length < 20) return null;
  return buildMemory(
    'instance',
    'task_episode',
    'internal',
    0.62,
    `Task episode: ${title} -> ${result}`,
    {
      memory_lane: 'task_episode',
      source_kind: 'task',
      task_id: task?.id || null,
      task_priority: task?.priority || null,
    }
  );
}

function deriveToolObservationMemory({ toolName, args, result }) {
  const name = compactText(toolName, 80);
  if (!name) return null;
  const argText = compactText(typeof args === 'string' ? args : JSON.stringify(args || {}), 180);
  const resultPayload = result?.data ?? result ?? null;
  const resultText = compactText(typeof resultPayload === 'string' ? resultPayload : JSON.stringify(resultPayload || {}), 220);
  if (!resultText) return null;

  return buildMemory(
    'instance',
    'tool_observation',
    'internal',
    0.48,
    `Tool observation: ${name}(${argText}) -> ${resultText}`,
    {
      memory_lane: 'tool_observation',
      source_kind: 'tool',
      tool_name: name,
    }
  );
}

async function persistMemories({ db, workspaceId, agent, memories }) {
  const novelMemories = await filterNovelMemories({
    db,
    workspaceId,
    agent,
    memories,
  }).catch(() => memories || []);

  for (const memory of novelMemories) {
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
        source: 'memory-extractor',
        metadata: memory.metadata,
      });
    } catch (err) {
      console.warn('[MemoryExtraction] persist failed:', err.message);
    }
  }

  const accepted = new Set(novelMemories);
  const repeatedMemories = (memories || []).filter((memory) => !accepted.has(memory));

  if (repeatedMemories.length > 0) {
    await maybeAutoPromoteMemories({
      db,
      workspaceId,
      agent,
      memories: repeatedMemories,
    }).catch((err) => {
      console.warn('[MemoryExtraction] promotion failed:', err.message);
    });
  }

  if ((memories || []).length > 0) {
    logMemoryEvent('persist', {
      workspaceId,
      agent: agent?.username || agent?.id || 'unknown-agent',
      attempted: (memories || []).length,
      persisted: novelMemories.length,
      repeated: repeatedMemories.length,
      types: summarizeMemoryTypes(novelMemories),
      scopes: summarizeMemoryScopes(novelMemories),
    });
  }

  return novelMemories;
}

async function extractConversationMemories({ db, workspaceId, agent, userMessage, assistantMessage, userId, userName }) {
  const memories = deriveMemoriesFromConversation({ userMessage, assistantMessage, userId, userName });
  if (memories.length === 0) return [];
  return persistMemories({ db, workspaceId, agent, memories });
}

async function extractTaskMemories({ db, workspaceId, agent, task, response }) {
  const memory = deriveTaskEpisodeMemory({ task, response });
  if (!memory) return [];
  return persistMemories({ db, workspaceId, agent, memories: [memory] });
}

async function recordToolObservation({ db, workspaceId, agent, toolName, args, result }) {
  const memory = deriveToolObservationMemory({ toolName, args, result });
  if (!memory) return null;
  const persisted = await persistMemories({ db, workspaceId, agent, memories: [memory] });
  return persisted[0] || null;
}

module.exports = {
  compactText,
  extractUserIdentityMemories,
  extractUserProfileMemoriesFromText,
  extractUserProfileMemoriesFromMessages,
  inferDecisionScope,
  deriveMemoriesFromConversation,
  deriveTaskEpisodeMemory,
  deriveToolObservationMemory,
  extractConversationMemories,
  extractTaskMemories,
  recordToolObservation,
};
