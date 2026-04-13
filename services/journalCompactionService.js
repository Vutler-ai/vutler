'use strict';

const { createSniparaGateway, extractSniparaText } = require('./snipara/gateway');
const { buildAgentMemoryBindings, resolveAgentRecord } = require('./sniparaMemoryService');
const {
  saveWorkspaceSessionBrief,
  saveAgentContinuityBrief,
  AGENT_SESSION_KIND,
} = require('./sessionContinuityService');

const SCHEMA = 'tenant_vutler';
const WORKSPACE_SCOPE = 'workspace';
const AGENT_SCOPE = 'agent';
const JOURNAL_AUTOMATION_MODE_MANUAL = 'manual';
const JOURNAL_AUTOMATION_MODE_ON_SAVE = 'on_save';
const DEFAULT_AUTOMATION_MINIMUM_LENGTH = {
  [WORKSPACE_SCOPE]: 160,
  [AGENT_SCOPE]: 120,
};

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

function normalizeJournalAutomationScope(value) {
  return String(value || '').trim().toLowerCase() === AGENT_SCOPE ? AGENT_SCOPE : WORKSPACE_SCOPE;
}

function normalizeJournalAutomationMode(value) {
  return String(value || '').trim().toLowerCase() === JOURNAL_AUTOMATION_MODE_ON_SAVE
    ? JOURNAL_AUTOMATION_MODE_ON_SAVE
    : JOURNAL_AUTOMATION_MODE_MANUAL;
}

function clampPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function buildJournalAutomationPolicyKey(scope) {
  return `journal_automation:${normalizeJournalAutomationScope(scope)}:policy`;
}

function defaultJournalAutomationPolicy(scope) {
  const normalizedScope = normalizeJournalAutomationScope(scope);
  return {
    scope: normalizedScope,
    mode: JOURNAL_AUTOMATION_MODE_MANUAL,
    enabled: false,
    minimum_length: DEFAULT_AUTOMATION_MINIMUM_LENGTH[normalizedScope],
    target: normalizedScope === WORKSPACE_SCOPE ? 'workspace_session_brief' : 'agent_session_brief',
    updatedAt: '',
    updatedByEmail: null,
  };
}

function normalizeJournalAutomationPolicy(scope, rawPolicy = {}) {
  const defaults = defaultJournalAutomationPolicy(scope);
  const minimumLength = clampPositiveInteger(
    rawPolicy.minimum_length,
    defaults.minimum_length
  );
  const mode = normalizeJournalAutomationMode(rawPolicy.mode);

  return {
    ...defaults,
    mode,
    enabled: mode === JOURNAL_AUTOMATION_MODE_ON_SAVE,
    minimum_length: minimumLength,
    updatedAt: rawPolicy.updatedAt || '',
    updatedByEmail: rawPolicy.updatedByEmail || null,
  };
}

async function getJournalAutomationPolicy({ db, workspaceId, scope }) {
  const normalizedScope = normalizeJournalAutomationScope(scope);
  const key = buildJournalAutomationPolicyKey(normalizedScope);
  const values = await readWorkspaceSettings(db, workspaceId, [key]);
  return normalizeJournalAutomationPolicy(normalizedScope, values.get(key) || {});
}

async function listJournalAutomationPolicies({ db, workspaceId }) {
  const workspace = await getJournalAutomationPolicy({ db, workspaceId, scope: WORKSPACE_SCOPE });
  const agent = await getJournalAutomationPolicy({ db, workspaceId, scope: AGENT_SCOPE });
  return { workspace, agent };
}

