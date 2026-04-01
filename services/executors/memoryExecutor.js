'use strict';

const { createSniparaGateway } = require('../snipara/gateway');

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
  if (operation === 'remember') {
    await gateway.memory.remember({
      text: params.content || '',
      type: params.memory_type || 'fact',
      importance: params.importance || 5,
      scope: bindings.scope,
      category: bindings.category,
      agentId: bindings.agent_id,
      metadata: {
        visibility: 'internal',
        source: 'orchestration',
        created_at: new Date().toISOString(),
      },
    });

    return {
      success: true,
      data: {
        stored: true,
        type: params.memory_type || 'fact',
        importance: params.importance || 5,
      },
    };
  }

  if (operation === 'recall') {
    const recallResult = await gateway.memory.recall({
      query: params.query || '',
      scope: bindings.scope,
      category: bindings.category,
      agentId: bindings.agent_id,
    });

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
