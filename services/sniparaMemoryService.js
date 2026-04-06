'use strict';

const fs = require('fs');
const path = require('path');
const { callSniparaTool, serializeSniparaError } = require('./sniparaResolver');
const {
  normalizeType,
  normalizeScopeKey,
  getDefaultVisibility,
  getDefaultScopeKey,
  getMemoryTypePolicy,
  getRuntimeBudget,
  getScopeWeight,
  buildGovernanceMetadata,
  isMemoryExpired,
  isInjectableMemory,
  isPromotableMemory,
} = require('./memoryPolicy');
const { logMemoryEvent, summarizeMemoryTypes } = require('./memoryTelemetryService');

const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';
const DEFAULT_COUNT_LIMIT = 200;
const SNIPARA_MEMORY_LIST_TIMEOUT_MS = Number(process.env.SNIPARA_MEMORY_LIST_TIMEOUT_MS || 30_000);
const SNIPARA_MEMORY_RECALL_TIMEOUT_MS = Number(process.env.SNIPARA_MEMORY_RECALL_TIMEOUT_MS || 30_000);
const SNIPARA_MEMORY_WRITE_TIMEOUT_MS = Number(process.env.SNIPARA_MEMORY_WRITE_TIMEOUT_MS || 20_000);
const SNIPARA_MEMORY_DOCUMENT_TIMEOUT_MS = Number(process.env.SNIPARA_MEMORY_DOCUMENT_TIMEOUT_MS || 20_000);

function normalizeWorkspaceId(workspaceId) {
  return workspaceId || DEFAULT_WORKSPACE;
}

async function callSniparaMemoryTool(invocation) {
  try {
    return await callSniparaTool(invocation);
  } catch (error) {
    if (error?.code !== 'circuit_open') throw error;
    return callSniparaTool({
      ...invocation,
      bypassFailureCache: true,
    });
  }
}

function normalizeRole(role) {
  return String(role || 'general').toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'general';
}

function normalizeImportance(value, fallback = 0.5) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (num > 1) return Math.min(1, Math.max(0, num / 10));
  return Math.min(1, Math.max(0, num));
}

function deriveAgentRef(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const match = raw.match(/(?:^|-)agent-([a-z0-9][a-z0-9-_]*[a-z0-9])$/i);
  if (match?.[1]) return match[1];

  return raw;
}

function normalizeMemoryRef(value, fallback = '') {
  return String(value || '').trim().toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || fallback;
}

function normalizeHumanContext(humanContext = {}) {
  if (!humanContext || typeof humanContext !== 'object') return null;
  const id = String(humanContext.id || humanContext.userId || humanContext.senderId || '').trim() || null;
  const name = String(humanContext.name || humanContext.userName || humanContext.senderName || '').trim() || null;
  if (!id && !name) return null;
  return {
    id,
    name,
    ref: normalizeMemoryRef(id || name, 'unknown-human'),
  };
}

function buildAgentMemoryBindings(agent = {}, workspaceId = DEFAULT_WORKSPACE, humanContext = null) {
  const ws = normalizeWorkspaceId(workspaceId);
  const agentRef = deriveAgentRef(
    agent.username ||
    agent.memory_scope ||
    agent.snipara_instance_id ||
    agent.id ||
    agent.agent_id ||
    'unknown-agent'
  );
  const role = normalizeRole(agent.role);
  const normalizedHuman = normalizeHumanContext(humanContext);
  const canonicalAgentCategory = String(agent.snipara_instance_id || '').trim();
  const aliasAgentCategory = `${ws}-agent-${agentRef}`;
  const instanceCategories = [...new Set([
    canonicalAgentCategory,
    aliasAgentCategory,
  ].filter(Boolean))];
  const humanBindings = normalizedHuman
    ? {
        id: normalizedHuman.id,
        name: normalizedHuman.name,
        ref: normalizedHuman.ref,
        scope: 'project',
        category: `${ws}-human-${normalizedHuman.ref}`,
      }
    : null;
  const relationshipBindings = normalizedHuman
    ? {
        id: normalizedHuman.id,
        name: normalizedHuman.name,
        ref: normalizedHuman.ref,
        scope: 'agent',
        category: `${ws}-agent-${agentRef}-human-${normalizedHuman.ref}`,
      }
    : null;

  return {
    workspaceId: ws,
    agentId: agent.snipara_instance_id || agent.id || agent.agent_id || null,
    sniparaInstanceId: agent.snipara_instance_id || null,
    agentRef,
    role,
    humanId: normalizedHuman?.id || null,
    humanName: normalizedHuman?.name || null,
    humanRef: normalizedHuman?.ref || null,
    instance: {
      scope: 'agent',
      category: instanceCategories[0] || aliasAgentCategory,
      categories: instanceCategories,
    },
    template: { scope: 'project', category: `${ws}-template-${role}` },
    global: { scope: 'project', category: `${ws}-platform-standards` },
    human: humanBindings,
    human_agent: relationshipBindings,
  };
}

async function resolveAgentRecord(db, workspaceId, agentIdOrUsername, fallback = {}) {
  const ws = normalizeWorkspaceId(workspaceId);
  if (db && agentIdOrUsername) {
    const result = await db.query(
      `SELECT *
       FROM tenant_vutler.agents
       WHERE workspace_id = $2 AND (id::text = $1 OR username = $1)
       LIMIT 1`,
      [String(agentIdOrUsername), ws]
    );
    if (result.rows[0]) return { ...fallback, ...result.rows[0] };
  }

  return {
    id: fallback.id || null,
    name: fallback.name || fallback.username || String(agentIdOrUsername || 'Unknown Agent'),
    username: fallback.username || String(agentIdOrUsername || 'unknown-agent'),
    role: fallback.role || 'general',
    model: fallback.model || null,
    provider: fallback.provider || null,
    system_prompt: fallback.system_prompt || '',
    temperature: fallback.temperature,
    max_tokens: fallback.max_tokens,
    workspace_id: ws,
    snipara_instance_id: fallback.snipara_instance_id || fallback.sniparaInstanceId || null,
  };
}

function getRawMemoryArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.memories)) return raw.memories;
  if (Array.isArray(raw.results)) return raw.results;
  if (Array.isArray(raw.items)) return raw.items;
  return [];
}

function getMemorySearchTerms(agent = {}, bindings = null, query = '') {
  const terms = [
    query,
    bindings?.agentRef,
    agent.username,
    agent.name,
    agent.snipara_instance_id,
    agent.sniparaInstanceId,
    agent.memory_scope,
    bindings?.agentId,
  ];
  return String(terms.find((term) => String(term || '').trim()) || '').trim();
}

function memoryCategoryMatches(memory, categories = [], agentRef = '', agentId = '') {
  const category = String(memory?.category || '').trim().toLowerCase();
  if (!category) return false;

  const normalizedCategories = categories.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
  if (normalizedCategories.includes(category)) return true;

  const loweredRef = String(agentRef || '').trim().toLowerCase();
  if (loweredRef && category.includes(loweredRef)) return true;

  const loweredId = String(agentId || '').trim().toLowerCase();
  if (loweredId && category.includes(loweredId)) return true;

  return false;
}

function normalizeListedMemory(raw, fallbackScope, index = 0) {
  const type = normalizeType(raw?.type || 'fact');
  const scopeKey = normalizeScopeKey(raw?.scope || fallbackScope);
  const visibility = getDefaultVisibility(type);
  const createdAt = raw?.created_at || new Date().toISOString();
  const governance = buildGovernanceMetadata({
    type,
    scopeKey,
    visibility,
    createdAt,
    metadata: {
      source: raw?.source || 'snipara',
      confidence: raw?.confidence,
      access_count: raw?.access_count,
    },
  });

  return {
    id: raw?.memory_id || raw?.id || `mem-${scopeKey}-${index}`,
    text: raw?.content || raw?.text || raw?.description || '',
    type,
    importance: normalizeImportance(raw?.confidence, 0.5),
    scope: raw?.scope || toScopeName(scopeKey),
    scope_key: scopeKey,
    category: raw?.category || governance.category || undefined,
    created_at: createdAt,
    expires_at: raw?.expires_at || governance.expires_at || null,
    last_seen_at: createdAt,
    last_used_at: null,
    usage_count: Number(raw?.access_count) || 0,
    duplicate_count: 0,
    promotion_score: 0,
    metadata: governance,
    visibility: governance.visibility,
    status: isMemoryExpired({ expires_at: raw?.expires_at || governance.expires_at, metadata: governance }) ? 'expired' : 'active',
  };
}

function inferVisibility(memory) {
  if (memory?.metadata && typeof memory.metadata === 'object' && memory.metadata.visibility) {
    return memory.metadata.visibility;
  }
  return getDefaultVisibility(memory?.type);
}

function canonicalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  return canonicalizeText(text)
    .split(' ')
    .filter((token) => token.length > 2);
}

const LOW_SIGNAL_QUERY_TOKENS = new Set([
  'about',
  'avec',
  'code',
  'current',
  'dans',
  'for',
  'from',
  'memo',
  'memory',
  'note',
  'only',
  'pour',
  'project',
  'projet',
  'recall',
  'remember',
  'reply',
  'respond',
  'response',
  'tell',
  'the',
  'this',
  'uniquement',
  'user',
  'what',
  'with',
]);

function getQueryTokenWeight(token) {
  let weight = 1;
  if (LOW_SIGNAL_QUERY_TOKENS.has(token)) weight -= 0.45;
  if (token.length >= 6) weight += 0.35;
  if (token.length >= 10) weight += 0.25;
  if (/\d/.test(token)) weight += 1.4;
  return Math.max(0.35, Number(weight.toFixed(3)));
}

function computeWeightedQueryCoverage(query, text) {
  const queryTokens = [...new Set(tokenize(query))];
  const memoryTokens = new Set(tokenize(text));
  if (queryTokens.length === 0 || memoryTokens.size === 0) return 0;

  let matchedWeight = 0;
  let totalWeight = 0;
  for (const token of queryTokens) {
    const weight = getQueryTokenWeight(token);
    totalWeight += weight;
    if (memoryTokens.has(token)) matchedWeight += weight;
  }

  if (totalWeight <= 0) return 0;
  return matchedWeight / totalWeight;
}

function computeDistinctiveTokenCoverage(query, text) {
  const queryTokens = [...new Set(tokenize(query))];
  const distinctiveTokens = queryTokens.filter((token) => /\d/.test(token) || token.length >= 7);
  if (distinctiveTokens.length === 0) return computeWeightedQueryCoverage(query, text);

  const memoryTokens = new Set(tokenize(text));
  let matchedWeight = 0;
  let totalWeight = 0;
  for (const token of distinctiveTokens) {
    const weight = getQueryTokenWeight(token);
    totalWeight += weight;
    if (memoryTokens.has(token)) matchedWeight += weight;
  }

  if (totalWeight <= 0) return 0;
  return matchedWeight / totalWeight;
}

function computeCueTokenMatch(query, text) {
  const queryTokens = [...new Set(tokenize(query))];
  const numericTokens = queryTokens.filter((token) => /\d/.test(token));
  const cueTokens = numericTokens.length > 0
    ? numericTokens
    : queryTokens.filter((token) => !LOW_SIGNAL_QUERY_TOKENS.has(token) && token.length >= 5);
  if (cueTokens.length === 0) return 0;

  const memoryTokens = new Set(tokenize(text));
  let matchedWeight = 0;
  let totalWeight = 0;
  for (const token of cueTokens) {
    const weight = getQueryTokenWeight(token);
    totalWeight += weight;
    if (memoryTokens.has(token)) matchedWeight += weight;
  }

  if (totalWeight <= 0) return 0;
  return matchedWeight / totalWeight;
}

