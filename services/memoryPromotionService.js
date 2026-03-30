'use strict';

const { rememberScopedMemory } = require('./sniparaMemoryService');
const { recallScopeMemories, isNearDuplicate } = require('./memoryConsolidationService');
const { logMemoryEvent } = require('./memoryTelemetryService');
const {
  getPromotionThreshold,
  getMemoryTypePolicy,
  isPromotableMemory,
  normalizeScopeKey,
} = require('./memoryPolicy');

function getPromotionTarget(memory) {
  if (!memory || !isPromotableMemory(memory)) return null;
  if (normalizeScopeKey(memory.scopeKey || memory.scope_key || memory.metadata?.memory_scope_key) !== 'instance') return null;
  return normalizeScopeKey(memory.metadata?.preferred_target_scope || 'template');
}

function computePromotionScore(memory, duplicateCount) {
  const typePolicy = getMemoryTypePolicy(memory?.type);
  const importance = Math.max(0, Number(memory?.importance) || 0);
  const existingScore = Math.max(0, Number(memory?.metadata?.promotion_score) || Number(memory?.promotion_score) || 0);
  return Number((existingScore + (duplicateCount * 0.6) + (importance * typePolicy.promotionWeight)).toFixed(4));
}

async function maybeAutoPromoteMemory({ db, workspaceId, agent, memory }) {
  const targetScopeKey = getPromotionTarget(memory);
  if (!targetScopeKey) return null;

  const instanceRecent = await recallScopeMemories({
    db,
    workspaceId,
    agent,
    scopeKey: 'instance',
    query: memory.text,
    limit: 20,
  }).catch(() => []);

  const duplicateCount = instanceRecent.filter((existing) => isNearDuplicate(memory, existing)).length;
  const promotionScore = computePromotionScore(memory, duplicateCount);
  const threshold = getPromotionThreshold(targetScopeKey);
  const importance = Number(memory?.importance) || 0;

  if (duplicateCount < threshold.minDuplicateCount) return null;
  if (promotionScore < threshold.minPromotionScore) return null;
  if (importance < threshold.minImportance) return null;

  const targetRecent = await recallScopeMemories({
    db,
    workspaceId,
    agent,
    scopeKey: targetScopeKey,
    query: memory.text,
    limit: 8,
  }).catch(() => []);

  if (targetRecent.some((existing) => isNearDuplicate(memory, existing))) return null;

  await rememberScopedMemory({
    db,
    workspaceId,
    agent,
    scopeKey: targetScopeKey,
    text: memory.text,
    type: memory.type,
    importance: Math.max(Number(memory.importance) || 0.5, 0.8),
    visibility: 'reviewable',
    source: 'memory-auto-promotion',
    metadata: {
      ...(memory.metadata || {}),
      duplicate_count: duplicateCount,
      promotion_score: promotionScore,
      auto_promoted: true,
      auto_promoted_from: 'instance',
      auto_promoted_to: targetScopeKey,
      promoted_at: new Date().toISOString(),
    },
  });

  logMemoryEvent('promotion', {
    workspaceId,
    agent: agent?.username || agent?.id || 'unknown-agent',
    type: memory.type,
    from: 'instance',
    to: targetScopeKey,
    duplicateCount,
    promotionScore,
  });

  return targetScopeKey;
}

async function maybeAutoPromoteMemories({ db, workspaceId, agent, memories }) {
  const promoted = [];
  for (const memory of memories || []) {
    try {
      const target = await maybeAutoPromoteMemory({ db, workspaceId, agent, memory });
      if (target) promoted.push({ memory, target });
    } catch (err) {
      console.warn('[MemoryPromotion] auto-promotion failed:', err.message);
    }
  }
  return promoted;
}

module.exports = {
  computePromotionScore,
  getPromotionTarget,
  maybeAutoPromoteMemory,
  maybeAutoPromoteMemories,
};
