'use strict';

const { callSniparaTool } = require('./sniparaResolver');
const {
  buildAgentMemoryBindings,
  normalizeImportance,
} = require('./sniparaMemoryService');

async function remember(scope, content, opts = {}, runtime = {}) {
  try {
    const bindings = buildAgentMemoryBindings({ username: scope, role: runtime.role }, runtime.workspaceId);
    const result = await callSniparaTool({
      db: runtime.db,
      workspaceId: runtime.workspaceId,
      toolName: 'rlm_remember',
      args: {
        text: content,
        type: opts.type || 'fact',
        importance: normalizeImportance(opts.importance, 0.5),
        scope: bindings.instance.scope,
        category: bindings.instance.category,
        agent_id: bindings.agentRef,
        metadata: {
          visibility: opts.visibility || 'internal',
          source: opts.source || 'llm-tool',
          created_at: new Date().toISOString(),
        },
      },
    });

    console.log(`[Memory] Remembered in scope "${bindings.agentRef}": "${content.slice(0, 80)}..."`);
    return result;
  } catch (err) {
    console.warn(`[Memory] remember failed (scope=${scope}): ${err.message}`);
    return null;
  }
}

async function recall(scope, query, opts = {}, runtime = {}) {
  try {
    const bindings = buildAgentMemoryBindings({ username: scope, role: runtime.role }, runtime.workspaceId);
    const result = await callSniparaTool({
      db: runtime.db,
      workspaceId: runtime.workspaceId,
      toolName: 'rlm_recall',
      args: {
        query,
        scope: bindings.instance.scope,
        category: bindings.instance.category,
        agent_id: bindings.agentRef,
        ...opts,
      },
    });

    console.log(`[Memory] Recalled in scope "${bindings.agentRef}" for query: "${query.slice(0, 60)}..."`);
    return result;
  } catch (err) {
    console.warn(`[Memory] recall failed (scope=${scope}): ${err.message}`);
    return null;
  }
}

async function getContext(scope, runtime = {}) {
  try {
    const bindings = buildAgentMemoryBindings({ username: scope, role: runtime.role }, runtime.workspaceId);
    return await callSniparaTool({
      db: runtime.db,
      workspaceId: runtime.workspaceId,
      toolName: 'rlm_context_query',
      args: {
        scope: bindings.instance.scope,
        category: bindings.instance.category,
      },
    });
  } catch (err) {
    console.warn(`[Memory] getContext failed (scope=${scope}): ${err.message}`);
    return null;
  }
}

function extractText(response) {
  if (!response) return '';
  const result = response.result || response;
  if (typeof result === 'string') return result;
  if (result.content) {
    if (Array.isArray(result.content)) return result.content.map((c) => c.text || '').join('\n');
    if (typeof result.content === 'string') return result.content;
  }
  if (result.memories && Array.isArray(result.memories)) {
    return result.memories.map((m) => m.text || m.content || '').join('\n');
  }
  if (result.text) return result.text;
  return JSON.stringify(result);
}

module.exports = { remember, recall, getContext, extractText };