function computeQueryPhraseCoverage(query, text) {
  const normalizedQuery = canonicalizeText(query);
  const normalizedText = canonicalizeText(text);
  if (!normalizedQuery || !normalizedText) return 0;
  if (normalizedText.includes(normalizedQuery)) return 1;

  const queryTokens = tokenize(query);
  if (queryTokens.length < 2) return 0;

  let best = 0;
  for (let size = Math.min(5, queryTokens.length); size >= 2; size -= 1) {
    for (let start = 0; start <= queryTokens.length - size; start += 1) {
      const phrase = queryTokens.slice(start, start + size).join(' ');
      if (!phrase) continue;
      if (normalizedText.includes(phrase)) {
        best = Math.max(best, size / queryTokens.length);
      }
    }
    if (best > 0) break;
  }

  return best;
}

function computeTokenOverlap(left, right) {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }

  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function toScopeName(scopeKey) {
  if (scopeKey === 'instance') return 'agent';
  if (scopeKey === 'template') return 'template';
  if (scopeKey === 'global') return 'global';
  if (scopeKey === 'human') return 'human';
  if (scopeKey === 'human_agent') return 'human_agent';
  return scopeKey || 'agent';
}

function normalizeMemory(raw, fallbackScope, index = 0) {
  const metadata = raw && typeof raw.metadata === 'object' && raw.metadata !== null ? raw.metadata : {};
  const type = normalizeType(raw?.type || metadata.type || 'fact');
  const scopeKey = normalizeScopeKey(raw?.scope_key || raw?.scopeKey || metadata.memory_scope_key || fallbackScope);
  const visibility = raw?.visibility || inferVisibility({ ...raw, type, metadata });
  const createdAt = raw?.created_at || raw?.createdAt || metadata.created_at || new Date().toISOString();
  const governance = buildGovernanceMetadata({
    type,
    scopeKey,
    visibility,
    createdAt,
    metadata,
  });

  return {
    id: raw?.id || raw?.memory_id || `mem-${scopeKey}-${index}`,
    text: raw?.text || raw?.content || raw?.description || '',
    type,
    importance: normalizeImportance(raw?.importance, 0.5),
    scope: raw?.scope || toScopeName(scopeKey),
    scope_key: scopeKey,
    category: raw?.category || governance.category || undefined,
    created_at: governance.created_at,
    expires_at: governance.expires_at || null,
    last_seen_at: governance.last_seen_at || governance.created_at,
    last_used_at: governance.last_used_at || null,
    usage_count: Number(governance.usage_count) || 0,
    duplicate_count: Number(governance.duplicate_count) || 0,
    promotion_score: Number(governance.promotion_score) || 0,
    agent_id: raw?.agent_id || raw?.agentId || governance.agent_id || undefined,
    metadata: governance,
    visibility: governance.visibility,
    status: isMemoryExpired({ expires_at: governance.expires_at, metadata: governance }) ? 'expired' : 'active',
  };
}

function normalizeMemories(raw, fallbackScope) {
  return getRawMemoryArray(raw).map((memory, index) => normalizeMemory(memory, fallbackScope, index));
}

