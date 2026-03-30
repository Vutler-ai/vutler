'use strict';

const { rememberScopedMemory } = require('./sniparaMemoryService');
const { recallScopeMemories, isNearDuplicate } = require('./memoryConsolidationService');

function getPromotionTarget(memory) {
  if (!memory || memory.type !== 'decision' || memory.scopeKey !== 'instance') return null;
  return memory.metadata?.preferred_target_scope || 'template';
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
    limit: 12,
  }).catch(() => []);

  const duplicateCount = instanceRecent.filter((existing) => isNearDuplicate(memory, existing)).length;
  if (duplicateCount < 1) return null;

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
      auto_promoted: true,
      auto_promoted_from: 'instance',
      auto_promoted_to: targetScopeKey,
      promoted_at: new Date().toISOString(),
    },
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
  getPromotionTarget,
  maybeAutoPromoteMemory,
  maybeAutoPromoteMemories,
};
