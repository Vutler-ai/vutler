'use strict';

const { createSniparaGateway } = require('./snipara/gateway');
const { normalizeRole, buildAgentMemoryBindings, resolveAgentRecord } = require('./sniparaMemoryService');
const { isPromotableMemory } = require('./memoryPolicy');

const SCHEMA = 'tenant_vutler';
const INDEX_KEY = 'group_memory:index';
const DEFAULT_READ_ACCESS = 'workspace';
const DEFAULT_WRITE_ACCESS = 'admin';
const DEFAULT_MINIMUM_IMPORTANCE = 0.78;
const AUTO_ENTRY_LIMIT = 24;

function normalizeAccess(value, fallback = DEFAULT_READ_ACCESS) {
  return String(value || fallback).trim().toLowerCase() === 'admin' ? 'admin' : 'workspace';
}

function normalizeScopeType(value) {
  return String(value || 'workspace').trim().toLowerCase() === 'role' ? 'role' : 'workspace';
}

function normalizeSpaceId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function normalizeDescription(value) {
  return String(value || '').trim().slice(0, 280);
}

function normalizeName(value, fallback = 'Group Memory') {
  const trimmed = String(value || fallback).trim().slice(0, 80);
  return trimmed || fallback;
}

function clampUnitInterval(value, fallback = DEFAULT_MINIMUM_IMPORTANCE) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, Number(parsed.toFixed(2))));
}

function canonicalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactLine(text, max = 240) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeGroupMemoryRecord(input = {}, fallback = {}, options = {}) {
  const now = new Date().toISOString();
  const name = normalizeName(input.name, fallback.name || 'Group Memory');
  const id = normalizeSpaceId(input.id || fallback.id || name) || normalizeSpaceId(`group-${Date.now()}`);
  const scopeType = normalizeScopeType(
    input.scope_type || input.scopeType || fallback.scope_type || fallback.scopeType
  );
  const targetRole = scopeType === 'role'
    ? normalizeRole(input.target_role || input.targetRole || fallback.target_role || fallback.targetRole || 'general')
    : null;

  return {
    id,
    name,
    description: normalizeDescription(input.description ?? fallback.description ?? ''),
    scope_type: scopeType,
    target_role: targetRole,
    read_access: normalizeAccess(input.read_access, fallback.read_access || DEFAULT_READ_ACCESS),
    write_access: normalizeAccess(input.write_access, fallback.write_access || DEFAULT_WRITE_ACCESS),
    runtime_enabled: input.runtime_enabled != null
      ? Boolean(input.runtime_enabled)
      : (fallback.runtime_enabled != null ? Boolean(fallback.runtime_enabled) : true),
    auto_promote_enabled: input.auto_promote_enabled != null
      ? Boolean(input.auto_promote_enabled)
      : (fallback.auto_promote_enabled != null ? Boolean(fallback.auto_promote_enabled) : false),
    minimum_importance: clampUnitInterval(
      input.minimum_importance ?? fallback.minimum_importance,
      DEFAULT_MINIMUM_IMPORTANCE
    ),
    created_at: fallback.created_at || input.created_at || now,
    updated_at: options.touchTimestamps === false
      ? (input.updated_at || fallback.updated_at || '')
      : now,
  };
}

function canReadGroupMemory(space, user = {}) {
  if (!space) return false;
  if (space.read_access === 'admin') return user?.role === 'admin';
  return Boolean(user?.id || user?.email || user?.role) && user?.role !== 'banned';
}

function canWriteGroupMemory(space, user = {}) {
  if (!space) return false;
  if (space.write_access === 'admin') return user?.role === 'admin';
  return Boolean(user?.id || user?.email || user?.role) && user?.role !== 'banned';
}

function matchesRuntimeAudience(space, agent = {}) {
  if (!space || !space.runtime_enabled || space.read_access !== 'workspace') return false;
  if (space.scope_type === 'role') {
    return normalizeRole(agent?.role) === normalizeRole(space.target_role || 'general');
  }
  return true;
}

