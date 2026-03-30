'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;

const MEMORY_TYPE_POLICIES = {
  user_profile: {
    visibility: 'reviewable',
    scopeKey: 'instance',
    ttlDays: 365,
    retrievalWeight: 1.25,
    promotionWeight: 0.6,
    injectable: true,
    promotable: false,
  },
  agent_identity: {
    visibility: 'reviewable',
    scopeKey: 'instance',
    ttlDays: 365,
    retrievalWeight: 1.35,
    promotionWeight: 0.3,
    injectable: true,
    promotable: false,
  },
  decision: {
    visibility: 'reviewable',
    scopeKey: 'instance',
    ttlDays: 365,
    retrievalWeight: 1.4,
    promotionWeight: 1.2,
    injectable: true,
    promotable: true,
  },
  policy: {
    visibility: 'reviewable',
    scopeKey: 'template',
    ttlDays: 365,
    retrievalWeight: 1.45,
    promotionWeight: 1.4,
    injectable: true,
    promotable: true,
  },
  fact: {
    visibility: 'reviewable',
    scopeKey: 'instance',
    ttlDays: 180,
    retrievalWeight: 1.05,
    promotionWeight: 0.7,
    injectable: true,
    promotable: true,
  },
  task_episode: {
    visibility: 'internal',
    scopeKey: 'instance',
    ttlDays: 30,
    retrievalWeight: 0.82,
    promotionWeight: 0.35,
    injectable: true,
    promotable: false,
  },
  tool_observation: {
    visibility: 'internal',
    scopeKey: 'instance',
    ttlDays: 14,
    retrievalWeight: 0.72,
    promotionWeight: 0.2,
    injectable: true,
    promotable: false,
  },
  action_log: {
    visibility: 'internal',
    scopeKey: 'instance',
    ttlDays: 7,
    retrievalWeight: 0.2,
    promotionWeight: 0.05,
    injectable: false,
    promotable: false,
  },
  context: {
    visibility: 'internal',
    scopeKey: 'instance',
    ttlDays: 7,
    retrievalWeight: 0.15,
    promotionWeight: 0.05,
    injectable: false,
    promotable: false,
  },
};

const DEFAULT_POLICY = {
  visibility: 'reviewable',
  scopeKey: 'instance',
  ttlDays: 90,
  retrievalWeight: 1,
  promotionWeight: 0.5,
  injectable: true,
  promotable: false,
};

const RUNTIME_BUDGETS = {
  chat: {
    total: 10,
    instance: 5,
    template: 3,
    global: 2,
  },
  task: {
    total: 12,
    instance: 5,
    template: 4,
    global: 3,
  },
  dashboard: {
    total: 50,
    instance: 50,
    template: 50,
    global: 50,
  },
};

const SCOPE_WEIGHTS = {
  chat: {
    instance: 1.25,
    template: 1,
    global: 0.85,
  },
  task: {
    instance: 1.15,
    template: 1.1,
    global: 0.95,
  },
  dashboard: {
    instance: 1,
    template: 1,
    global: 1,
  },
};

const PROMOTION_THRESHOLDS = {
  template: {
    minDuplicateCount: 2,
    minPromotionScore: 1.75,
    minImportance: 0.72,
  },
  global: {
    minDuplicateCount: 3,
    minPromotionScore: 2.4,
    minImportance: 0.82,
  },
};

function normalizeType(type) {
  return String(type || 'fact').toLowerCase();
}

function normalizeScopeKey(scopeKey) {
  if (scopeKey === 'agent') return 'instance';
  if (scopeKey === 'project') return 'template';
  return String(scopeKey || 'instance').toLowerCase();
}

function getMemoryTypePolicy(type) {
  return {
    ...DEFAULT_POLICY,
    ...(MEMORY_TYPE_POLICIES[normalizeType(type)] || {}),
  };
}

function getDefaultVisibility(type) {
  return getMemoryTypePolicy(type).visibility;
}

function getDefaultScopeKey(type) {
  return getMemoryTypePolicy(type).scopeKey;
}

function getRuntimeBudget(runtime = 'chat') {
  return {
    ...RUNTIME_BUDGETS.dashboard,
    ...(RUNTIME_BUDGETS[String(runtime || 'chat').toLowerCase()] || RUNTIME_BUDGETS.chat),
  };
}

function getScopeWeight(scopeKey, runtime = 'chat') {
  const runtimeWeights = SCOPE_WEIGHTS[String(runtime || 'chat').toLowerCase()] || SCOPE_WEIGHTS.chat;
  return runtimeWeights[normalizeScopeKey(scopeKey)] || 1;
}

function computeExpirationDate(type, createdAt = new Date()) {
  const policy = getMemoryTypePolicy(type);
  if (!policy.ttlDays || policy.ttlDays <= 0) return null;
  const base = new Date(createdAt);
  if (Number.isNaN(base.getTime())) return null;
  return new Date(base.getTime() + (policy.ttlDays * DAY_MS)).toISOString();
}

function isMemoryExpired(memory, now = Date.now()) {
  const expiresAt = memory?.expires_at || memory?.metadata?.expires_at;
  if (!expiresAt) return false;
  const expiresMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresMs)) return false;
  return expiresMs <= now;
}

function isInjectableMemory(memory) {
  if (!memory) return false;
  const policy = getMemoryTypePolicy(memory.type);
  return policy.injectable !== false && !isMemoryExpired(memory);
}

function isPromotableMemory(memory) {
  if (!memory) return false;
  return getMemoryTypePolicy(memory.type).promotable === true;
}

function getPromotionThreshold(scopeKey = 'template') {
  return {
    ...PROMOTION_THRESHOLDS.template,
    ...(PROMOTION_THRESHOLDS[normalizeScopeKey(scopeKey)] || {}),
  };
}

function buildGovernanceMetadata({
  type,
  scopeKey,
  visibility,
  createdAt,
  metadata = {},
}) {
  const normalizedType = normalizeType(type);
  const normalizedScope = normalizeScopeKey(scopeKey || metadata.memory_scope_key || getDefaultScopeKey(normalizedType));
  const timestamp = createdAt || metadata.created_at || new Date().toISOString();
  const baseMetadata = { ...(metadata || {}) };
  const usageCount = Number(baseMetadata.usage_count);
  const duplicateCount = Number(baseMetadata.duplicate_count);
  const promotionScore = Number(baseMetadata.promotion_score);

  return {
    ...baseMetadata,
    visibility: visibility || baseMetadata.visibility || getDefaultVisibility(normalizedType),
    memory_scope_key: normalizedScope,
    created_at: timestamp,
    last_seen_at: baseMetadata.last_seen_at || timestamp,
    last_used_at: baseMetadata.last_used_at || baseMetadata.last_seen_at || null,
    usage_count: Number.isFinite(usageCount) ? usageCount : 0,
    duplicate_count: Number.isFinite(duplicateCount) ? duplicateCount : 0,
    promotion_score: Number.isFinite(promotionScore) ? promotionScore : 0,
    expires_at: baseMetadata.expires_at || computeExpirationDate(normalizedType, timestamp),
  };
}

module.exports = {
  DAY_MS,
  normalizeType,
  normalizeScopeKey,
  getMemoryTypePolicy,
  getDefaultVisibility,
  getDefaultScopeKey,
  getRuntimeBudget,
  getScopeWeight,
  computeExpirationDate,
  isMemoryExpired,
  isInjectableMemory,
  isPromotableMemory,
  getPromotionThreshold,
  buildGovernanceMetadata,
};
