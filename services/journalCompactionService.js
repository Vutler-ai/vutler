'use strict';

const { createSniparaGateway, extractSniparaText } = require('./snipara/gateway');
const { buildAgentMemoryBindings, resolveAgentRecord } = require('./sniparaMemoryService');
const {
  saveWorkspaceSessionBrief,
  saveAgentContinuityBrief,
  AGENT_SESSION_KIND,
} = require('./sessionContinuityService');

const SCHEMA = 'tenant_vutler';

function normalizeJournalDate(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return new Date().toISOString().slice(0, 10);
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

function buildWorkspaceJournalSpec(date) {
  const normalizedDate = normalizeJournalDate(date);
  return {
    date: normalizedDate,
    title: `Workspace Journal ${normalizedDate}`,
    path: `journals/workspace/${normalizedDate}.md`,
    contentKey: `journal:workspace:${normalizedDate}`,
    metaKey: `journal:workspace:${normalizedDate}:meta`,
  };
}

function buildAgentJournalSpec(bindings, date) {
  const normalizedDate = normalizeJournalDate(date);
  return {
    date: normalizedDate,
    title: `Agent Journal ${normalizedDate}`,
    path: `agents/${bindings.agentRef}/journals/${normalizedDate}.md`,
    contentKey: `journal:${bindings.agentRef}:${normalizedDate}`,
    metaKey: `journal:${bindings.agentRef}:${normalizedDate}:meta`,
  };
}

async function loadJournalState({ db, workspaceId, spec }) {
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
    date: spec.date,
    title: spec.title,
    path: spec.path,
    content: String(content || ''),
    updatedAt: metadata.updatedAt || '',
    updatedByEmail: metadata.updatedByEmail || null,
  };
}

async function saveJournalState({
  db,
  workspaceId,
  spec,
  content,
  user = {},
  gatewayFactory = createSniparaGateway,
  journalArgs = {},
}) {
  if (!workspaceId) throw new Error('workspaceId is required');
  const trimmedContent = String(content || '').trim();
  if (!trimmedContent) throw new Error('content is required');

  const gateway = gatewayFactory({ db, workspaceId });
  await gateway.sync.uploadDocument({
    path: spec.path,
    title: spec.title,
    content: trimmedContent,
  });

  await gateway.journal.append({
    date: spec.date,
    path: spec.path,
    title: spec.title,
    text: trimmedContent,
    entry: trimmedContent,
    ...journalArgs,
  }).catch(() => null);

  const metadata = {
    updatedAt: new Date().toISOString(),
    updatedByUserId: user.id || null,
    updatedByEmail: user.email || null,
    source: 'vutler-dashboard',
  };

  await upsertWorkspaceSetting(db, workspaceId, spec.contentKey, trimmedContent);
  await upsertWorkspaceSetting(db, workspaceId, spec.metaKey, metadata);

  return {
    date: spec.date,
    title: spec.title,
    path: spec.path,
    content: trimmedContent,
    updatedAt: metadata.updatedAt,
    updatedByEmail: metadata.updatedByEmail,
  };
}