function matchesPromotionAudience(space, agent = {}) {
  if (!space || space.read_access !== 'workspace') return false;
  if (space.scope_type === 'role') {
    return normalizeRole(agent?.role) === normalizeRole(space.target_role || 'general');
  }
  return true;
}

function buildGroupMemoryPath(space) {
  return `groups/${space.id}/MEMORY.md`;
}

async function readWorkspaceSettings(db, workspaceId, keys = []) {
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!Array.isArray(keys) || keys.length === 0) return new Map();

  const result = await db.query(
    `SELECT key, value
       FROM ${SCHEMA}.workspace_settings
      WHERE workspace_id = $1
        AND key = ANY($2::text[])`,
    [workspaceId, keys]
  );

  return new Map(result.rows.map((row) => [row.key, row.value]));
}

async function upsertWorkspaceSetting(db, workspaceId, key, value) {
  const serialized = JSON.stringify(value);
  const updated = await db.query(
    `UPDATE ${SCHEMA}.workspace_settings
        SET value = $3::jsonb,
            updated_at = NOW()
      WHERE workspace_id = $1
        AND key = $2`,
    [workspaceId, key, serialized]
  );

  if (updated.rowCount > 0) return;

  await db.query(
    `INSERT INTO ${SCHEMA}.workspace_settings (id, workspace_id, key, value, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3::jsonb, NOW(), NOW())`,
    [workspaceId, key, serialized]
  );
}

function contentKey(spaceId) {
  return `group_memory:${spaceId}:content`;
}

function metaKey(spaceId) {
  return `group_memory:${spaceId}:meta`;
}

function autoEntriesKey(spaceId) {
  return `group_memory:${spaceId}:auto_entries`;
}

function normalizeGroupMemoryAutoEntry(input = {}) {
  const promotedAt = String(
    input.promoted_at || input.promotedAt || new Date().toISOString()
  ).trim() || new Date().toISOString();
  return {
    id: normalizeSpaceId(input.id || input.source_memory_id || `entry-${Date.now()}`) || `entry-${Date.now()}`,
    text: compactLine(input.text, 320),
    type: String(input.type || 'fact').trim().toLowerCase() || 'fact',
    importance: clampUnitInterval(input.importance, DEFAULT_MINIMUM_IMPORTANCE),
    source_memory_id: String(input.source_memory_id || '').trim() || null,
    source_agent_id: String(input.source_agent_id || '').trim() || null,
    source_agent_ref: String(input.source_agent_ref || '').trim() || null,
    verified_at: String(input.verified_at || '').trim() || null,
    verification_note: compactLine(input.verification_note, 180) || null,
    promoted_at: promotedAt,
  };
}

function normalizeGroupMemoryAnalytics(rawMeta = {}, autoEntries = []) {
  const usageByRuntime = rawMeta && typeof rawMeta.usage_by_runtime === 'object' && !Array.isArray(rawMeta.usage_by_runtime)
    ? rawMeta.usage_by_runtime
    : {};

  return {
    runtime_injections: Math.max(0, Number(rawMeta.runtime_injections) || 0),
    usage_by_runtime: {
      chat: Math.max(0, Number(usageByRuntime.chat) || 0),
      task: Math.max(0, Number(usageByRuntime.task) || 0),
      dashboard: Math.max(0, Number(usageByRuntime.dashboard) || 0),
      other: Math.max(0, Number(usageByRuntime.other) || 0),
    },
    last_runtime_at: rawMeta.last_runtime_at || null,
    last_runtime_kind: rawMeta.last_runtime_kind || null,
    last_runtime_agent_ref: rawMeta.last_runtime_agent_ref || null,
    promoted_count: Math.max(
      autoEntries.length,
      Number(rawMeta.promoted_count) || 0
    ),
    auto_entries_count: autoEntries.length,
    last_promoted_at: rawMeta.last_promoted_at || (autoEntries[0]?.promoted_at || null),
    last_promoted_by_agent_ref: rawMeta.last_promoted_by_agent_ref || (autoEntries[0]?.source_agent_ref || null),
  };
}

