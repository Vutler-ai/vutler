'use strict';

const { createSniparaGateway } = require('./snipara/gateway');
const { normalizeRole, buildAgentMemoryBindings, resolveAgentRecord } = require('./sniparaMemoryService');

const SCHEMA = 'tenant_vutler';
const INDEX_KEY = 'group_memory:index';
const DEFAULT_READ_ACCESS = 'workspace';
const DEFAULT_WRITE_ACCESS = 'admin';

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
    readWorkspaceSettings(db, workspaceId, [contentKey(id), metaKey(id)]),
  ]);

  const base = spaces.find((space) => space.id === id);
  if (!base) {
    const error = new Error('Group memory space not found');
    error.statusCode = 404;
    throw error;
  }

  const rawContent = values.get(contentKey(id));
  const rawMeta = values.get(metaKey(id));
  const content = typeof rawContent === 'string'
    ? rawContent
    : (rawContent?.content || '');
  const metadata = rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta)
    ? rawMeta
    : {};

  return {
    ...base,
    path: buildGroupMemoryPath(base),
    content: String(content || ''),
    updatedAt: metadata.updatedAt || base.updated_at || '',
    updatedByEmail: metadata.updatedByEmail || null,
  };
}

async function listGroupMemorySpaces({ db, workspaceId, user = {} }) {
  const spaces = await loadGroupMemoryIndex({ db, workspaceId });
  const values = await readWorkspaceSettings(
    db,
    workspaceId,
    spaces.flatMap((space) => [contentKey(space.id), metaKey(space.id)])
  );

  return spaces
    .filter((space) => canReadGroupMemory(space, user))
    .map((space) => {
      const rawContent = values.get(contentKey(space.id));
      const rawMeta = values.get(metaKey(space.id));
      const content = typeof rawContent === 'string'
        ? rawContent
        : (rawContent?.content || '');
      const metadata = rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta)
        ? rawMeta
        : {};

      return {
        ...space,
        path: buildGroupMemoryPath(space),
        content: String(content || ''),
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
    content,
  });

  const metadata = {
    updatedAt: new Date().toISOString(),
    updatedByUserId: user.id || null,
    updatedByEmail: user.email || null,
    source: 'vutler-dashboard',
  };

  await saveGroupMemoryIndex({
    db,
    workspaceId,
    spaces: [...spaces, space],
  });
  await upsertWorkspaceSetting(db, workspaceId, contentKey(space.id), content);
  await upsertWorkspaceSetting(db, workspaceId, metaKey(space.id), metadata);

  return {
    ...space,
    path: buildGroupMemoryPath(space),
    content,
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
  const governanceKeys = ['name', 'description', 'scope_type', 'target_role', 'read_access', 'write_access', 'runtime_enabled', 'id'];
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

  const gateway = gatewayFactory({ db, workspaceId });
  await gateway.sync.uploadDocument({
    path: buildGroupMemoryPath(updatedSpace),
    title: `Group Memory · ${updatedSpace.name}`,
    content,
  });

  const metadata = {
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
  }
  await upsertWorkspaceSetting(db, workspaceId, contentKey(updatedSpace.id), content);
  await upsertWorkspaceSetting(db, workspaceId, metaKey(updatedSpace.id), metadata);

  return {
    ...updatedSpace,
    path: buildGroupMemoryPath(updatedSpace),
    content,
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

async function listRuntimeGroupMemories({ db, workspaceId, agent }) {
  if (!workspaceId || !agent) return [];

  const bindings = buildAgentMemoryBindings(agent, workspaceId);
  const spaces = await loadGroupMemoryIndex({ db, workspaceId });
  const applicable = spaces.filter((space) => matchesRuntimeAudience(space, bindings));
  if (applicable.length === 0) return [];

  const values = await readWorkspaceSettings(
    db,
    workspaceId,
    applicable.flatMap((space) => [contentKey(space.id), metaKey(space.id)])
  );

  return applicable
    .map((space) => {
      const rawContent = values.get(contentKey(space.id));
      const content = typeof rawContent === 'string'
        ? rawContent
        : (rawContent?.content || '');
      const trimmed = String(content || '').trim();
      if (!trimmed) return null;
      return {
        id: space.id,
        name: space.name,
        description: space.description,
        scope_type: space.scope_type,
        target_role: space.target_role || null,
        runtime_enabled: true,
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

module.exports = {
  normalizeGroupMemoryRecord,
  canReadGroupMemory,
  canWriteGroupMemory,
  matchesRuntimeAudience,
  listGroupMemorySpaces,
  loadGroupMemorySpace,
  createGroupMemorySpace,
  updateGroupMemorySpace,
  deleteGroupMemorySpace,
  listRuntimeGroupMemories,
  listAgentGroupMemories,
};