function isDeletedMemory(memory) {
  if (!memory) return true;
  if (memory.metadata && typeof memory.metadata === 'object' && memory.metadata.deleted) return true;
  return /^\[DELETED memory /i.test(String(memory.text || '').trim());
}

function filterDashboardMemories(memories = [], includeInternal = false, options = {}) {
  const includeExpired = options.includeExpired === true;
  return memories.filter((memory) => {
    if (isDeletedMemory(memory)) return false;
    if (!includeExpired && isMemoryExpired(memory)) return false;
    if (!includeInternal && memory.visibility === 'internal') return false;
    return true;
  });
}

function summarizeMemoryCollection(memories = [], includeInternal = false, options = {}) {
  const includeExpired = options.includeExpired === true;
  let deletedCount = 0;
  let expiredCount = 0;
  let hiddenCount = 0;
  const visible = [];

  for (const memory of memories) {
    if (isDeletedMemory(memory)) {
      deletedCount += 1;
      continue;
    }
    if (isMemoryExpired(memory)) {
      expiredCount += 1;
      if (!includeExpired) continue;
    }
    if (!includeInternal && memory.visibility === 'internal') {
      hiddenCount += 1;
      continue;
    }
    visible.push(memory);
  }

  return {
    visible,
    total_count: memories.length,
    visible_count: visible.length,
    hidden_count: hiddenCount,
    expired_count: expiredCount,
    deleted_count: deletedCount,
    active_count: Math.max(0, memories.length - expiredCount - deletedCount),
  };
}

function ageInDays(value) {
  const timestamp = new Date(value || 0).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 365;
  return Math.max(0, (Date.now() - timestamp) / (24 * 60 * 60 * 1000));
}

function computeFreshnessScore(memory) {
  const policy = getMemoryTypePolicy(memory?.type);
  const ttl = Math.max(1, Number(policy.ttlDays) || 90);
  const referenceDate = memory?.last_seen_at || memory?.created_at;
  const ageRatio = ageInDays(referenceDate) / ttl;
  return Math.max(0.12, 1 - ageRatio);
}

function computeUsageScore(memory) {
  const usage = Math.min(1, (Number(memory?.usage_count) || 0) / 6);
  const duplicates = Math.min(1, (Number(memory?.duplicate_count) || 0) / 4);
  const promotion = Math.min(1, (Number(memory?.promotion_score) || 0) / 3);
  return (usage * 0.5) + (duplicates * 0.2) + (promotion * 0.3);
}

function memoryMatchesHumanContext(memory, humanContext = null) {
  const normalizedHuman = normalizeHumanContext(humanContext);
  if (!normalizedHuman) return true;

  const metadata = memory?.metadata || {};
  const memoryUserId = String(metadata.user_id || memory?.user_id || '').trim();
  if (memoryUserId) return memoryUserId === normalizedHuman.id;

  const memoryUserName = String(metadata.user_name || memory?.user_name || '').trim().toLowerCase();
  if (memoryUserName && normalizedHuman.name) return memoryUserName === normalizedHuman.name.toLowerCase();

  const memoryText = String(memory?.text || '').toLowerCase();
  if (normalizedHuman.name && memoryText.includes(normalizedHuman.name.toLowerCase())) return true;

  return false;
}

function scoreMemoryForRuntime(memory, { query = '', runtime = 'chat', scopeKey } = {}) {
  if (!memory || isDeletedMemory(memory) || isMemoryExpired(memory)) return -1;
  if (runtime !== 'dashboard' && !isInjectableMemory(memory)) return -1;

  const effectiveScope = normalizeScopeKey(scopeKey || memory.scope_key || memory.metadata?.memory_scope_key || memory.scope);
  const policy = getMemoryTypePolicy(memory.type);
  const queryOverlapScore = query ? computeTokenOverlap(query, memory.text) : 0.45;
  const queryCoverageScore = query ? computeWeightedQueryCoverage(query, memory.text) : 0.45;
  const distinctiveCoverageScore = query ? computeDistinctiveTokenCoverage(query, memory.text) : 0.45;
  const cueScore = query ? computeCueTokenMatch(query, memory.text) : 0.35;
  const phraseScore = query ? computeQueryPhraseCoverage(query, memory.text) : 0.35;
  const queryScore = query
    ? (
      (queryOverlapScore * 0.14)
      + (queryCoverageScore * 0.28)
      + (distinctiveCoverageScore * 0.3)
      + (cueScore * 0.2)
      + (phraseScore * 0.08)
    )
    : 0.45;
  const importanceScore = normalizeImportance(memory.importance, 0.5);
  const freshnessScore = computeFreshnessScore(memory);
  const usageScore = computeUsageScore(memory);

  const baseScore = (queryScore * 0.68) + (importanceScore * 0.14) + (freshnessScore * 0.1) + (usageScore * 0.08);
  return Number((baseScore * policy.retrievalWeight * getScopeWeight(effectiveScope, runtime)).toFixed(4));
}

function rankMemories(memories = [], options = {}) {
  return memories
    .map((memory) => ({
      ...memory,
      retrieval_score: scoreMemoryForRuntime(memory, options),
    }))
    .filter((memory) => memory.retrieval_score >= 0)
    .sort((left, right) => {
      if (right.retrieval_score !== left.retrieval_score) return right.retrieval_score - left.retrieval_score;
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    });
}

function compactRankedMemories(memories = []) {
  const seen = new Set();
  const compacted = [];

  for (const memory of memories) {
    const key = `${memory.type}|${canonicalizeText(memory.text)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    compacted.push(memory);
  }

  return compacted;
}

async function listStoredMemories({ db, workspaceId, search, limit = 50, offset = 0 }) {
  const pageSize = Math.max(1, Math.min(50, limit));
  let raw = null;
  let error = null;

  try {
    raw = await callSniparaMemoryTool({
      db,
      workspaceId,
      toolName: 'rlm_memories',
      args: {
        search,
        limit: pageSize,
        offset,
      },
      timeoutMs: SNIPARA_MEMORY_LIST_TIMEOUT_MS,
    });
  } catch (err) {
    error = serializeSniparaError(err);
    console.warn('[SniparaMemory] listStoredMemories failed:', {
      workspaceId: normalizeWorkspaceId(workspaceId),
      search,
      status_code: error?.status_code || null,
      message: error?.message || String(err?.message || err),
    });
  }

  if (!raw) {
    return { memories: [], has_more: false, raw_count: 0, error };
  }

  const memories = getRawMemoryArray(raw).map((memory, index) => normalizeListedMemory(memory, 'agent', index));
  return {
    memories,
    has_more: Boolean(raw.has_more),
    raw_count: memories.length,
    error,
  };
}

async function collectStoredScopeMemories({
  db,
  workspaceId,
  bindings,
  scopeKey,
  search,
  limit = 50,
}) {
  const collected = [];
  const pageSize = Math.max(1, Math.min(50, limit));
  let offset = 0;
  let hasMore = true;
  let error = null;

  while (hasMore && collected.length < limit) {
    const page = await listStoredMemories({
      db,
      workspaceId,
      search,
      limit: pageSize,
      offset,
    });

    if (page.error && !error) error = page.error;
    if (page.error) break;

    const batch = (page.memories || []).filter((memory) => {
      if (scopeKey === 'instance') {
        return memory.scope === 'agent' && memoryCategoryMatches(memory, bindings.instance.categories, bindings.agentRef, bindings.agentId);
      }
      if (scopeKey === 'human' && bindings.human) {
        return memory.scope === 'project' && memoryCategoryMatches(memory, [bindings.human.category], bindings.human.ref, bindings.human.id);
      }
      if (scopeKey === 'human_agent' && bindings.human_agent) {
        return memory.scope === 'agent'
          && memoryCategoryMatches(memory, [bindings.human_agent.category], bindings.human_agent.ref, bindings.agentId);
      }
      if (scopeKey === 'template') {
        return memory.scope === 'project' && memoryCategoryMatches(memory, [bindings.template.category], bindings.role, bindings.role);
      }
      if (scopeKey === 'global') {
        return memory.scope === 'project' && memoryCategoryMatches(memory, [bindings.global.category], 'platform-standards', bindings.workspaceId);
      }
      return true;
    });

    collected.push(...batch);
    hasMore = page.has_more;

    if (!page.memories || page.memories.length === 0) break;
    offset += page.memories.length;
  }

  return {
    memories: collected.slice(0, limit),
    has_more: hasMore || collected.length >= limit,
    error,
  };
}

async function loadDocumentFromCandidates({ db, workspaceId, paths = [] }) {
  for (const path of paths) {
    const doc = await callSniparaMemoryTool({
      db,
      workspaceId,
      toolName: 'rlm_load_document',
      args: { path },
      timeoutMs: SNIPARA_MEMORY_DOCUMENT_TIMEOUT_MS,
    }).catch(() => '');

    if (!doc) continue;

    if (typeof doc === 'object' && doc !== null && !Array.isArray(doc)) {
      if (doc.error || doc.message?.includes?.('Document not found')) {
        continue;
      }

      const text = typeof doc.content === 'string'
        ? doc.content.trim()
        : typeof doc.text === 'string'
          ? doc.text.trim()
          : JSON.stringify(doc).trim();
      if (text) return text;
      continue;
    }

    const text = String(doc).trim();
    if (!text) continue;
    if (text.startsWith('{"error":') || text.includes('"Document not found"')) continue;
    return text;
  }

  const localSoulPaths = [
    path.resolve(__dirname, '..', 'SOUL.md'),
    path.resolve(process.cwd(), 'SOUL.md'),
  ];

  for (const localPath of localSoulPaths) {
    try {
      const text = fs.readFileSync(localPath, 'utf8').trim();
      if (text) return text;
    } catch (_) {}
  }

  return '';
}

function selectRuntimeMemories({
  human = [],
  human_agent = [],
  instance = [],
  template = [],
  global = [],
  query = '',
  runtime = 'chat',
}) {
  const budget = getRuntimeBudget(runtime);
  const rankedByScope = {
    human: compactRankedMemories(rankMemories(human, { query, runtime, scopeKey: 'human' })).slice(0, budget.human || 0),
    human_agent: compactRankedMemories(rankMemories(human_agent, { query, runtime, scopeKey: 'human_agent' })).slice(0, budget.human_agent || 0),
    instance: compactRankedMemories(rankMemories(instance, { query, runtime, scopeKey: 'instance' })).slice(0, budget.instance),
    template: compactRankedMemories(rankMemories(template, { query, runtime, scopeKey: 'template' })).slice(0, budget.template),
    global: compactRankedMemories(rankMemories(global, { query, runtime, scopeKey: 'global' })).slice(0, budget.global),
  };

  const combined = [...rankedByScope.human, ...rankedByScope.human_agent, ...rankedByScope.instance, ...rankedByScope.template, ...rankedByScope.global]
    .sort((left, right) => right.retrieval_score - left.retrieval_score)
    .slice(0, budget.total);

  const selectedIds = new Set(combined.map((memory) => memory.id));
  const selectedByScope = {
    human: rankedByScope.human.filter((memory) => selectedIds.has(memory.id)),
    human_agent: rankedByScope.human_agent.filter((memory) => selectedIds.has(memory.id)),
    instance: rankedByScope.instance.filter((memory) => selectedIds.has(memory.id)),
    template: rankedByScope.template.filter((memory) => selectedIds.has(memory.id)),
    global: rankedByScope.global.filter((memory) => selectedIds.has(memory.id)),
  };

  return {
    selected: combined,
    selectedByScope,
    stats: {
      runtime,
      query,
      budget,
      recalled: {
        human: human.length,
        human_agent: human_agent.length,
        instance: instance.length,
        template: template.length,
        global: global.length,
      },
      selected: {
        total: combined.length,
        human: selectedByScope.human.length,
        human_agent: selectedByScope.human_agent.length,
        instance: selectedByScope.instance.length,
        template: selectedByScope.template.length,
        global: selectedByScope.global.length,
      },
    },
  };
}

async function recallWithBindings({ db, workspaceId, bindings, query, limit = 20, scopeKey = 'instance' }) {
  const normalizedScope = normalizeScopeKey(scopeKey);
  const target = bindings[normalizedScope];
  if (!target) return [];
  const categories = [...new Set([
    ...(Array.isArray(target?.categories) ? target.categories : []),
    target?.category,
  ].filter(Boolean))];
  const agentId = bindings.agentId || bindings.sniparaInstanceId || bindings.agentRef;
  const merged = [];
  const seen = new Set();

  for (const category of categories) {
    const args = { query, scope: target.scope, category, limit };
    if (normalizedScope === 'instance' && agentId) args.agent_id = agentId;
    if (normalizedScope === 'human_agent' && agentId) args.agent_id = agentId;

    const raw = await callSniparaMemoryTool({
      db,
      workspaceId,
      toolName: 'rlm_recall',
      args,
      timeoutMs: SNIPARA_MEMORY_RECALL_TIMEOUT_MS,
    }).catch(() => []);
    const normalized = normalizeMemories(raw, normalizedScope);
    for (const memory of normalized) {
      const dedupeKey = memory.id || `${memory.scope_key}|${canonicalizeText(memory.text)}|${memory.created_at}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      merged.push(memory);
    }
    if (merged.length >= limit) break;
  }

  return merged.slice(0, limit);
}