function renderAutoPromotionSection(autoEntries = []) {
  if (!Array.isArray(autoEntries) || autoEntries.length === 0) return '';
  const lines = autoEntries.slice(0, AUTO_ENTRY_LIMIT).map((entry) => {
    const labelParts = [
      entry.type,
      entry.source_agent_ref,
      entry.verified_at ? String(entry.verified_at).slice(0, 10) : null,
    ].filter(Boolean);
    const label = labelParts.length > 0 ? ` [${labelParts.join(' · ')}]` : '';
    const note = entry.verification_note ? ` (${entry.verification_note})` : '';
    return `- ${entry.text}${label}${note}`;
  });

  return [
    '## Auto-Promoted Discoveries',
    ...lines,
  ].join('\n');
}

function renderGroupMemoryContent(content = '', autoEntries = []) {
  const manual = String(content || '').trim();
  const promoted = renderAutoPromotionSection(autoEntries);
  return [manual, promoted].filter(Boolean).join('\n\n---\n\n').trim();
}

async function loadGroupMemoryIndex({ db, workspaceId }) {
  const values = await readWorkspaceSettings(db, workspaceId, [INDEX_KEY]);
  const raw = values.get(INDEX_KEY);
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((entry) => normalizeGroupMemoryRecord(entry, entry, { touchTimestamps: false }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function saveGroupMemoryIndex({ db, workspaceId, spaces }) {
  await upsertWorkspaceSetting(db, workspaceId, INDEX_KEY, spaces);
  return spaces;
}

async function loadGroupMemorySpace({ db, workspaceId, spaceId }) {
  const id = normalizeSpaceId(spaceId);
  if (!id) throw new Error('spaceId is required');

  const [spaces, values] = await Promise.all([
    loadGroupMemoryIndex({ db, workspaceId }),
    readWorkspaceSettings(db, workspaceId, [contentKey(id), metaKey(id), autoEntriesKey(id)]),
  ]);

  const base = spaces.find((space) => space.id === id);
  if (!base) {
    const error = new Error('Group memory space not found');
    error.statusCode = 404;
    throw error;
  }

  const rawContent = values.get(contentKey(id));
  const rawMeta = values.get(metaKey(id));
  const rawAutoEntries = values.get(autoEntriesKey(id));
  const content = typeof rawContent === 'string'
    ? rawContent
    : (rawContent?.content || '');
  const metadata = rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta)
    ? rawMeta
    : {};
  const autoEntries = Array.isArray(rawAutoEntries)
    ? rawAutoEntries.map((entry) => normalizeGroupMemoryAutoEntry(entry)).filter((entry) => entry.text)
    : [];
  const analytics = normalizeGroupMemoryAnalytics(metadata, autoEntries);

  return {
    ...base,
    path: buildGroupMemoryPath(base),
    content: String(content || ''),
    runtime_content: renderGroupMemoryContent(content, autoEntries),
    auto_entries: autoEntries,
    analytics,
    updatedAt: metadata.updatedAt || base.updated_at || '',
    updatedByEmail: metadata.updatedByEmail || null,
  };
}

async function listGroupMemorySpaces({ db, workspaceId, user = {} }) {
  const spaces = await loadGroupMemoryIndex({ db, workspaceId });
  const values = await readWorkspaceSettings(
    db,
    workspaceId,
    spaces.flatMap((space) => [contentKey(space.id), metaKey(space.id), autoEntriesKey(space.id)])
  );

  return spaces
    .filter((space) => canReadGroupMemory(space, user))
    .map((space) => {
      const rawContent = values.get(contentKey(space.id));
      const rawMeta = values.get(metaKey(space.id));
      const rawAutoEntries = values.get(autoEntriesKey(space.id));
      const content = typeof rawContent === 'string'
        ? rawContent
        : (rawContent?.content || '');
      const metadata = rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta)
        ? rawMeta
        : {};
      const autoEntries = Array.isArray(rawAutoEntries)
        ? rawAutoEntries.map((entry) => normalizeGroupMemoryAutoEntry(entry)).filter((entry) => entry.text)
        : [];
      const analytics = normalizeGroupMemoryAnalytics(metadata, autoEntries);

      return {
        ...space,
        path: buildGroupMemoryPath(space),
        content: String(content || ''),
        runtime_content: renderGroupMemoryContent(content, autoEntries),
        auto_entries: autoEntries,
        analytics,
        updatedAt: metadata.updatedAt || space.updated_at || '',
        updatedByEmail: metadata.updatedByEmail || null,
        readOnly: !canWriteGroupMemory(space, user),
        canRead: true,
        canWrite: canWriteGroupMemory(space, user),
      };
    });
}

async function createGroupMemorySpace({
  db,
  workspaceId,
  input,
  user = {},
  gatewayFactory = createSniparaGateway,
}) {
  if (user?.role !== 'admin') {
    const error = new Error('Admin access required to create group memory spaces');
    error.statusCode = 403;
    throw error;
  }

  const spaces = await loadGroupMemoryIndex({ db, workspaceId });
  const space = normalizeGroupMemoryRecord(input);
  if (spaces.find((entry) => entry.id === space.id)) {
    const error = new Error('Group memory space id already exists');
    error.statusCode = 409;
    throw error;
  }

  const content = String(input?.content || '').trim();
  const gateway = gatewayFactory({ db, workspaceId });
  await gateway.sync.uploadDocument({
    path: buildGroupMemoryPath(space),
    title: `Group Memory · ${space.name}`,
    content: renderGroupMemoryContent(content, []),
  });

  const metadata = {
    updatedAt: new Date().toISOString(),
    updatedByUserId: user.id || null,
    updatedByEmail: user.email || null,
    source: 'vutler-dashboard',
    runtime_injections: 0,
    usage_by_runtime: {},
    promoted_count: 0,
    last_promoted_at: null,
    last_promoted_by_agent_ref: null,
  };

  await saveGroupMemoryIndex({
    db,
    workspaceId,
    spaces: [...spaces, space],
  });
  await upsertWorkspaceSetting(db, workspaceId, contentKey(space.id), content);
  await upsertWorkspaceSetting(db, workspaceId, metaKey(space.id), metadata);
  await upsertWorkspaceSetting(db, workspaceId, autoEntriesKey(space.id), []);

  return {
    ...space,
    path: buildGroupMemoryPath(space),
    content,
    runtime_content: content,
    auto_entries: [],
    analytics: normalizeGroupMemoryAnalytics(metadata, []),
    updatedAt: metadata.updatedAt,
    updatedByEmail: metadata.updatedByEmail,
    readOnly: !canWriteGroupMemory(space, user),
    canRead: true,
    canWrite: canWriteGroupMemory(space, user),
  };
}

async function updateGroupMemorySpace({
  db,
  workspaceId,
  spaceId,
  input,
  user = {},
  gatewayFactory = createSniparaGateway,
}) {
  const current = await loadGroupMemorySpace({ db, workspaceId, spaceId });
  const governanceKeys = [
    'name',
    'description',
    'scope_type',
    'target_role',
    'read_access',
    'write_access',
    'runtime_enabled',
    'auto_promote_enabled',
    'minimum_importance',
    'id',
  ];
  const touchesGovernance = governanceKeys.some((key) => Object.prototype.hasOwnProperty.call(input || {}, key));

  if (touchesGovernance && user?.role !== 'admin') {
    const error = new Error('Admin access required to change group memory governance');
    error.statusCode = 403;
    throw error;
  }
  if (!touchesGovernance && !canWriteGroupMemory(current, user)) {
    const error = new Error('Group memory is read-only for your role');
    error.statusCode = 403;
    throw error;
  }

  const spaces = await loadGroupMemoryIndex({ db, workspaceId });
  const updatedSpace = touchesGovernance
    ? normalizeGroupMemoryRecord(input, current)
    : normalizeGroupMemoryRecord(current, current);
  const content = Object.prototype.hasOwnProperty.call(input || {}, 'content')
    ? String(input.content || '').trim()
    : current.content;
  const autoEntries = Array.isArray(current.auto_entries) ? current.auto_entries : [];

  const gateway = gatewayFactory({ db, workspaceId });
  await gateway.sync.uploadDocument({
    path: buildGroupMemoryPath(updatedSpace),
    title: `Group Memory · ${updatedSpace.name}`,
    content: renderGroupMemoryContent(content, autoEntries),
  });

  const metadata = {
    ...(current.analytics ? {
      runtime_injections: current.analytics.runtime_injections,
      usage_by_runtime: current.analytics.usage_by_runtime,
      promoted_count: current.analytics.promoted_count,
      last_promoted_at: current.analytics.last_promoted_at,
      last_promoted_by_agent_ref: current.analytics.last_promoted_by_agent_ref,
      last_runtime_at: current.analytics.last_runtime_at,
      last_runtime_kind: current.analytics.last_runtime_kind,
      last_runtime_agent_ref: current.analytics.last_runtime_agent_ref,
    } : {}),
    updatedAt: new Date().toISOString(),
    updatedByUserId: user.id || null,
    updatedByEmail: user.email || null,
    source: 'vutler-dashboard',
  };

  const nextSpaces = spaces.map((space) => (
    space.id === current.id ? updatedSpace : space
  ));

  await saveGroupMemoryIndex({ db, workspaceId, spaces: nextSpaces });
  if (updatedSpace.id !== current.id) {
    await upsertWorkspaceSetting(db, workspaceId, contentKey(current.id), '');
    await upsertWorkspaceSetting(db, workspaceId, metaKey(current.id), {});
    await upsertWorkspaceSetting(db, workspaceId, autoEntriesKey(current.id), []);
  }
  await upsertWorkspaceSetting(db, workspaceId, contentKey(updatedSpace.id), content);
  await upsertWorkspaceSetting(db, workspaceId, metaKey(updatedSpace.id), metadata);
  await upsertWorkspaceSetting(db, workspaceId, autoEntriesKey(updatedSpace.id), autoEntries);

  return {
    ...updatedSpace,
    path: buildGroupMemoryPath(updatedSpace),
    content,
    runtime_content: renderGroupMemoryContent(content, autoEntries),
    auto_entries: autoEntries,
    analytics: normalizeGroupMemoryAnalytics(metadata, autoEntries),
    updatedAt: metadata.updatedAt,
    updatedByEmail: metadata.updatedByEmail,
    readOnly: !canWriteGroupMemory(updatedSpace, user),
    canRead: canReadGroupMemory(updatedSpace, user),
    canWrite: canWriteGroupMemory(updatedSpace, user),
  };
}

async function deleteGroupMemorySpace({ db, workspaceId, spaceId, user = {} }) {
  if (user?.role !== 'admin') {
    const error = new Error('Admin access required to delete group memory spaces');
    error.statusCode = 403;
    throw error;
  }

  const id = normalizeSpaceId(spaceId);
  const spaces = await loadGroupMemoryIndex({ db, workspaceId });
  const nextSpaces = spaces.filter((space) => space.id !== id);
  if (nextSpaces.length === spaces.length) {
    const error = new Error('Group memory space not found');
    error.statusCode = 404;
    throw error;
  }

  await saveGroupMemoryIndex({ db, workspaceId, spaces: nextSpaces });
  return { id, deleted: true };
}

async function recordRuntimeUsage({
  db,
  workspaceId,
  spaces = [],
  values = new Map(),
  agent = {},
  runtime = 'chat',
}) {
  const runtimeKey = ['chat', 'task', 'dashboard'].includes(String(runtime || '').trim().toLowerCase())
    ? String(runtime || '').trim().toLowerCase()
    : 'other';

  await Promise.all(spaces.map(async (space) => {
    const rawMeta = values.get(metaKey(space.id));
    const rawAutoEntries = values.get(autoEntriesKey(space.id));
    const metadata = rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta)
      ? { ...rawMeta }
      : {};
    const autoEntries = Array.isArray(rawAutoEntries)
      ? rawAutoEntries.map((entry) => normalizeGroupMemoryAutoEntry(entry)).filter((entry) => entry.text)
      : [];
    const usageByRuntime = metadata && typeof metadata.usage_by_runtime === 'object' && !Array.isArray(metadata.usage_by_runtime)
      ? { ...metadata.usage_by_runtime }
      : {};

    usageByRuntime[runtimeKey] = Math.max(0, Number(usageByRuntime[runtimeKey]) || 0) + 1;
    metadata.runtime_injections = Math.max(0, Number(metadata.runtime_injections) || 0) + 1;
    metadata.usage_by_runtime = usageByRuntime;
    metadata.last_runtime_at = new Date().toISOString();
    metadata.last_runtime_kind = runtimeKey;
    metadata.last_runtime_agent_ref = agent?.username || agent?.id || null;

    await upsertWorkspaceSetting(db, workspaceId, metaKey(space.id), metadata);
    values.set(metaKey(space.id), metadata);
    values.set(autoEntriesKey(space.id), autoEntries);
  }));
}

