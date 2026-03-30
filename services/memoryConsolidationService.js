'use strict';

const { buildAgentMemoryBindings, resolveAgentRecord, normalizeMemories } = require('./sniparaMemoryService');
const { callSniparaTool } = require('./sniparaResolver');

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

function overlapScore(left, right) {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }

  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function isNearDuplicate(candidate, existing) {
  if (!candidate || !existing) return false;
  if (String(candidate.type || '') !== String(existing.type || '')) return false;

  const candidateLane = candidate.metadata?.memory_lane || null;
  const existingLane = existing.metadata?.memory_lane || existing.metadata?.source_kind || null;
  if (candidateLane && existingLane && candidateLane !== existingLane) return false;

  const left = canonicalizeText(candidate.text);
  const right = canonicalizeText(existing.text);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;

  return overlapScore(left, right) >= 0.82;
}

async function recallScopeMemories({ db, workspaceId, agent, scopeKey, query, limit = 12 }) {
  const resolvedAgent = await resolveAgentRecord(db, workspaceId, agent?.id || agent?.username || agent?.agent_id, agent || {});
  const bindings = buildAgentMemoryBindings(resolvedAgent, workspaceId);
  const target = bindings[scopeKey] || bindings.instance;
  const args = {
    query,
    scope: target.scope,
    category: target.category,
    limit,
  };
  if (scopeKey === 'instance') args.agent_id = bindings.agentRef;

  const raw = await callSniparaTool({
    db,
    workspaceId,
    toolName: 'rlm_recall',
    args,
  }).catch(() => []);

  return normalizeMemories(raw, target.scope);
}

async function findRecentDuplicate({ db, workspaceId, agent, memory }) {
  const query = tokenize(memory.text).slice(0, 8).join(' ') || String(memory.type || 'memory');
  const recent = await recallScopeMemories({
    db,
    workspaceId,
    agent,
    scopeKey: memory.scopeKey || 'instance',
    query,
    limit: 12,
  });

  return recent.find((existing) => isNearDuplicate(memory, existing)) || null;
}

async function filterNovelMemories({ db, workspaceId, agent, memories }) {
  const accepted = [];

  for (const memory of memories || []) {
    const duplicateInBatch = accepted.find((existing) => isNearDuplicate(memory, existing));
    if (duplicateInBatch) continue;

    const duplicateInStore = await findRecentDuplicate({ db, workspaceId, agent, memory });
    if (duplicateInStore) continue;

    accepted.push(memory);
  }

  return accepted;
}

module.exports = {
  canonicalizeText,
  overlapScore,
  isNearDuplicate,
  recallScopeMemories,
  findRecentDuplicate,
  filterNovelMemories,
};
