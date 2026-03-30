'use strict';

const { callSniparaTool } = require('./sniparaResolver');

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

function buildAgentMemoryBindings(agent = {}, workspaceId = DEFAULT_WORKSPACE) {
  const ws = normalizeWorkspaceId(workspaceId);
  const agentRef = String(agent.username || agent.memory_scope || agent.snipara_instance_id || agent.id || agent.agent_id || 'unknown-agent');
  const role = normalizeRole(agent.role);

  return {
    workspaceId: ws,
    agentId: agent.id || agent.agent_id || null,
    agentRef,
    role,
    instance: { scope: 'agent', category: `${ws}-agent-${agentRef}` },
    template: { scope: 'project', category: `${ws}-template-${role}` },
    global: { scope: 'project', category: `${ws}-platform-standards` },
  };
}

async function resolveAgentRecord(db, workspaceId, agentIdOrUsername, fallback = {}) {
  const ws = normalizeWorkspaceId(workspaceId);
  if (db && agentIdOrUsername) {
    const result = await db.query(
      `SELECT id, name, username, role, model, provider, system_prompt, temperature, max_tokens, workspace_id
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

function inferVisibility(memory) {
  if (memory.metadata && typeof memory.metadata === 'object' && memory.metadata.visibility) {
    return memory.metadata.visibility;
  }

  const type = String(memory.type || '').toLowerCase();
  return (type === 'action_log' || type === 'context' || type === 'tool_observation' || type === 'task_episode')
    ? 'internal'
    : 'reviewable';
}

function normalizeMemory(raw, fallbackScope, index = 0) {
  const metadata = raw && typeof raw.metadata === 'object' && raw.metadata !== null ? raw.metadata : {};
  return {
    id: raw?.id || raw?.memory_id || `mem-${fallbackScope}-${index}`,
    text: raw?.text || raw?.content || raw?.description || '',
    type: raw?.type || 'fact',
    importance: normalizeImportance(raw?.importance, 0.5),
    scope: raw?.scope || fallbackScope,
    category: raw?.category || metadata.category || undefined,
    created_at: raw?.created_at || raw?.createdAt || metadata.created_at || new Date().toISOString(),
    agent_id: raw?.agent_id || raw?.agentId || metadata.agent_id || undefined,
    metadata,
    visibility: raw?.visibility || inferVisibility({ ...raw, metadata }),
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

function filterDashboardMemories(memories = [], includeInternal = false) {
  return memories.filter((memory) => {
    if (isDeletedMemory(memory)) return false;
    if (!includeInternal && memory.visibility === 'internal') return false;
    return true;
  });
}

async function recallWithBindings({ db, workspaceId, bindings, query, limit = 20, scopeKey = 'instance' }) {
  const target = bindings[scopeKey];
  const args = { query, scope: target.scope, category: target.category, limit };
  if (scopeKey === 'instance') args.agent_id = bindings.agentRef;

  const raw = await callSniparaTool({ db, workspaceId, toolName: 'rlm_recall', args }).catch(() => []);
  return normalizeMemories(raw, target.scope);
}

async function listAgentMemories({ db, workspaceId, agentIdOrUsername, query, role, limit = 20, includeInternal = false, fallbackAgent = {} }) {
  const agent = await resolveAgentRecord(db, workspaceId, agentIdOrUsername, { ...fallbackAgent, role: role || fallbackAgent.role });
  const bindings = buildAgentMemoryBindings(agent, workspaceId);
  const rawMemories = await recallWithBindings({
    db,
    workspaceId,
    bindings,
    query: query || `agent ${bindings.agentRef} memories`,
    limit,
    scopeKey: 'instance',
  });
  const memories = filterDashboardMemories(rawMemories, includeInternal);
  return { agent, bindings, memories, raw_count: rawMemories.length, count: memories.length, has_more: rawMemories.length >= limit, count_is_estimate: rawMemories.length >= limit };
}

async function listTemplateMemories({ db, workspaceId, agentIdOrUsername, role, query, limit = 20, includeInternal = false, fallbackAgent = {} }) {
  const agent = await resolveAgentRecord(db, workspaceId, agentIdOrUsername, { ...fallbackAgent, role: role || fallbackAgent.role });
  const bindings = buildAgentMemoryBindings(agent, workspaceId);
  const rawMemories = await recallWithBindings({
    db,
    workspaceId,
    bindings,
    query: query || `${bindings.role} knowledge best practices`,
    limit,
    scopeKey: 'template',
  });
  const memories = filterDashboardMemories(rawMemories, includeInternal);
  return { agent, bindings, memories, raw_count: rawMemories.length, count: memories.length, has_more: rawMemories.length >= limit, count_is_estimate: rawMemories.length >= limit };
}

async function loadWorkspaceKnowledge({ db, workspaceId }) {
  const content = await callSniparaTool({
    db,
    workspaceId,
    toolName: 'rlm_load_document',
    args: { path: 'agents/SOUL.md' },
  }).catch(() => '');

  return {
    content: typeof content === 'string' ? content : JSON.stringify(content || ''),
    updatedAt: '',
    readOnly: true,
  };
}

async function buildAgentContext({ db, workspaceId, agentIdOrUsername, role, includeInternal = false, fallbackAgent = {} }) {
  const agent = await resolveAgentRecord(db, workspaceId, agentIdOrUsername, { ...fallbackAgent, role: role || fallbackAgent.role });
  const bindings = buildAgentMemoryBindings(agent, workspaceId);

  const [instanceRaw, templateRaw, soulDoc] = await Promise.all([
    recallWithBindings({ db, workspaceId, bindings, query: `agent ${bindings.agentRef}`, limit: DEFAULT_COUNT_LIMIT, scopeKey: 'instance' }).catch(() => []),
    recallWithBindings({ db, workspaceId, bindings, query: `${bindings.role} knowledge`, limit: DEFAULT_COUNT_LIMIT, scopeKey: 'template' }).catch(() => []),
    callSniparaTool({ db, workspaceId, toolName: 'rlm_load_document', args: { path: 'agents/SOUL.md' } }).catch(() => ''),
  ]);

  const visibleInstance = filterDashboardMemories(instanceRaw, includeInternal);
  const visibleTemplate = filterDashboardMemories(templateRaw, includeInternal);

  return {
    agent,
    bindings,
    memories: [...visibleInstance, ...visibleTemplate],
    context: `Agent ${bindings.agentRef} — ${visibleInstance.length}${instanceRaw.length >= DEFAULT_COUNT_LIMIT ? '+' : ''} personal memories, ${visibleTemplate.length}${templateRaw.length >= DEFAULT_COUNT_LIMIT ? '+' : ''} template memories available`,
    soul: typeof soulDoc === 'string' ? soulDoc : JSON.stringify(soulDoc || ''),
    role: bindings.role,
    instance_count: visibleInstance.length,
    template_count: visibleTemplate.length,
    hidden_instance_count: Math.max(0, instanceRaw.length - visibleInstance.length),
    hidden_template_count: Math.max(0, templateRaw.length - visibleTemplate.length),
    instance_count_is_estimate: instanceRaw.length >= DEFAULT_COUNT_LIMIT,
    template_count_is_estimate: templateRaw.length >= DEFAULT_COUNT_LIMIT,
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
  visibility = 'reviewable',
  source = 'vutler',
  metadata = {},
}) {
  const bindings = buildAgentMemoryBindings(agent, workspaceId);
  const target = bindings[scopeKey] || bindings.instance;
  const args = {
    text,
    type,
    importance: normalizeImportance(importance),
    scope: target.scope,
    category: target.category,
    metadata: {
      ...metadata,
      visibility,
      source,
      memory_scope_key: scopeKey,
      agent_id: bindings.agentId || metadata.agent_id || undefined,
      agent_username: bindings.agentRef,
      created_at: metadata.created_at || new Date().toISOString(),
    },
  };
  if (scopeKey === 'instance') args.agent_id = bindings.agentRef;

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
      agent_id: bindings.agentRef,
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
    type: 'learning',
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
  return memories.slice(0, 12).map((memory) => `- [${memory.type}] ${String(memory.text || '').trim()}`).join('\n');
}

async function buildRuntimeMemoryPrompt({ db, workspaceId, agent, query = '' }) {
  if (!agent) return '';

  const bindings = buildAgentMemoryBindings(agent, workspaceId);
  const [instance, template, global] = await Promise.all([
    recallWithBindings({ db, workspaceId, bindings, query: query || `${bindings.agentRef} current user context and working memory`, limit: 8, scopeKey: 'instance' }).catch(() => []),
    recallWithBindings({ db, workspaceId, bindings, query: `${bindings.role} template best practices role instructions`, limit: 6, scopeKey: 'template' }).catch(() => []),
    recallWithBindings({ db, workspaceId, bindings, query: 'platform standards guardrails policies defaults', limit: 6, scopeKey: 'global' }).catch(() => []),
  ]);

  const sections = [];
  const visibleInstance = filterDashboardMemories(instance, true);
  const visibleTemplate = filterDashboardMemories(template, true);
  const visibleGlobal = filterDashboardMemories(global, true);

  if (visibleInstance.length > 0) sections.push(`## Agent Memory\n${stringifyMemoryList(visibleInstance)}`);
  if (visibleTemplate.length > 0) sections.push(`## Role Memory\n${stringifyMemoryList(visibleTemplate)}`);
  if (visibleGlobal.length > 0) sections.push(`## Workspace Memory\n${stringifyMemoryList(visibleGlobal)}`);

  return sections.join('\n\n').trim();
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
  listAgentMemories,
  listTemplateMemories,
  loadWorkspaceKnowledge,
  buildAgentContext,
  rememberScopedMemory,
  rememberAgentMemory,
  softDeleteAgentMemory,
  promoteAgentMemoryToTemplate,
  buildRuntimeMemoryPrompt,
};