async function listRuntimeGroupMemories({ db, workspaceId, agent, recordUsage = false, runtime = 'chat' }) {
  if (!workspaceId || !agent) return [];

  const bindings = buildAgentMemoryBindings(agent, workspaceId);
  const spaces = await loadGroupMemoryIndex({ db, workspaceId });
  const applicable = spaces.filter((space) => matchesRuntimeAudience(space, bindings));
  if (applicable.length === 0) return [];

  const values = await readWorkspaceSettings(
    db,
    workspaceId,
    applicable.flatMap((space) => [contentKey(space.id), metaKey(space.id), autoEntriesKey(space.id)])
  );

  if (recordUsage) {
    await recordRuntimeUsage({
      db,
      workspaceId,
      spaces: applicable,
      values,
      agent,
      runtime,
    });
  }

  return applicable
    .map((space) => {
      const rawContent = values.get(contentKey(space.id));
      const rawAutoEntries = values.get(autoEntriesKey(space.id));
      const content = typeof rawContent === 'string'
        ? rawContent
        : (rawContent?.content || '');
      const autoEntries = Array.isArray(rawAutoEntries)
        ? rawAutoEntries.map((entry) => normalizeGroupMemoryAutoEntry(entry)).filter((entry) => entry.text)
        : [];
      const rendered = renderGroupMemoryContent(content, autoEntries);
      const trimmed = String(rendered || '').trim();
      if (!trimmed) return null;
      return {
        id: space.id,
        name: space.name,
        description: space.description,
        scope_type: space.scope_type,
        target_role: space.target_role || null,
        runtime_enabled: true,
        auto_promote_enabled: space.auto_promote_enabled === true,
        minimum_importance: space.minimum_importance,
        content: trimmed,
        path: buildGroupMemoryPath(space),
      };
    })
    .filter(Boolean);
}