async function listAgentMemories({ db, workspaceId, agentIdOrUsername, query, role, limit = 20, includeInternal = false, includeExpired = false, fallbackAgent = {} }) {
  const agent = await resolveAgentRecord(db, workspaceId, agentIdOrUsername, { ...fallbackAgent, role: role || fallbackAgent.role });
  const bindings = buildAgentMemoryBindings(agent, workspaceId);
  const stored = await collectStoredScopeMemories({
    db,
    workspaceId,
    bindings,
    scopeKey: 'instance',
    search: getMemorySearchTerms(agent, bindings, query || bindings.agentRef || 'agent'),
    limit,
  });
  let rawMemories = stored.memories || [];
  let sniparaError = stored.error || null;
  if (rawMemories.length === 0) {
    try {
      rawMemories = await recallWithBindings({
        db,
        workspaceId,
        bindings,
        query: query || `agent ${bindings.agentRef} memories`,
        limit,
        scopeKey: 'instance',
      });
    } catch (error) {
      sniparaError = sniparaError || serializeSniparaError(error);
      rawMemories = [];
    }
  }
  const summary = summarizeMemoryCollection(rawMemories, includeInternal, { includeExpired });
  return {
    agent,
    bindings,
    memories: summary.visible,
    raw_count: rawMemories.length,
    count: summary.visible_count,
    total_count: summary.total_count,
    visible_count: summary.visible_count,
    hidden_count: summary.hidden_count,
    expired_count: summary.expired_count,
    deleted_count: summary.deleted_count,
    has_more: stored.has_more || rawMemories.length >= limit,
    count_is_estimate: stored.has_more || rawMemories.length >= limit,
    snipara_error: sniparaError,
  };
}

