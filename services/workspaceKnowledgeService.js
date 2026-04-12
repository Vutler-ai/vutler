'use strict';

const { createSniparaGateway } = require('./snipara/gateway');

const SCHEMA = 'tenant_vutler';
const KNOWLEDGE_KEY = 'workspace_knowledge';
const META_KEY = 'workspace_knowledge_meta';
const POLICY_KEY = 'shared_memory_policy';
const DEFAULT_POLICY = {
  read_access: 'workspace',
  write_access: 'admin',
};

function normalizeAccess(value, fallback = 'workspace') {
  return String(value || fallback).trim().toLowerCase() === 'admin' ? 'admin' : 'workspace';
}

function normalizeSharedMemoryPolicy(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_POLICY };
  }
  return {
    read_access: normalizeAccess(value.read_access, DEFAULT_POLICY.read_access),
    write_access: normalizeAccess(value.write_access, DEFAULT_POLICY.write_access),
  };
}

function canReadSharedMemory(policy, user = {}) {
  if (policy.read_access === 'admin') return user?.role === 'admin';
  return Boolean(user?.id || user?.email || user?.role) && user?.role !== 'banned';
}

function canWriteSharedMemory(policy, user = {}) {
  if (policy.write_access === 'admin') return user?.role === 'admin';
  return Boolean(user?.id || user?.email || user?.role) && user?.role !== 'banned';
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

async function getWorkspaceKnowledgeState({ db, workspaceId }) {
  const values = await readWorkspaceSettings(db, workspaceId, [KNOWLEDGE_KEY, META_KEY, POLICY_KEY]);
  const content = typeof values.get(KNOWLEDGE_KEY) === 'string'
    ? values.get(KNOWLEDGE_KEY)
    : (values.get(KNOWLEDGE_KEY)?.content || '');
  const metadata = values.get(META_KEY) && typeof values.get(META_KEY) === 'object'
    ? values.get(META_KEY)
    : {};
  const policy = normalizeSharedMemoryPolicy(values.get(POLICY_KEY));

  return {
    content: String(content || ''),
    metadata,
    policy,
  };
}

async function saveWorkspaceKnowledge({ db, workspaceId, content, user = {} }) {
  if (!workspaceId) throw new Error('workspaceId is required');

  const gateway = createSniparaGateway({ db, workspaceId });
  await gateway.sync.uploadDocument({
    path: 'SOUL.md',
    title: 'Workspace Shared Instructions',
    content,
  });

  const metadata = {
    updatedAt: new Date().toISOString(),
    updatedByUserId: user.id || null,
    updatedByEmail: user.email || null,
    source: 'vutler-dashboard',
  };

  await upsertWorkspaceSetting(db, workspaceId, KNOWLEDGE_KEY, content);
  await upsertWorkspaceSetting(db, workspaceId, META_KEY, metadata);

  return metadata;
}

async function saveSharedMemoryPolicy({ db, workspaceId, policy }) {
  if (!workspaceId) throw new Error('workspaceId is required');
  const normalized = normalizeSharedMemoryPolicy(policy);
  await upsertWorkspaceSetting(db, workspaceId, POLICY_KEY, normalized);
  return normalized;
}

module.exports = {
  DEFAULT_POLICY,
  normalizeSharedMemoryPolicy,
  canReadSharedMemory,
  canWriteSharedMemory,
  getWorkspaceKnowledgeState,
  saveWorkspaceKnowledge,
  saveSharedMemoryPolicy,
};
