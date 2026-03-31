'use strict';

const fs = require('fs');
const path = require('path');
const { callSniparaTool } = require('./sniparaResolver');
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

function normalizeWorkspaceId(workspaceId) {
  return workspaceId || DEFAULT_WORKSPACE;
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

function buildAgentMemoryBindings(agent = {}, workspaceId = DEFAULT_WORKSPACE) {
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
  const canonicalAgentCategory = String(agent.snipara_instance_id || '').trim();
  const aliasAgentCategory = `${ws}-agent-${agentRef}`;
  const instanceCategories = [...new Set([
    canonicalAgentCategory,
    aliasAgentCategory,
  ].filter(Boolean))];

  return {
    workspaceId: ws,
    agentId: agent.snipara_instance_id || agent.id || agent.agent_id || null,
    sniparaInstanceId: agent.snipara_instance_id || null,
    agentRef,
    role,
    instance: {
      scope: 'agent',
      category: instanceCategories[0] || aliasAgentCategory,
      categories: instanceCategories,
    },
    template: { scope: 'project', category: `${ws}-template-${role}` },
    global: { scope: 'project', category: `${ws}-platform-standards` },
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
    if (result.rows[0]) return result.rows[0];
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

function scoreMemoryForRuntime(memory, { query = '', runtime = 'chat', scopeKey } = {}) {
  if (!memory || isDeletedMemory(memory) || isMemoryExpired(memory)) return -1;
  if (runtime !== 'dashboard' && !isInjectableMemory(memory)) return -1;

  const effectiveScope = normalizeScopeKey(scopeKey || memory.scope_key || memory.metadata?.memory_scope_key || memory.scope);
  const policy = getMemoryTypePolicy(memory.type);
  const queryScore = query ? computeTokenOverlap(query, memory.text) : 0.45;
  const importanceScore = normalizeImportance(memory.importance, 0.5);
  const freshnessScore = computeFreshnessScore(memory);
  const usageScore = computeUsageScore(memory);

  const baseScore = (queryScore * 0.42) + (importanceScore * 0.28) + (freshnessScore * 0.18) + (usageScore * 0.12);
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
  const raw = await callSniparaTool({
    db,
    workspaceId,
    toolName: 'rlm_memories',
    args: {
      search,
      limit: pageSize,
      offset,
    },
  }).catch(() => null);

  if (!raw) {
    return { memories: [], has_more: false, raw_count: 0 };
  }

  const memories = getRawMemoryArray(raw).map((memory, index) => normalizeListedMemory(memory, 'agent', index));
  return {
    memories,
    has_more: Boolean(raw.has_more),
    raw_count: memories.length,
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

  while (hasMore && collected.length < limit) {
    const page = await listStoredMemories({
      db,
      workspaceId,
      search,
      limit: pageSize,
      offset,
    });

    const batch = (page.memories || []).filter((memory) => {
      if (scopeKey === 'instance') {
        return memory.scope === 'agent' && memoryCategoryMatches(memory, bindings.instance.categories, bindings.agentRef, bindings.agentId);
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
  };
}

async function loadWorkspaceSoulDocument({ db, workspaceId }) {
  const paths = ['SOUL.md', 'agents/SOUL.md'];
  for (const path of paths) {
    const doc = await callSniparaTool({
      db,
      workspaceId,
      toolName: 'rlm_load_document',
      args: { path },
    }).catch(() => '');

    const text = typeof doc === 'string' ? doc.trim() : JSON.stringify(doc || '').trim();
    if (text) return text;
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

function selectRuntimeMemories({ instance = [], template = [], global = [], query = '', runtime = 'chat' }) {
  const budget = getRuntimeBudget(runtime);
  const rankedByScope = {
    instance: compactRankedMemories(rankMemories(instance, { query, runtime, scopeKey: 'instance' })).slice(0, budget.instance),
    template: compactRankedMemories(rankMemories(template, { query, runtime, scopeKey: 'template' })).slice(0, budget.template),
    global: compactRankedMemories(rankMemories(global, { query, runtime, scopeKey: 'global' })).slice(0, budget.global),
  };

  const combined = [...rankedByScope.instance, ...rankedByScope.template, ...rankedByScope.global]
    .sort((left, right) => right.retrieval_score - left.retrieval_score)
    .slice(0, budget.total);

  const selectedIds = new Set(combined.map((memory) => memory.id));
  const selectedByScope = {
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
        instance: instance.length,
        template: template.length,
        global: global.length,
      },
      selected: {
        total: combined.length,
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

    const raw = await callSniparaTool({ db, workspaceId, toolName: 'rlm_recall', args }).catch(() => []);
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
  if (rawMemories.length === 0) {
    rawMemories = await recallWithBindings({
      db,
      workspaceId,
      bindings,
      query: query || `agent ${bindings.agentRef} memories`,
      limit,
      scopeKey: 'instance',
    });
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
  if (rawMemories.length === 0) {
    rawMemories = await recallWithBindings({
      db,
      workspaceId,
      bindings,
      query: query || `${bindings.role} knowledge best practices`,
      limit,
      scopeKey: 'template',
    });
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
  };
}

async function loadWorkspaceKnowledge({ db, workspaceId }) {
  const content = await loadWorkspaceSoulDocument({ db, workspaceId });

  return {
    content,
    updatedAt: '',
    readOnly: true,
  };
}

async function buildAgentContext({ db, workspaceId, agentIdOrUsername, role, includeInternal = false, fallbackAgent = {} }) {
  const agent = await resolveAgentRecord(db, workspaceId, agentIdOrUsername, { ...fallbackAgent, role: role || fallbackAgent.role });
  const bindings = buildAgentMemoryBindings(agent, workspaceId);

  const [storedInstance, storedTemplate, storedGlobal, soulDoc] = await Promise.all([
    collectStoredScopeMemories({ db, workspaceId, bindings, scopeKey: 'instance', search: getMemorySearchTerms(agent, bindings, bindings.agentRef), limit: DEFAULT_COUNT_LIMIT }).catch(() => ({ memories: [] })),
    collectStoredScopeMemories({ db, workspaceId, bindings, scopeKey: 'template', search: getMemorySearchTerms(agent, bindings, bindings.role), limit: DEFAULT_COUNT_LIMIT }).catch(() => ({ memories: [] })),
    collectStoredScopeMemories({ db, workspaceId, bindings, scopeKey: 'global', search: 'platform standards guardrails policies defaults', limit: DEFAULT_COUNT_LIMIT }).catch(() => ({ memories: [] })),
    loadWorkspaceSoulDocument({ db, workspaceId }),
  ]);

  const [instanceRaw, templateRaw, globalRaw] = await Promise.all([
    storedInstance.memories.length > 0 ? storedInstance.memories : recallWithBindings({ db, workspaceId, bindings, query: bindings.agentRef, limit: DEFAULT_COUNT_LIMIT, scopeKey: 'instance' }).catch(() => []),
    storedTemplate.memories.length > 0 ? storedTemplate.memories : recallWithBindings({ db, workspaceId, bindings, query: bindings.role, limit: DEFAULT_COUNT_LIMIT, scopeKey: 'template' }).catch(() => []),
    storedGlobal.memories.length > 0 ? storedGlobal.memories : recallWithBindings({ db, workspaceId, bindings, query: 'platform standards guardrails policies defaults', limit: DEFAULT_COUNT_LIMIT, scopeKey: 'global' }).catch(() => []),
  ]);

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
  };
}

async function rememberScopedMemory({
  db,
  workspaceId,
  agent,
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
  const bindings = buildAgentMemoryBindings(agent, workspaceId);
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
      promotion_candidate: baseMetadata.promotion_candidate ?? isPromotableMemory({ type: normalizedType }),
      promotion_score: Math.max(
        Number(baseMetadata.promotion_score) || 0,
        Number((normalizedImportance * typePolicy.promotionWeight).toFixed(4))
      ),
    },
  };
  if (effectiveScopeKey === 'instance') args.agent_id = bindings.agentId || bindings.sniparaInstanceId || bindings.agentRef;

  await callSniparaTool({
    db,
    workspaceId,
    toolName: 'rlm_remember',
    args,
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
  const recalled = await callSniparaTool({
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

async function buildRuntimeMemoryBundle({ db, workspaceId, agent, query = '', runtime = 'chat' }) {
  if (!agent) {
    return {
      prompt: '',
      memories: [],
      stats: { runtime, query, budget: getRuntimeBudget(runtime), recalled: {}, selected: { total: 0 } },
      sections: { instance: [], template: [], global: [] },
    };
  }

  const bindings = buildAgentMemoryBindings(agent, workspaceId);
  const [instance, template, global] = await Promise.all([
    recallWithBindings({ db, workspaceId, bindings, query: query || `${bindings.agentRef} current user context and working memory`, limit: 18, scopeKey: 'instance' }).catch(() => []),
    recallWithBindings({ db, workspaceId, bindings, query: `${bindings.role} template best practices role instructions`, limit: 14, scopeKey: 'template' }).catch(() => []),
    recallWithBindings({ db, workspaceId, bindings, query: 'platform standards guardrails policies defaults', limit: 10, scopeKey: 'global' }).catch(() => []),
  ]);

  const selection = selectRuntimeMemories({ instance, template, global, query, runtime });
  const sections = [];
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

async function buildRuntimeMemoryPrompt({ db, workspaceId, agent, query = '', runtime = 'chat' }) {
  const bundle = await buildRuntimeMemoryBundle({ db, workspaceId, agent, query, runtime });
  return bundle.prompt;
}

module.exports = {
  DEFAULT_WORKSPACE,
  DEFAULT_COUNT_LIMIT,
  normalizeWorkspaceId,
  normalizeRole,
  normalizeImportance,
  buildAgentMemoryBindings,
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
