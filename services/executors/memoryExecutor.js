'use strict';

const { createSniparaGateway } = require('../snipara/gateway');
const { getDefaultVisibility, normalizeType } = require('../memoryPolicy');

function extractMemoryText(response) {
  if (!response) return '';
  const result = response.result || response;
  if (typeof result === 'string') return result;
  if (result.content) {
    if (Array.isArray(result.content)) return result.content.map((entry) => entry.text || '').join('\n');
    if (typeof result.content === 'string') return result.content;
  }
  if (Array.isArray(result.memories)) {
    return result.memories.map((entry) => entry.text || entry.content || '').join('\n');
  }
  if (Array.isArray(result)) {
    return result.map((entry) => entry.text || entry.content || '').join('\n');
  }
  if (result.text) return result.text;
  try {
    return JSON.stringify(result);
  } catch (_) {
    return '';
  }
}

async function executeMemoryPlan(plan = {}, context = {}) {
  const workspaceId = plan.workspace_id || plan.workspaceId || context.workspaceId || null;
  const params = plan.params || plan.input || {};
  const bindings = params.bindings || {};
  if (!workspaceId) throw new Error('Memory execution requires a workspace id.');
  if (!bindings.scope || !bindings.category || !bindings.agent_id) {
    throw new Error('Memory execution requires persisted bindings.');
  }

  const gateway = createSniparaGateway({
    db: context.db || null,
    workspaceId,
  });

  const operation = String(params.operation || '').trim().toLowerCase();
  const resolveBindingTarget = (scopeKey) => {
    if (scopeKey === 'human' && bindings.human?.scope && bindings.human?.category) {
      return bindings.human;
    }
    if (scopeKey === 'human_agent' && bindings.human_agent?.scope && bindings.human_agent?.category && bindings.human_agent?.agent_id) {
      return bindings.human_agent;
    }
    if (bindings.instance?.scope && bindings.instance?.category && bindings.instance?.agent_id) {
      return bindings.instance;
    }
    return {
      scope: bindings.scope,
      category: bindings.category,
      agent_id: bindings.agent_id,
      user_id: bindings.user_id || null,
      user_name: bindings.user_name || null,
    };
  };

  const recallScopes = Array.isArray(bindings.recall_scope_order) && bindings.recall_scope_order.length > 0
    ? bindings.recall_scope_order
    : ['instance'];
  if (operation === 'remember') {
    const memoryType = normalizeType(params.memory_type || 'fact');
    const preferredScope = String(params.scope_key || '').trim().toLowerCase()
      || (memoryType === 'user_profile' && bindings.human ? 'human' : '')
      || ((memoryType === 'action_log' || memoryType === 'context') && bindings.human_agent ? 'human_agent' : '')
      || bindings.default_scope_key
      || 'instance';
    const target = resolveBindingTarget(preferredScope);
    await gateway.memory.remember({
      text: params.content || '',
      type: memoryType,
      importance: params.importance || 5,
      scope: target.scope,
      category: target.category,
      agentId: target.agent_id,
      metadata: {
        visibility: getDefaultVisibility(memoryType),
        source: 'orchestration',
        created_at: new Date().toISOString(),
        user_id: target.user_id || null,
        user_name: target.user_name || null,
        memory_scope_key: preferredScope || 'instance',
      },
    });

    return {
      success: true,
      data: {
        stored: true,
        type: memoryType,
        importance: params.importance || 5,
        scope_key: preferredScope || 'instance',
      },
    };
  }

  if (operation === 'recall') {
    const recallResults = [];
    const seen = new Set();

    for (const scopeKey of recallScopes) {
      const target = resolveBindingTarget(scopeKey);
      if (!target?.scope || !target?.category) continue;
      const recallResult = await gateway.memory.recall({
        query: params.query || '',
        scope: target.scope,
        category: target.category,
        agentId: target.agent_id,
      });
      const items = Array.isArray(recallResult)
        ? recallResult
        : Array.isArray(recallResult?.memories)
          ? recallResult.memories
          : Array.isArray(recallResult?.results)
            ? recallResult.results
            : [];

      for (const item of items) {
        const key = item?.id || item?.memory_id || item?.text || item?.content;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        recallResults.push(item);
      }
    }

    const recallResult = recallResults;

    return {
      success: true,
      data: {
        query: params.query || '',
        text: extractMemoryText(recallResult) || 'No relevant memories found.',
        raw: recallResult || null,
      },
    };
  }

  throw new Error(`Unsupported memory operation: ${operation || 'unknown'}`);
}

module.exports = {
  executeMemoryPlan,
};