async function listTemplateMemories({ db, workspaceId, agentIdOrUsername, role, query, limit = 20, includeInternal = false, includeExpired = false, fallbackAgent = {} }) {
  const agent = await resolveAgentRecord(db, workspaceId, agentIdOrUsername, { ...fallbackAgent, role: role || fallbackAgent.role });
  const bindings = buildAgentMemoryBindings(agent, workspaceId);
  const stored = await collectStoredScopeMemories({
    db,
    workspaceId,
    bindings,
    scopeKey: 'template',
    search: getMemorySearchTerms(agent, bindings, query || bindings.role || 'template'),
    limit,
  });
  let rawMemories = stored.memories || [];
  let sniparaError = stored.error || null;
  if (rawMemories.length === 0) {
    try {
      rawMemories = await recallWithBindings({
        db,
        workspaceId,
        bindings,
        query: query || `${bindings.role} knowledge best practices`,
        limit,
        scopeKey: 'template',
      });
    } catch (error) {
      sniparaError = sniparaError || serializeSniparaError(error);
      rawMemories = [];
    }
  }
  const summary = summarizeMemoryCollection(rawMemories, includeInternal, { includeExpired });
  return {
    agent,
    bindings,
    memories: summary.visible,
    raw_count: rawMemories.length,
    count: summary.visible_count,
    total_count: summary.total_count,
    visible_count: summary.visible_count,
    hidden_count: summary.hidden_count,
    expired_count: summary.expired_count,
    deleted_count: summary.deleted_count,
    has_more: stored.has_more || rawMemories.length >= limit,
    count_is_estimate: stored.has_more || rawMemories.length >= limit,
    snipara_error: sniparaError,
  };
}

async function loadWorkspaceKnowledge({ db, workspaceId }) {
  const content = await loadDocumentFromCandidates({
    db,
    workspaceId,
    paths: ['SOUL.md', 'agents/SOUL.md'],
  });

  return {
    content,
    updatedAt: '',
    readOnly: true,
  };
}

async function buildAgentContext({ db, workspaceId, agentIdOrUsername, role, includeInternal = false, fallbackAgent = {} }) {
  const agent = await resolveAgentRecord(db, workspaceId, agentIdOrUsername, { ...fallbackAgent, role: role || fallbackAgent.role });
  const bindings = buildAgentMemoryBindings(agent, workspaceId);
  const agentSoulPaths = [
    `agents/${bindings.agentRef}/SOUL.md`,
    `agents/${bindings.agentRef}/MEMORY.md`,
    'agents/SOUL.md',
    'SOUL.md',
  ];

  const [storedInstance, storedTemplate, storedGlobal, soulDoc] = await Promise.all([
    collectStoredScopeMemories({ db, workspaceId, bindings, scopeKey: 'instance', search: getMemorySearchTerms(agent, bindings, bindings.agentRef), limit: DEFAULT_COUNT_LIMIT }).catch((error) => ({ memories: [], error: serializeSniparaError(error) })),
    collectStoredScopeMemories({ db, workspaceId, bindings, scopeKey: 'template', search: getMemorySearchTerms(agent, bindings, bindings.role), limit: DEFAULT_COUNT_LIMIT }).catch((error) => ({ memories: [], error: serializeSniparaError(error) })),
    collectStoredScopeMemories({ db, workspaceId, bindings, scopeKey: 'global', search: 'platform standards guardrails policies defaults', limit: DEFAULT_COUNT_LIMIT }).catch((error) => ({ memories: [], error: serializeSniparaError(error) })),
    loadDocumentFromCandidates({ db, workspaceId, paths: agentSoulPaths }),
  ]);

  const sniparaErrors = {
    instance: storedInstance.error || null,
    template: storedTemplate.error || null,
    global: storedGlobal.error || null,
  };

  let instanceRaw = storedInstance.memories || [];
  let templateRaw = storedTemplate.memories || [];
  let globalRaw = storedGlobal.memories || [];

  if (instanceRaw.length === 0) {
    try {
      instanceRaw = await recallWithBindings({ db, workspaceId, bindings, query: bindings.agentRef, limit: DEFAULT_COUNT_LIMIT, scopeKey: 'instance' });
    } catch (error) {
      sniparaErrors.instance = sniparaErrors.instance || serializeSniparaError(error);
      instanceRaw = [];
    }
  }
  if (templateRaw.length === 0) {
    try {
      templateRaw = await recallWithBindings({ db, workspaceId, bindings, query: bindings.role, limit: DEFAULT_COUNT_LIMIT, scopeKey: 'template' });
    } catch (error) {
      sniparaErrors.template = sniparaErrors.template || serializeSniparaError(error);
      templateRaw = [];
    }
  }
  if (globalRaw.length === 0) {
    try {
      globalRaw = await recallWithBindings({ db, workspaceId, bindings, query: 'platform standards guardrails policies defaults', limit: DEFAULT_COUNT_LIMIT, scopeKey: 'global' });
    } catch (error) {
      sniparaErrors.global = sniparaErrors.global || serializeSniparaError(error);
      globalRaw = [];
    }
  }

  const instanceSummary = summarizeMemoryCollection(instanceRaw, includeInternal);
  const templateSummary = summarizeMemoryCollection(templateRaw, includeInternal);
  const globalSummary = summarizeMemoryCollection(globalRaw, includeInternal);

  return {
    agent,
    bindings,
    memories: [...instanceSummary.visible, ...templateSummary.visible, ...globalSummary.visible],
    context: `Agent ${bindings.agentRef} — ${instanceSummary.visible_count}${instanceRaw.length >= DEFAULT_COUNT_LIMIT ? '+' : ''} personal, ${templateSummary.visible_count}${templateRaw.length >= DEFAULT_COUNT_LIMIT ? '+' : ''} role, ${globalSummary.visible_count}${globalRaw.length >= DEFAULT_COUNT_LIMIT ? '+' : ''} workspace memories available`,
    soul: typeof soulDoc === 'string' ? soulDoc : JSON.stringify(soulDoc || ''),
    role: bindings.role,
    instance_count: instanceSummary.visible_count,
    template_count: templateSummary.visible_count,
    global_count: globalSummary.visible_count,
    hidden_instance_count: instanceSummary.hidden_count,
    hidden_template_count: templateSummary.hidden_count,
    hidden_global_count: globalSummary.hidden_count,
    expired_instance_count: instanceSummary.expired_count,
    expired_template_count: templateSummary.expired_count,
    expired_global_count: globalSummary.expired_count,
    instance_count_is_estimate: instanceRaw.length >= DEFAULT_COUNT_LIMIT,
    template_count_is_estimate: templateRaw.length >= DEFAULT_COUNT_LIMIT,
    global_count_is_estimate: globalRaw.length >= DEFAULT_COUNT_LIMIT,
    snipara_errors: Object.values(sniparaErrors).some(Boolean) ? sniparaErrors : null,
  };
}

