'use strict';

const { callSniparaTool, resolveSniparaConfig } = require('../sniparaResolver');
const { buildAgentMemoryBindings, normalizeImportance } = require('../sniparaMemoryService');

function extractSniparaText(response) {
  if (!response) return '';
  const result = response.result || response;
  if (typeof result === 'string') return result;
  if (Array.isArray(result.results)) {
    return result.results.map((entry) => {
      if (typeof entry?.content === 'string') return entry.content;
      if (Array.isArray(entry?.sections)) {
        return entry.sections
          .map((section) => section.content || section.text || section.title || '')
          .filter(Boolean)
          .join('\n');
      }
      return entry?.query || '';
    }).filter(Boolean).join('\n\n');
  }
  if (Array.isArray(result.templates)) {
    return result.templates
      .map((template) => [template.name, template.description].filter(Boolean).join(' — '))
      .filter(Boolean)
      .join('\n');
  }
  if (Array.isArray(result.collections)) {
    return result.collections
      .map((collection) => [collection.name, collection.description].filter(Boolean).join(' — '))
      .filter(Boolean)
      .join('\n');
  }
  if (result.content) {
    if (Array.isArray(result.content)) return result.content.map((c) => c.text || '').join('\n');
    if (typeof result.content === 'string') return result.content;
  }
  if (Array.isArray(result.memories)) {
    return result.memories.map((m) => m.text || m.content || '').join('\n');
  }
  if (Array.isArray(result)) {
    return result.map((m) => m.text || m.content || '').join('\n');
  }
  if (result.text) return result.text;
  try {
    return JSON.stringify(result);
  } catch (_) {
    return '';
  }
}

function resolveRequiredWorkspaceId(...candidates) {
  for (const candidate of candidates) {
    const value = typeof candidate === 'string' ? candidate.trim() : candidate;
    if (value) return value;
  }
  throw new Error('workspaceId is required for Snipara gateway calls');
}