function fallbackJournalSummary(content) {
  return String(content || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .join('\n');
}

async function summarizeJournal({
  db,
  workspaceId,
  spec,
  content,
  gatewayFactory = createSniparaGateway,
  summaryArgs = {},
}) {
  if (!String(content || '').trim()) return '';
  const gateway = gatewayFactory({ db, workspaceId });
  const response = await gateway.journal.summarize({
    date: spec.date,
    path: spec.path,
    title: spec.title,
    text: content,
    content,
    ...summaryArgs,
  }).catch(() => null);

  const extracted = extractSniparaText(response);
  return String(extracted || '').trim() || fallbackJournalSummary(content);
}

function getWorkspaceJournal({ db, workspaceId, date }) {
  const spec = buildWorkspaceJournalSpec(date);
  return loadJournalState({ db, workspaceId, spec });
}

function saveWorkspaceJournal({
  db,
  workspaceId,
  date,
  content,
  user = {},
  gatewayFactory = createSniparaGateway,
}) {
  const spec = buildWorkspaceJournalSpec(date);
  return saveJournalState({
    db,
    workspaceId,
    spec,
    content,
    user,
    gatewayFactory,
    journalArgs: {
      scope: 'workspace',
    },
  });
}

async function summarizeWorkspaceJournalToBrief({
  db,
  workspaceId,
  date,
  user = {},
  gatewayFactory = createSniparaGateway,
}) {
  const journal = await getWorkspaceJournal({ db, workspaceId, date });
  const summary = await summarizeJournal({
    db,
    workspaceId,
    spec: buildWorkspaceJournalSpec(date),
    content: journal.content,
    gatewayFactory,
    summaryArgs: {
      scope: 'workspace',
    },
  });

  const brief = await saveWorkspaceSessionBrief({
    db,
    workspaceId,
    content: summary,
    user,
    gatewayFactory,
  });

  return {
    journal,
    brief,
  };
}

async function resolveAgentJournal({ db, workspaceId, agentIdOrUsername, date }) {
  const agent = await resolveAgentRecord(db, workspaceId, agentIdOrUsername);
  const bindings = buildAgentMemoryBindings(agent, workspaceId);
  const spec = buildAgentJournalSpec(bindings, date);
  return { agent, bindings, spec };
}

async function getAgentJournal({ db, workspaceId, agentIdOrUsername, date }) {
  const resolved = await resolveAgentJournal({ db, workspaceId, agentIdOrUsername, date });
  const state = await loadJournalState({ db, workspaceId, spec: resolved.spec });
  return {
    ...state,
    agent: {
      id: resolved.agent.id,
      username: resolved.agent.username,
      role: resolved.agent.role,
    },
  };
}

async function saveAgentJournal({
  db,
  workspaceId,
  agentIdOrUsername,
  date,
  content,
  user = {},
  gatewayFactory = createSniparaGateway,
}) {
  const resolved = await resolveAgentJournal({ db, workspaceId, agentIdOrUsername, date });
  const state = await saveJournalState({
    db,
    workspaceId,
    spec: resolved.spec,
    content,
    user,
    gatewayFactory,
    journalArgs: {
      scope: 'agent',
      agent_id: resolved.bindings.agentId || resolved.bindings.sniparaInstanceId || resolved.bindings.agentRef,
      agent_ref: resolved.bindings.agentRef,
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

async function summarizeAgentJournalToBrief({
  db,
  workspaceId,
  agentIdOrUsername,
  date,
  user = {},
  gatewayFactory = createSniparaGateway,
}) {
  const resolved = await resolveAgentJournal({ db, workspaceId, agentIdOrUsername, date });
  const journal = await loadJournalState({ db, workspaceId, spec: resolved.spec });
  const summary = await summarizeJournal({
    db,
    workspaceId,
    spec: resolved.spec,
    content: journal.content,
    gatewayFactory,
    summaryArgs: {
      scope: 'agent',
      agent_id: resolved.bindings.agentId || resolved.bindings.sniparaInstanceId || resolved.bindings.agentRef,
      agent_ref: resolved.bindings.agentRef,
    },
  });

  const brief = await saveAgentContinuityBrief({
    db,
    workspaceId,
    agentIdOrUsername,
    kind: AGENT_SESSION_KIND,
    content: summary,
    user,
    gatewayFactory,
  });

  return {
    journal: {
      ...journal,
      agent: {
        id: resolved.agent.id,
        username: resolved.agent.username,
        role: resolved.agent.role,
      },
    },
    brief,
  };
}

module.exports = {
  normalizeJournalDate,
  getWorkspaceJournal,
  saveWorkspaceJournal,
  summarizeWorkspaceJournalToBrief,
  getAgentJournal,
  saveAgentJournal,
  summarizeAgentJournalToBrief,
};