async function rememberScopedMemory({
  db,
  workspaceId,
  agent,
  humanContext = null,
  scopeKey = 'instance',
  text,
  type = 'fact',
  importance = 0.5,
  visibility,
  source = 'vutler',
  metadata = {},
}) {
  const normalizedType = normalizeType(type);
  const effectiveScopeKey = normalizeScopeKey(scopeKey || metadata.memory_scope_key || getDefaultScopeKey(normalizedType));
  const effectiveHumanContext = humanContext || (
    metadata && (metadata.user_id || metadata.user_name)
      ? {
          id: metadata.user_id || null,
          name: metadata.user_name || null,
        }
      : null
  );
  const bindings = buildAgentMemoryBindings(agent, workspaceId, effectiveHumanContext);
  const target = bindings[effectiveScopeKey] || bindings.instance;
  const normalizedImportance = normalizeImportance(importance);
  const baseMetadata = buildGovernanceMetadata({
    type: normalizedType,
    scopeKey: effectiveScopeKey,
    visibility: visibility || metadata.visibility || getDefaultVisibility(normalizedType),
    createdAt: metadata.created_at,
    metadata,
  });
  const typePolicy = getMemoryTypePolicy(normalizedType);

  const args = {
    text,
    type: normalizedType,
    importance: normalizedImportance,
    scope: target.scope,
    category: target.category,
    metadata: {
      ...baseMetadata,
      source,
      memory_scope_key: effectiveScopeKey,
      memory_type: normalizedType,
      agent_id: bindings.agentId || baseMetadata.agent_id || undefined,
      agent_username: bindings.agentRef,
      user_id: bindings.humanId || baseMetadata.user_id || undefined,
      user_name: bindings.humanName || baseMetadata.user_name || undefined,
      promotion_candidate: baseMetadata.promotion_candidate ?? isPromotableMemory({ type: normalizedType }),
      promotion_score: Math.max(
        Number(baseMetadata.promotion_score) || 0,
        Number((normalizedImportance * typePolicy.promotionWeight).toFixed(4))
      ),
    },
  };
  if (effectiveScopeKey === 'instance') args.agent_id = bindings.agentId || bindings.sniparaInstanceId || bindings.agentRef;
  if (effectiveScopeKey === 'human_agent') args.agent_id = bindings.agentId || bindings.sniparaInstanceId || bindings.agentRef;

  await callSniparaMemoryTool({
    db,
    workspaceId,
    toolName: 'rlm_remember',
    args,
    timeoutMs: SNIPARA_MEMORY_WRITE_TIMEOUT_MS,
  });

  return target;
}

async function rememberAgentMemory({ db, workspaceId, agent, text, type = 'fact', importance = 0.5, visibility = 'reviewable', source = 'vutler', metadata = {} }) {
  return rememberScopedMemory({
    db,
    workspaceId,
    agent,
    scopeKey: 'instance',
    text,
    type,
    importance,
    visibility,
    source,
    metadata,
  });
}

async function softDeleteAgentMemory({ db, workspaceId, agent, memoryId }) {
  return rememberScopedMemory({
    db,
    workspaceId,
    agent,
    scopeKey: 'instance',
    text: `[DELETED memory ${memoryId}]`,
    type: 'fact',
    importance: 0,
    visibility: 'internal',
    source: 'vutler-delete',
    metadata: { deleted: true, memory_id: memoryId, deleted_at: new Date().toISOString() },
  });
}

async function promoteAgentMemoryToTemplate({ db, workspaceId, agent, memoryId, role }) {
  const bindings = buildAgentMemoryBindings({ ...agent, role: role || agent.role }, workspaceId);
  const recalled = await callSniparaMemoryTool({
    db,
    workspaceId,
    toolName: 'rlm_recall',
    args: {
      query: `memory_id:${memoryId}`,
      agent_id: bindings.agentId || bindings.sniparaInstanceId || bindings.agentRef,
      scope: bindings.instance.scope,
      category: bindings.instance.category,
      limit: 1,
    },
    timeoutMs: SNIPARA_MEMORY_RECALL_TIMEOUT_MS,
  }).catch(() => []);

  const raw = JSON.stringify(recalled || '');
  if (raw.length < 30 || /greet|hello|bonjour|salut/i.test(raw)) {
    const err = new Error('Memory not relevant enough for template promotion');
    err.statusCode = 422;
    throw err;
  }

  await rememberScopedMemory({
    db,
    workspaceId,
    agent: { ...agent, role: role || agent.role },
    scopeKey: 'template',
    text: `Promoted from agent ${bindings.agentRef} (${memoryId}): ${raw.substring(0, 1200)}`,
    type: 'fact',
    importance: 0.7,
    visibility: 'reviewable',
    source: 'vutler-promote',
    metadata: {
      source_agent_id: bindings.agentId || null,
      source_agent_username: bindings.agentRef,
      source_memory_id: memoryId,
      promoted_from: 'instance',
      promoted_at: new Date().toISOString(),
    },
  });

  return bindings.template;
}

