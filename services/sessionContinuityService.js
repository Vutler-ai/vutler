'use strict';

const { createSniparaGateway } = require('./snipara/gateway');
const { buildAgentMemoryBindings, resolveAgentRecord } = require('./sniparaMemoryService');

const SCHEMA = 'tenant_vutler';
const WORKSPACE_KIND = 'workspace_session';
const AGENT_PROFILE_KIND = 'agent_profile';
const AGENT_SESSION_KIND = 'agent_session';

function normalizeContinuityKind(kind) {
  const value = String(kind || '').trim().toLowerCase();
  if (value === AGENT_PROFILE_KIND) return AGENT_PROFILE_KIND;
  if (value === AGENT_SESSION_KIND) return AGENT_SESSION_KIND;
  return WORKSPACE_KIND;
}

function buildWorkspaceContinuitySpec() {
  return {
    kind: WORKSPACE_KIND,
    title: 'Workspace Session Brief',
    path: 'continuity/WORKSPACE-SESSION.md',
    contentKey: 'session_continuity:workspace',
    metaKey: 'session_continuity:workspace:meta',
    summaryType: 'workspace-session',
  };
}

function buildAgentContinuitySpec(bindings, kind) {
  const normalizedKind = normalizeContinuityKind(kind);
  const isProfile = normalizedKind === AGENT_PROFILE_KIND;
  const suffix = isProfile ? 'PROFILE.md' : 'SESSION.md';
  const label = isProfile ? 'Profile Brief' : 'Session Brief';

  return {
    kind: normalizedKind,
    title: `Agent ${label}`,
    path: `agents/${bindings.agentRef}/${suffix}`,
    contentKey: `session_continuity:${bindings.agentRef}:${normalizedKind}`,
    metaKey: `session_continuity:${bindings.agentRef}:${normalizedKind}:meta`,
    summaryType: isProfile ? 'agent-profile' : 'agent-session',
  };
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

async function loadContinuityState({ db, workspaceId, spec }) {
  const values = await readWorkspaceSettings(db, workspaceId, [spec.contentKey, spec.metaKey]);
  const rawContent = values.get(spec.contentKey);
  const rawMeta = values.get(spec.metaKey);

  const content = typeof rawContent === 'string'
    ? rawContent
    : (rawContent?.content || '');
  const metadata = rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta)
    ? rawMeta
    : {};

  return {
    kind: spec.kind,
    title: spec.title,
    path: spec.path,
    content: String(content || ''),
    updatedAt: metadata.updatedAt || '',
    updatedByEmail: metadata.updatedByEmail || null,
  };
}

async function saveContinuityState({
  db,
  workspaceId,
  spec,
  content,
  user = {},
  gatewayFactory = createSniparaGateway,
  summaryMetadata = {},
}) {
  if (!workspaceId) throw new Error('workspaceId is required');

  const trimmedContent = String(content || '').trim();
  if (!trimmedContent) {
    throw new Error('content is required');
  }

  const gateway = gatewayFactory({ db, workspaceId });
  await gateway.sync.uploadDocument({
    path: spec.path,
    title: spec.title,
    content: trimmedContent,
  });

  await gateway.summaries.store({
    path: spec.path,
    title: spec.title,
    text: trimmedContent,
    summary: trimmedContent,
    type: spec.summaryType,
    metadata: {
      source: 'vutler-dashboard',
      continuity_kind: spec.kind,
      ...summaryMetadata,
    },
  });

  const metadata = {
    updatedAt: new Date().toISOString(),
    updatedByUserId: user.id || null,
    updatedByEmail: user.email || null,
    source: 'vutler-dashboard',
  };

  await upsertWorkspaceSetting(db, workspaceId, spec.contentKey, trimmedContent);
  await upsertWorkspaceSetting(db, workspaceId, spec.metaKey, metadata);

  return {
    kind: spec.kind,
    title: spec.title,
    path: spec.path,
    content: trimmedContent,
    updatedAt: metadata.updatedAt,
    updatedByEmail: metadata.updatedByEmail,
  };
}