async function listAgentGroupMemories({ db, workspaceId, agentIdOrUsername }) {
  const agent = await resolveAgentRecord(db, workspaceId, agentIdOrUsername);
  const spaces = await listRuntimeGroupMemories({ db, workspaceId, agent });
  return {
    agent: {
      id: agent.id,
      username: agent.username,
      role: agent.role,
    },
    spaces,
  };
}

async function autoPromoteVerifiedMemoryToGroupSpaces({
  db,
  workspaceId,
  agent,
  memory,
  verificationNote = '',
  gatewayFactory = createSniparaGateway,
}) {
  if (!workspaceId || !agent || !memory) return [];
  if (!isPromotableMemory(memory)) return [];
  if (String(memory.visibility || '').trim().toLowerCase() === 'internal') return [];

  const verifiedAt = String(memory.verified_at || memory?.metadata?.verified_at || '').trim();
  if (!verifiedAt) return [];

  const bindings = buildAgentMemoryBindings(agent, workspaceId);
  const spaces = await loadGroupMemoryIndex({ db, workspaceId });
  const eligible = spaces.filter((space) => (
    space.auto_promote_enabled === true
    && matchesPromotionAudience(space, bindings)
    && (Number(memory.importance) || 0) >= Number(space.minimum_importance || DEFAULT_MINIMUM_IMPORTANCE)
  ));
  if (eligible.length === 0) return [];

  const values = await readWorkspaceSettings(
    db,
    workspaceId,
    eligible.flatMap((space) => [contentKey(space.id), metaKey(space.id), autoEntriesKey(space.id)])
  );
  const gateway = gatewayFactory({ db, workspaceId });
  const promoted = [];

  for (const space of eligible) {
    const rawContent = values.get(contentKey(space.id));
    const rawMeta = values.get(metaKey(space.id));
    const rawAutoEntries = values.get(autoEntriesKey(space.id));
    const content = typeof rawContent === 'string'
      ? rawContent
      : (rawContent?.content || '');
    const metadata = rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta)
      ? { ...rawMeta }
      : {};
    const autoEntries = Array.isArray(rawAutoEntries)
      ? rawAutoEntries.map((entry) => normalizeGroupMemoryAutoEntry(entry)).filter((entry) => entry.text)
      : [];

    const normalizedText = canonicalizeText(memory.text);
    const combinedText = canonicalizeText(renderGroupMemoryContent(content, autoEntries));
    if (!normalizedText || combinedText.includes(normalizedText)) continue;
    if (autoEntries.some((entry) => entry.source_memory_id && entry.source_memory_id === memory.id)) continue;

    const entry = normalizeGroupMemoryAutoEntry({
      id: memory.id,
      text: memory.text,
      type: memory.type,
      importance: memory.importance,
      source_memory_id: memory.id,
      source_agent_id: memory.agent_id || bindings.agentId || null,
      source_agent_ref: bindings.agentRef,
      verified_at: verifiedAt,
      verification_note: verificationNote || memory.verification_note || memory?.metadata?.verification_note || '',
      promoted_at: new Date().toISOString(),
    });
    const nextEntries = [entry, ...autoEntries].slice(0, AUTO_ENTRY_LIMIT);

    metadata.promoted_count = Math.max(autoEntries.length, Number(metadata.promoted_count) || 0) + 1;
    metadata.last_promoted_at = entry.promoted_at;
    metadata.last_promoted_by_agent_ref = entry.source_agent_ref || null;

    await upsertWorkspaceSetting(db, workspaceId, autoEntriesKey(space.id), nextEntries);
    await upsertWorkspaceSetting(db, workspaceId, metaKey(space.id), metadata);
    await gateway.sync.uploadDocument({
      path: buildGroupMemoryPath(space),
      title: `Group Memory · ${space.name}`,
      content: renderGroupMemoryContent(content, nextEntries),
    });

    promoted.push({
      id: space.id,
      name: space.name,
      path: buildGroupMemoryPath(space),
      entry,
    });
  }

  return promoted;
}

module.exports = {
  normalizeGroupMemoryRecord,
  canReadGroupMemory,
  canWriteGroupMemory,
  matchesRuntimeAudience,
  renderGroupMemoryContent,
  listGroupMemorySpaces,
  loadGroupMemorySpace,
  createGroupMemorySpace,
  updateGroupMemorySpace,
  deleteGroupMemorySpace,
  listRuntimeGroupMemories,
  listAgentGroupMemories,
  autoPromoteVerifiedMemoryToGroupSpaces,
};