async function saveJournalAutomationPolicy({
  db,
  workspaceId,
  scope,
  policy = {},
  user = {},
}) {
  if (!workspaceId) throw new Error('workspaceId is required');

  const normalizedScope = normalizeJournalAutomationScope(scope);
  const current = await getJournalAutomationPolicy({ db, workspaceId, scope: normalizedScope });
  const next = normalizeJournalAutomationPolicy(normalizedScope, {
    ...current,
    ...policy,
    updatedAt: new Date().toISOString(),
    updatedByUserId: user.id || null,
    updatedByEmail: user.email || null,
  });

  await upsertWorkspaceSetting(
    db,
    workspaceId,
    buildJournalAutomationPolicyKey(normalizedScope),
    next
  );

  return next;
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

function buildAutomationResult({
  scope,
  policy,
  content,
  status,
  reason,
  brief = null,
}) {
  const normalizedScope = normalizeJournalAutomationScope(scope);
  const normalizedPolicy = normalizeJournalAutomationPolicy(normalizedScope, policy);
  return {
    scope: normalizedScope,
    mode: normalizedPolicy.mode,
    enabled: normalizedPolicy.enabled,
    minimum_length: normalizedPolicy.minimum_length,
    content_length: String(content || '').trim().length,
    status,
    reason,
    triggered: status === 'refreshed',
    target: normalizedPolicy.target,
    brief_kind: brief?.kind || null,
    brief_path: brief?.path || null,
    updatedAt: brief?.updatedAt || '',
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

async function runWorkspaceJournalAutomation({
  db,
  workspaceId,
  date,
  content,
  user = {},
  gatewayFactory = createSniparaGateway,
  policy = null,
}) {
  const automationPolicy = policy || await getJournalAutomationPolicy({
    db,
    workspaceId,
    scope: WORKSPACE_SCOPE,
  });
  const trimmedContent = String(content || '').trim();

  if (automationPolicy.mode !== JOURNAL_AUTOMATION_MODE_ON_SAVE) {
    return buildAutomationResult({
      scope: WORKSPACE_SCOPE,
      policy: automationPolicy,
      content: trimmedContent,
      status: 'skipped',
      reason: 'manual_mode',
    });
  }

  if (trimmedContent.length < automationPolicy.minimum_length) {
    return buildAutomationResult({
      scope: WORKSPACE_SCOPE,
      policy: automationPolicy,
      content: trimmedContent,
      status: 'skipped',
      reason: 'below_minimum_length',
    });
  }

  const spec = buildWorkspaceJournalSpec(date);
  const summary = await summarizeJournal({
    db,
    workspaceId,
    spec,
    content: trimmedContent,
    gatewayFactory,
    summaryArgs: {
      scope: WORKSPACE_SCOPE,
      automation_source: 'save',
    },
  });

  if (!String(summary || '').trim()) {
    return buildAutomationResult({
      scope: WORKSPACE_SCOPE,
      policy: automationPolicy,
      content: trimmedContent,
      status: 'skipped',
      reason: 'empty_summary',
    });
  }

  const brief = await saveWorkspaceSessionBrief({
    db,
    workspaceId,
    content: summary,
    user,
    gatewayFactory,
  });

  return buildAutomationResult({
    scope: WORKSPACE_SCOPE,
    policy: automationPolicy,
    content: trimmedContent,
    status: 'refreshed',
    reason: 'auto_refresh',
    brief,
  });
}

async function runAgentJournalAutomation({
  db,
  workspaceId,
  agentIdOrUsername,
  date,
  content,
  user = {},
  gatewayFactory = createSniparaGateway,
  policy = null,
}) {
  const automationPolicy = policy || await getJournalAutomationPolicy({
    db,
    workspaceId,
    scope: AGENT_SCOPE,
  });
  const trimmedContent = String(content || '').trim();

  if (automationPolicy.mode !== JOURNAL_AUTOMATION_MODE_ON_SAVE) {
    return buildAutomationResult({
      scope: AGENT_SCOPE,
      policy: automationPolicy,
      content: trimmedContent,
      status: 'skipped',
      reason: 'manual_mode',
    });
  }

  if (trimmedContent.length < automationPolicy.minimum_length) {
    return buildAutomationResult({
      scope: AGENT_SCOPE,
      policy: automationPolicy,
      content: trimmedContent,
      status: 'skipped',
      reason: 'below_minimum_length',
    });
  }

  const resolved = await resolveAgentJournal({ db, workspaceId, agentIdOrUsername, date });
  const summary = await summarizeJournal({
    db,
    workspaceId,
    spec: resolved.spec,
    content: trimmedContent,
    gatewayFactory,
    summaryArgs: {
      scope: AGENT_SCOPE,
      agent_id: resolved.bindings.agentId || resolved.bindings.sniparaInstanceId || resolved.bindings.agentRef,
      agent_ref: resolved.bindings.agentRef,
      automation_source: 'save',
    },
  });

  if (!String(summary || '').trim()) {
    return buildAutomationResult({
      scope: AGENT_SCOPE,
      policy: automationPolicy,
      content: trimmedContent,
      status: 'skipped',
      reason: 'empty_summary',
    });
  }

  const brief = await saveAgentContinuityBrief({
    db,
    workspaceId,
    agentIdOrUsername,
    kind: AGENT_SESSION_KIND,
    content: summary,
    user,
    gatewayFactory,
  });

  return buildAutomationResult({
    scope: AGENT_SCOPE,
    policy: automationPolicy,
    content: trimmedContent,
    status: 'refreshed',
    reason: 'auto_refresh',
    brief,
  });
}

async function getWorkspaceJournal({ db, workspaceId, date }) {
  const spec = buildWorkspaceJournalSpec(date);
  const [state, automationPolicy] = await Promise.all([
    loadJournalState({ db, workspaceId, spec }),
    getJournalAutomationPolicy({ db, workspaceId, scope: WORKSPACE_SCOPE }),
  ]);
  return {
    ...state,
    automationPolicy,
  };
}

async function saveWorkspaceJournal({
  db,
  workspaceId,
  date,
  content,
  user = {},
  gatewayFactory = createSniparaGateway,
}) {
  const spec = buildWorkspaceJournalSpec(date);
  const [state, automationPolicy] = await Promise.all([
    saveJournalState({
      db,
      workspaceId,
      spec,
      content,
      user,
      gatewayFactory,
      journalArgs: {
        scope: 'workspace',
      },
    }),
    getJournalAutomationPolicy({ db, workspaceId, scope: WORKSPACE_SCOPE }),
  ]);

  let automation;
  try {
    automation = await runWorkspaceJournalAutomation({
      db,
      workspaceId,
      date: spec.date,
      content,
      user,
      gatewayFactory,
      policy: automationPolicy,
    });
  } catch (error) {
    automation = buildAutomationResult({
      scope: WORKSPACE_SCOPE,
      policy: automationPolicy,
      content,
      status: 'skipped',
      reason: 'automation_error',
    });
  }

  return {
    ...state,
    automationPolicy,
    automation,
  };
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
  const [state, automationPolicy] = await Promise.all([
    loadJournalState({ db, workspaceId, spec: resolved.spec }),
    getJournalAutomationPolicy({ db, workspaceId, scope: AGENT_SCOPE }),
  ]);
  return {
    ...state,
    automationPolicy,
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
  const [state, automationPolicy] = await Promise.all([
    saveJournalState({
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
    }),
    getJournalAutomationPolicy({ db, workspaceId, scope: AGENT_SCOPE }),
  ]);

  let automation;
  try {
    automation = await runAgentJournalAutomation({
      db,
      workspaceId,
      agentIdOrUsername,
      date: resolved.spec.date,
      content,
      user,
      gatewayFactory,
      policy: automationPolicy,
    });
  } catch (error) {
    automation = buildAutomationResult({
      scope: AGENT_SCOPE,
      policy: automationPolicy,
      content,
      status: 'skipped',
      reason: 'automation_error',
    });
  }

  return {
    ...state,
    automationPolicy,
    automation,
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
  WORKSPACE_SCOPE,
  AGENT_SCOPE,
  JOURNAL_AUTOMATION_MODE_MANUAL,
  JOURNAL_AUTOMATION_MODE_ON_SAVE,
  normalizeJournalDate,
  normalizeJournalAutomationScope,
  normalizeJournalAutomationMode,
  getJournalAutomationPolicy,
  listJournalAutomationPolicies,
  saveJournalAutomationPolicy,
  runWorkspaceJournalAutomation,
  runAgentJournalAutomation,
  getWorkspaceJournal,
  saveWorkspaceJournal,
  summarizeWorkspaceJournalToBrief,
  getAgentJournal,
  saveAgentJournal,
  summarizeAgentJournalToBrief,
};