function getWorkspaceSessionBrief({ db, workspaceId }) {
  return loadContinuityState({
    db,
    workspaceId,
    spec: buildWorkspaceContinuitySpec(),
  });
}

function saveWorkspaceSessionBrief({
  db,
  workspaceId,
  content,
  user = {},
  gatewayFactory = createSniparaGateway,
}) {
  return saveContinuityState({
    db,
    workspaceId,
    spec: buildWorkspaceContinuitySpec(),
    content,
    user,
    gatewayFactory,
    summaryMetadata: {
      scope: 'workspace',
    },
  });
}

async function resolveAgentContinuity({ db, workspaceId, agentIdOrUsername, kind }) {
  const agent = await resolveAgentRecord(db, workspaceId, agentIdOrUsername);
  const bindings = buildAgentMemoryBindings(agent, workspaceId);
  const spec = buildAgentContinuitySpec(bindings, kind);

  return {
    agent,
    bindings,
    spec,
  };
}

async function getAgentContinuityBrief({ db, workspaceId, agentIdOrUsername, kind }) {
  const resolved = await resolveAgentContinuity({ db, workspaceId, agentIdOrUsername, kind });
  const state = await loadContinuityState({ db, workspaceId, spec: resolved.spec });
  return {
    ...state,
    agent: {
      id: resolved.agent.id,
      username: resolved.agent.username,
      role: resolved.agent.role,
    },
  };
}

async function saveAgentContinuityBrief({
  db,
  workspaceId,
  agentIdOrUsername,
  kind,
  content,
  user = {},
  gatewayFactory = createSniparaGateway,
}) {
  const resolved = await resolveAgentContinuity({ db, workspaceId, agentIdOrUsername, kind });
  const state = await saveContinuityState({
    db,
    workspaceId,
    spec: resolved.spec,
    content,
    user,
    gatewayFactory,
    summaryMetadata: {
      scope: 'agent',
      agent_id: resolved.bindings.agentId || resolved.bindings.sniparaInstanceId || resolved.bindings.agentRef,
      agent_ref: resolved.bindings.agentRef,
      role: resolved.bindings.role,
    },
  });

  return {
    ...state,
    agent: {
      id: resolved.agent.id,
      username: resolved.agent.username,
      role: resolved.agent.role,
    },
  };
}

async function listRuntimeContinuitySummaries({ db, workspaceId, agent }) {
  if (!workspaceId || !agent) return [];

  const bindings = buildAgentMemoryBindings(agent, workspaceId);
  const specs = [
    buildWorkspaceContinuitySpec(),
    buildAgentContinuitySpec(bindings, AGENT_PROFILE_KIND),
    buildAgentContinuitySpec(bindings, AGENT_SESSION_KIND),
  ];

  const values = await readWorkspaceSettings(
    db,
    workspaceId,
    specs.flatMap((spec) => [spec.contentKey])
  );

  return specs.map((spec) => {
    const rawContent = values.get(spec.contentKey);
    const content = typeof rawContent === 'string'
      ? rawContent
      : (rawContent?.content || '');

    if (!String(content || '').trim()) return null;

    return {
      type: spec.summaryType,
      text: String(content || '').trim(),
      path: spec.path,
      title: spec.title,
    };
  }).filter(Boolean);
}

module.exports = {
  WORKSPACE_KIND,
  AGENT_PROFILE_KIND,
  AGENT_SESSION_KIND,
  normalizeContinuityKind,
  buildWorkspaceContinuitySpec,
  buildAgentContinuitySpec,
  getWorkspaceSessionBrief,
  saveWorkspaceSessionBrief,
  getAgentContinuityBrief,
  saveAgentContinuityBrief,
  listRuntimeContinuitySummaries,
};