function stringifyMemoryList(memories = []) {
  return memories
    .slice(0, 12)
    .map((memory) => `- [${memory.type}] ${String(memory.text || '').trim()}`)
    .join('\n');
}

function buildHumanMemoryQuery(query, humanContext = null) {
  const normalizedHuman = normalizeHumanContext(humanContext);
  return [
    query,
    normalizedHuman?.name,
    normalizedHuman?.id,
    'user preferences language timezone style goals profile',
  ].filter(Boolean).join(' ').trim() || 'user preferences profile';
}

function buildRelationshipMemoryQuery(query, humanContext = null, bindings = null) {
  const normalizedHuman = normalizeHumanContext(humanContext);
  return [
    query,
    normalizedHuman?.name,
    bindings?.agentRef,
    'previous interactions working context open threads',
  ].filter(Boolean).join(' ').trim() || 'previous interactions';
}

function filterRuntimeMemoriesForHuman(memories = [], humanContext = null, scopeKey = 'instance') {
  if (!humanContext || !Array.isArray(memories)) return memories;
  if (scopeKey !== 'instance' && scopeKey !== 'human' && scopeKey !== 'human_agent') return memories;

  return memories.filter((memory) => {
    if (memory?.type !== 'user_profile') return true;
    return memoryMatchesHumanContext(memory, humanContext);
  });
}

async function buildRuntimeMemoryBundle({ db, workspaceId, agent, humanContext = null, query = '', runtime = 'chat' }) {
  if (!agent) {
    return {
      prompt: '',
      memories: [],
      stats: { runtime, query, budget: getRuntimeBudget(runtime), recalled: {}, selected: { total: 0, human: 0, human_agent: 0, instance: 0, template: 0, global: 0 } },
      sections: { human: [], human_agent: [], instance: [], template: [], global: [] },
    };
  }

  const bindings = buildAgentMemoryBindings(agent, workspaceId, humanContext);
  const [human, humanAgent, instance, template, global] = await Promise.all([
    bindings.human
      ? recallWithBindings({
          db,
          workspaceId,
          bindings,
          query: buildHumanMemoryQuery(query, humanContext),
          limit: 12,
          scopeKey: 'human',
        }).catch(() => [])
      : Promise.resolve([]),
    bindings.human_agent
      ? recallWithBindings({
          db,
          workspaceId,
          bindings,
          query: buildRelationshipMemoryQuery(query, humanContext, bindings),
          limit: 8,
          scopeKey: 'human_agent',
        }).catch(() => [])
      : Promise.resolve([]),
    recallWithBindings({ db, workspaceId, bindings, query: query || `${bindings.agentRef} current user context and working memory`, limit: 18, scopeKey: 'instance' }).catch(() => []),
    recallWithBindings({ db, workspaceId, bindings, query: `${bindings.role} template best practices role instructions`, limit: 14, scopeKey: 'template' }).catch(() => []),
    recallWithBindings({ db, workspaceId, bindings, query: 'platform standards guardrails policies defaults', limit: 10, scopeKey: 'global' }).catch(() => []),
  ]);

  const selection = selectRuntimeMemories({
    human: filterRuntimeMemoriesForHuman(human, humanContext, 'human'),
    human_agent: filterRuntimeMemoriesForHuman(humanAgent, humanContext, 'human_agent'),
    instance: filterRuntimeMemoriesForHuman(instance, humanContext, 'instance'),
    template,
    global,
    query,
    runtime,
  });
  const sections = [];
  if (selection.selectedByScope.human.length > 0) sections.push(`## Human Memory\n${stringifyMemoryList(selection.selectedByScope.human)}`);
  if (selection.selectedByScope.human_agent.length > 0) sections.push(`## Relationship Memory\n${stringifyMemoryList(selection.selectedByScope.human_agent)}`);
  if (selection.selectedByScope.instance.length > 0) sections.push(`## Agent Memory\n${stringifyMemoryList(selection.selectedByScope.instance)}`);
  if (selection.selectedByScope.template.length > 0) sections.push(`## Role Memory\n${stringifyMemoryList(selection.selectedByScope.template)}`);
  if (selection.selectedByScope.global.length > 0) sections.push(`## Workspace Memory\n${stringifyMemoryList(selection.selectedByScope.global)}`);

  const bundle = {
    prompt: sections.join('\n\n').trim(),
    memories: selection.selected,
    stats: selection.stats,
    sections: selection.selectedByScope,
  };

  logMemoryEvent('bundle', {
    workspaceId,
    agent: agent?.username || agent?.id || 'unknown-agent',
    runtime,
    query,
    selected: selection.stats.selected,
    types: summarizeMemoryTypes(selection.selected),
  });

  return bundle;
}

async function buildRuntimeMemoryPrompt({ db, workspaceId, agent, humanContext = null, query = '', runtime = 'chat' }) {
  const bundle = await buildRuntimeMemoryBundle({ db, workspaceId, agent, humanContext, query, runtime });
  return bundle.prompt;
}

module.exports = {
  DEFAULT_WORKSPACE,
  DEFAULT_COUNT_LIMIT,
  normalizeWorkspaceId,
  normalizeRole,
  normalizeImportance,
  buildAgentMemoryBindings,
  normalizeHumanContext,
  resolveAgentRecord,
  normalizeMemories,
  filterDashboardMemories,
  summarizeMemoryCollection,
  scoreMemoryForRuntime,
  rankMemories,
  listAgentMemories,
  listTemplateMemories,
  loadWorkspaceKnowledge,
  buildAgentContext,
  rememberScopedMemory,
  rememberAgentMemory,
  softDeleteAgentMemory,
  promoteAgentMemoryToTemplate,
  buildRuntimeMemoryBundle,
  buildRuntimeMemoryPrompt,
};