class SniparaGateway {
  constructor({ db = null, workspaceId = null, timeoutMs = 15_000 } = {}) {
    this.db = db;
    this.workspaceId = workspaceId;
    this.timeoutMs = timeoutMs;

    this.memory = {
      remember: (input = {}) => this.call('rlm_remember', {
        text: input.text,
        type: input.type || 'fact',
        importance: input.importance,
        scope: input.scope,
        category: input.category,
        agent_id: input.agentId || input.agent_id,
        tags: input.tags,
        metadata: input.metadata,
      }),
      rememberBulk: (memories = []) => this.call('rlm_remember_bulk', { memories }),
      recall: (input = {}) => this.call('rlm_recall', {
        query: input.query,
        scope: input.scope,
        category: input.category,
        agent_id: input.agentId || input.agent_id,
        type: input.type,
        limit: input.limit,
      }),
      list: (input = {}) => this.call('rlm_memories', {
        search: input.search,
        type: input.type,
        limit: input.limit,
        offset: input.offset,
      }),
      forget: (input = {}) => this.call('rlm_forget', input),
      attachSource: (input = {}) => this.call('rlm_memory_attach_source', input),
      verify: (input = {}) => this.call('rlm_memory_verify', input),
      invalidate: (input = {}) => this.call('rlm_memory_invalidate', input),
      supersede: (input = {}) => this.call('rlm_memory_supersede', input),
      rememberForAgent: (agent, input = {}) => {
        const workspaceId = resolveRequiredWorkspaceId(input.workspaceId, this.workspaceId);
        const bindings = buildAgentMemoryBindings(agent, workspaceId);
        return this.call('rlm_remember', {
          text: input.text,
          type: input.type || 'fact',
          importance: normalizeImportance(input.importance, 0.5),
          scope: bindings.instance.scope,
          category: bindings.instance.category,
          agent_id: bindings.agentId || bindings.sniparaInstanceId || bindings.agentRef,
          metadata: input.metadata,
        }, { workspaceId });
      },
      recallForAgent: (agent, input = {}) => {
        const workspaceId = resolveRequiredWorkspaceId(input.workspaceId, this.workspaceId);
        const bindings = buildAgentMemoryBindings(agent, workspaceId);
        return this.call('rlm_recall', {
          query: input.query,
          scope: bindings.instance.scope,
          category: bindings.instance.category,
          agent_id: bindings.agentId || bindings.sniparaInstanceId || bindings.agentRef,
          type: input.type,
          limit: input.limit,
        }, { workspaceId });
      },
    };

    this.knowledge = {
      contextQuery: (input = {}) => this.call('rlm_context_query', input),
      multiQuery: (input = {}) => this.call('rlm_multi_query', input),
      multiProjectQuery: (input = {}) => this.call('rlm_multi_project_query', input),
      sharedContext: (input = {}) => this.call('rlm_shared_context', input),
      loadDocument: (input = {}) => this.call('rlm_load_document', input),
      loadProject: (input = {}) => this.call('rlm_load_project', input),
      search: (input = {}) => this.call('rlm_search', input),
      ask: (input = {}) => this.call('rlm_ask', input),
    };

    this.analytics = {
      indexHealth: (input = {}) => this.call('rlm_index_health', input),
      searchAnalytics: (input = {}) => this.call('rlm_search_analytics', input),
    };

    this.workflow = {
      plan: (input = {}) => this.call('rlm_plan', input),
      decompose: (input = {}) => this.call('rlm_decompose', input),
      orchestrate: (input = {}) => this.call('rlm_orchestrate', input),
    };

    this.session = {
      inject: (input = {}) => this.call('rlm_inject', input),
      context: (input = {}) => this.call('rlm_context', input),
      clearContext: (input = {}) => this.call('rlm_clear_context', input),
    };

    this.shared = {
      listTemplates: (input = {}) => this.call('rlm_list_templates', input),
      getTemplate: (input = {}) => this.call('rlm_get_template', input),
      listCollections: (input = {}) => this.call('rlm_list_collections', input),
      uploadDocument: (input = {}) => this.call('rlm_upload_shared_document', input),
    };

    this.sync = {
      uploadDocument: (input = {}) => this.call('rlm_upload_document', input),
      syncDocuments: (input = {}) => this.call('rlm_sync_documents', input),
    };

    this.runtime = {
      loadDocument: (input = {}) => this.call('rlm_load_document', input),
      loadProject: (input = {}) => this.call('rlm_load_project', input),
      replContext: (input = {}) => this.call('rlm_repl_context', input),
    };

    this.summaries = {
      store: (input = {}) => this.call('rlm_store_summary', input),
      list: (input = {}) => this.call('rlm_get_summaries', input),
      delete: (input = {}) => this.call('rlm_delete_summary', input),
    };

    this.journal = {
      append: (input = {}) => this.call('rlm_journal_append', input),
      summarize: (input = {}) => this.call('rlm_journal_summarize', input),
    };

    this.coordination = {
      swarmCreate: (input = {}) => this.call('rlm_swarm_create', input),
      swarmJoin: (input = {}) => this.call('rlm_swarm_join', input),
      claim: (input = {}) => this.call('rlm_claim', input),
      release: (input = {}) => this.call('rlm_release', input),
      stateGet: (input = {}) => this.call('rlm_state_get', input),
      stateSet: (input = {}) => this.call('rlm_state_set', input),
      statePoll: (input = {}) => this.call('rlm_state_poll', input),
      broadcast: (input = {}) => this.call('rlm_broadcast', input),
      taskCreate: (input = {}) => this.call('rlm_task_create', input),
      tasks: (input = {}) => this.call('rlm_tasks', input),
      taskClaim: (input = {}) => this.call('rlm_task_claim', input),
      taskComplete: (input = {}) => this.call('rlm_task_complete', input),
      htaskCreate: (input = {}) => this.call('rlm_htask_create', input),
      htaskBlock: (input = {}) => this.call('rlm_htask_block', input),
      htaskUnblock: (input = {}) => this.call('rlm_htask_unblock', input),
      htaskComplete: (input = {}) => this.call('rlm_htask_complete', input),
      htaskVerifyClosure: (input = {}) => this.call('rlm_htask_verify_closure', input),
      htaskClose: (input = {}) => this.call('rlm_htask_close', input),
      htaskPolicyGet: (input = {}) => this.call('rlm_htask_policy_get', input),
      htaskMetrics: (input = {}) => this.call('rlm_htask_metrics', input),
      htaskCreateFeature: (input = {}) => this.call('rlm_htask_create_feature', input),
    };
  }

  withContext({ db = this.db, workspaceId = this.workspaceId, timeoutMs = this.timeoutMs } = {}) {
    return new SniparaGateway({ db, workspaceId, timeoutMs });
  }

  async call(toolName, args = {}, overrides = {}) {
    const workspaceId = resolveRequiredWorkspaceId(overrides.workspaceId, this.workspaceId);
    return callSniparaTool({
      db: overrides.db || this.db,
      workspaceId,
      toolName,
      args,
      timeoutMs: overrides.timeoutMs || this.timeoutMs,
    });
  }

  async resolveConfig(overrides = {}) {
    const workspaceId = resolveRequiredWorkspaceId(overrides.workspaceId, this.workspaceId);
    return resolveSniparaConfig(
      overrides.db || this.db,
      workspaceId
    );
  }

  async health() {
    try {
      await this.knowledge.sharedContext({});
      return { ok: true, provider: 'snipara' };
    } catch (err) {
      return { ok: false, provider: 'snipara', error: err.message };
    }
  }
}

function createSniparaGateway(options) {
  return new SniparaGateway(options);
}

module.exports = {
  SniparaGateway,
  createSniparaGateway,
  extractSniparaText,
  resolveRequiredWorkspaceId,
};
