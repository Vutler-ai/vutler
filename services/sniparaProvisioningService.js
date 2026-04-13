'use strict';

const { randomUUID } = require('crypto');

const pool = require('../lib/vaultbrix');
const {
  buildSniparaProjectUrl,
  clearSniparaConfigCache,
  normalizeProjectSlug,
} = require('./sniparaResolver');
const sniparaService = require('./sniparaService');

const SCHEMA = 'tenant_vutler';
const PROVISIONING_OPERATIONS_KEY = 'snipara_integrator:operations';
const MAX_PROVISIONING_OPERATIONS = 25;

function extractClientApiKey(payload = {}) {
  return payload?.api_key
    || payload?.project_api_key
    || payload?.key
    || payload?.secret
    || payload?.token
    || null;
}

function isRuntimeReady(existing = {}) {
  return Boolean(
    existing.apiKey
    && existing.apiUrl
    && (existing.projectId || existing.projectSlug)
    && existing.swarmId
  );
}

function determineProvisioningMessage({
  integrationKeyPresent,
  runtimeReady,
  integratorReady,
  recommendedAction,
}) {
  if (!integrationKeyPresent && !runtimeReady) {
    return 'Integrator provisioning is unavailable because SNIPARA_INTEGRATION_KEY is not configured.';
  }
  if (recommendedAction === 'repair_api_key') {
    return 'This workspace still has a Snipara client binding but lost its workspace API key. Repair can mint a replacement key without recreating the client.';
  }
  if (recommendedAction === 'create_swarm') {
    return 'This workspace has project credentials but no swarm binding. Repair can create the missing swarm without recreating the project.';
  }
  if (recommendedAction === 'repair') {
    return 'This workspace has partial Snipara provisioning state. Repair should reconcile missing settings before any reprovision attempt.';
  }
  if (recommendedAction === 'provision') {
    return 'This workspace can be provisioned automatically through the Snipara Integrator API.';
  }
  if (runtimeReady && !integratorReady) {
    return 'Snipara runtime is ready, but integrator-level client metadata is incomplete. Runtime execution still works; external provisioning visibility is limited.';
  }
  if (runtimeReady && integratorReady) {
    return 'Snipara runtime and integrator bindings are ready for this workspace.';
  }
  return 'Snipara provisioning status is incomplete.';
}

async function writeWorkspaceSetting(db, workspaceId, key, value) {
  const serialized = JSON.stringify(value);

  await db.query(
    `INSERT INTO ${SCHEMA}.workspace_settings (id, workspace_id, key, value, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3::jsonb, NOW(), NOW())
     ON CONFLICT (workspace_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [workspaceId, key, serialized]
  ).catch(async () => {
    await db.query(`DELETE FROM ${SCHEMA}.workspace_settings WHERE workspace_id = $1 AND key = $2`, [workspaceId, key]);
    await db.query(
      `INSERT INTO ${SCHEMA}.workspace_settings (id, workspace_id, key, value, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3::jsonb, NOW(), NOW())`,
      [workspaceId, key, serialized]
    );
  });
}

function normalizeWorkspaceSettingValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, 'value')) {
    return value.value;
  }
  return value;
}

async function readWorkspaceSettingValue(db, workspaceId, key) {
  const result = await db.query(
    `SELECT value
     FROM ${SCHEMA}.workspace_settings
     WHERE workspace_id = $1
       AND key = $2
     ORDER BY updated_at DESC NULLS LAST
     LIMIT 1`,
    [workspaceId, key]
  );

  if (!result.rows[0]) return null;
  return normalizeWorkspaceSettingValue(result.rows[0].value);
}

async function readExistingProvisioning(db, workspaceId) {
  const result = await db.query(
    `SELECT key, value
     FROM ${SCHEMA}.workspace_settings
     WHERE workspace_id = $1
       AND key IN (
         'snipara_api_key',
         'snipara_api_url',
         'snipara_project_id',
         'snipara_project_slug',
         'snipara_client_id',
         'snipara_swarm_id'
       )`,
    [workspaceId]
  );

  const map = new Map(result.rows.map((row) => [
    row.key,
    typeof row.value?.value === 'string' ? row.value.value : row.value,
  ]));
  return {
    apiKey: map.get('snipara_api_key') || null,
    apiUrl: map.get('snipara_api_url') || null,
    projectId: map.get('snipara_project_id') || null,
    projectSlug: map.get('snipara_project_slug') || null,
    clientId: map.get('snipara_client_id') || null,
    swarmId: map.get('snipara_swarm_id') || null,
  };
}

function buildProvisioningOperationStatus(diagnostics = {}) {
  if (diagnostics.remote?.error) return 'error';
  if (!diagnostics.integration_key_present && !diagnostics.runtime_ready) return 'error';
  if (!diagnostics.configured || diagnostics.recommended_action !== 'none') return 'warn';
  return 'ok';
}

function buildProvisioningOperationSummary(diagnostics = {}) {
  if (diagnostics.remote?.error) {
    return `Remote integrator probe failed: ${diagnostics.remote.error}`;
  }
  if (diagnostics.configured) {
    return 'Runtime and integrator bindings look healthy for this workspace.';
  }
  return diagnostics.message || 'Provisioning probe completed with follow-up required.';
}

async function appendWorkspaceSniparaProvisioningOperation({
  db = pool,
  workspaceId,
  operation,
  maxEntries = MAX_PROVISIONING_OPERATIONS,
}) {
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!operation || typeof operation !== 'object') throw new Error('operation is required');

  const current = await readWorkspaceSettingValue(db, workspaceId, PROVISIONING_OPERATIONS_KEY);
  const existingEntries = Array.isArray(current) ? current : [];
  const entry = {
    id: operation.id || randomUUID(),
    created_at: operation.created_at || new Date().toISOString(),
    ...operation,
  };
  const next = [entry, ...existingEntries].slice(0, Math.max(1, maxEntries));
  await writeWorkspaceSetting(db, workspaceId, PROVISIONING_OPERATIONS_KEY, next);
  return entry;
}

async function getWorkspaceSniparaProvisioningOperations({
  db = pool,
  workspaceId,
  limit = 10,
}) {
  if (!workspaceId) throw new Error('workspaceId is required');

  const current = await readWorkspaceSettingValue(db, workspaceId, PROVISIONING_OPERATIONS_KEY);
  const entries = Array.isArray(current) ? current : [];
  return {
    operations: entries.slice(0, Math.max(1, limit)),
    count: entries.length,
  };
}

async function getWorkspaceSniparaProvisioningDiagnostics({
  db = pool,
  workspaceId,
}) {
  if (!workspaceId) throw new Error('workspaceId is required');

  const existing = await readExistingProvisioning(db, workspaceId);
  const integrationKeyPresent = Boolean(process.env.SNIPARA_INTEGRATION_KEY);
  const runtimeReady = isRuntimeReady(existing);
  const integratorReady = Boolean(runtimeReady && existing.clientId);
  const missingFields = [];

  if (!existing.apiKey) missingFields.push('api_key');
  if (!existing.apiUrl) missingFields.push('api_url');
  if (!existing.projectId && !existing.projectSlug) missingFields.push('project');
  if (!existing.clientId) missingFields.push('client_id');
  if (!existing.swarmId) missingFields.push('swarm_id');

  let provisioningMode = 'unprovisioned';
  if (integratorReady) provisioningMode = 'integrator';
  else if (runtimeReady) provisioningMode = 'runtime_only';
  else if (missingFields.length < 5) provisioningMode = 'partial';

  let recommendedAction = 'none';
  if (!integrationKeyPresent && !runtimeReady) {
    recommendedAction = 'manual_only';
  } else if (existing.clientId && !existing.apiKey) {
    recommendedAction = 'repair_api_key';
  } else if (existing.apiKey && existing.apiUrl && !existing.swarmId) {
    recommendedAction = 'create_swarm';
  } else if (!runtimeReady && missingFields.length < 5) {
    recommendedAction = 'repair';
  } else if (!runtimeReady) {
    recommendedAction = 'provision';
  }

  let remote = {
    supported: false,
    swarms_count: 0,
    has_matching_swarm: false,
    error: null,
  };

  if (integrationKeyPresent && existing.clientId) {
    try {
      const payload = await sniparaService.listClientSwarms({ clientId: existing.clientId });
      const swarms = Array.isArray(payload?.swarms)
        ? payload.swarms
        : (Array.isArray(payload) ? payload : []);
      remote = {
        supported: true,
        swarms_count: swarms.length,
        has_matching_swarm: existing.swarmId
          ? swarms.some((swarm) => String(swarm?.id || swarm?.swarm_id || '').trim() === String(existing.swarmId).trim())
          : false,
        error: null,
      };
    } catch (error) {
      remote = {
        supported: true,
        swarms_count: 0,
        has_matching_swarm: false,
        error: error.message,
      };
    }
  }

  return {
    configured: runtimeReady,
    runtime_ready: runtimeReady,
    integrator_ready: integratorReady,
    integration_key_present: integrationKeyPresent,
    can_provision: integrationKeyPresent,
    can_repair: integrationKeyPresent && !runtimeReady,
    provisioning_mode: provisioningMode,
    recommended_action: recommendedAction,
    missing_fields: missingFields,
    fields: {
      api_key_present: Boolean(existing.apiKey),
      api_url: existing.apiUrl || null,
      project_id: existing.projectId || null,
      project_slug: existing.projectSlug || null,
      client_id: existing.clientId || null,
      swarm_id: existing.swarmId || null,
    },
    webhook: {
      url_present: Boolean(process.env.SNIPARA_WEBHOOK_URL),
      secret_present: Boolean(process.env.SNIPARA_WEBHOOK_SECRET),
      configured: Boolean(process.env.SNIPARA_WEBHOOK_URL && process.env.SNIPARA_WEBHOOK_SECRET),
    },
    remote,
    message: determineProvisioningMessage({
      integrationKeyPresent,
      runtimeReady,
      integratorReady,
      recommendedAction,
    }),
  };
}

async function runWorkspaceSniparaProvisioningProbe({
  db = pool,
  workspaceId,
  user = null,
}) {
  if (!workspaceId) throw new Error('workspaceId is required');

  const startedAt = Date.now();
  const diagnostics = await getWorkspaceSniparaProvisioningDiagnostics({
    db,
    workspaceId,
  });
  const operation = await appendWorkspaceSniparaProvisioningOperation({
    db,
    workspaceId,
    operation: {
      kind: 'probe',
      status: buildProvisioningOperationStatus(diagnostics),
      summary: buildProvisioningOperationSummary(diagnostics),
      recommended_action: diagnostics.recommended_action || 'none',
      provisioning_mode: diagnostics.provisioning_mode || 'unknown',
      duration_ms: Date.now() - startedAt,
      actor_user_id: user?.id || null,
      actor_email: user?.email || null,
      details: {
        configured: Boolean(diagnostics.configured),
        runtime_ready: Boolean(diagnostics.runtime_ready),
        integrator_ready: Boolean(diagnostics.integrator_ready),
        missing_fields: Array.isArray(diagnostics.missing_fields) ? diagnostics.missing_fields : [],
        remote: diagnostics.remote || null,
        webhook: diagnostics.webhook || null,
      },
    },
  });

  return {
    diagnostics,
    operation,
  };
}

async function provisionWorkspaceSnipara({
  db = pool,
  workspaceId,
  workspaceName,
  workspaceSlug,
  ownerEmail,
  force = false,
}) {
  if (!workspaceId || !workspaceName) {
    throw new Error('workspaceId and workspaceName are required');
  }

  if (!process.env.SNIPARA_INTEGRATION_KEY) {
    return { provisioned: false, skipped: true, reason: 'integration_key_missing' };
  }

  const existing = await readExistingProvisioning(db, workspaceId);
  if (!force && existing.apiKey && existing.projectId && existing.clientId && existing.swarmId) {
    return {
      provisioned: false,
      skipped: true,
      reason: 'already_configured',
      ...existing,
    };
  }

  const normalizedSlug = normalizeProjectSlug(workspaceSlug || workspaceName || workspaceId);
  const canReuseProject = Boolean(
    existing.apiUrl
    && (existing.projectId || existing.projectSlug)
    && (existing.apiKey || existing.clientId)
  );
  const project = canReuseProject
    ? null
    : await sniparaService.createProject({
      workspaceName,
      workspaceId,
      workspaceSlug: normalizedSlug,
      ownerEmail,
    });

  const apiUrl = existing.apiUrl
    || project?.api_url
    || buildSniparaProjectUrl(existing.projectSlug || project?.project_slug || normalizedSlug);
  let apiKey = existing.apiKey || project?.api_key || null;
  const projectId = existing.projectId || project?.project_id || null;
  const clientId = existing.clientId || project?.client_id || null;
  const projectSlug = existing.projectSlug || project?.project_slug || normalizedSlug;
  let recoveredApiKey = false;

  if (!apiKey && clientId) {
    const keyResult = await sniparaService.createClientApiKey({
      clientId,
      name: `${projectSlug}-workspace-key`,
      accessLevel: 'ADMIN',
    });
    apiKey = extractClientApiKey(keyResult);
    recoveredApiKey = Boolean(apiKey);
  }

  if (!apiKey || !apiUrl) {
    throw new Error('Snipara provisioning did not return usable api credentials');
  }

  let swarmId = existing.swarmId || null;
  let swarmCreationMode = 'existing';

  if (!swarmId && clientId) {
    const created = await sniparaService.createClientSwarm({
      clientId,
      name: `${projectSlug}-client-swarm`,
      description: `Client swarm for ${workspaceName}`,
    });
    swarmId = created?.swarm_id || created?.id || null;
    swarmCreationMode = 'integrator';
  }

  if (!swarmId) {
    const created = await sniparaService.createSwarm({
      apiKey,
      apiUrl,
      name: `${projectSlug}-client-swarm`,
      description: `Client swarm for ${workspaceName}`,
    });
    swarmId = created?.swarm_id || created?.id || null;
    swarmCreationMode = 'mcp';
  }

  if (!swarmId) {
    throw new Error('Snipara provisioning did not return a swarm id');
  }

  const writes = [
    ['snipara_api_key', apiKey],
    ['snipara_api_url', apiUrl],
    ['snipara_project_id', projectId],
    ['snipara_project_slug', projectSlug],
    ['snipara_client_id', clientId],
    ['snipara_swarm_id', swarmId],
  ];

  for (const [key, value] of writes) {
    await writeWorkspaceSetting(db, workspaceId, key, value);
  }

  clearSniparaConfigCache(workspaceId);

  return {
    provisioned: true,
    createdProject: !canReuseProject,
    createdSwarm: !existing.swarmId,
    apiKey,
    apiUrl,
    clientId,
    projectId,
    projectSlug,
    swarmId,
    swarmCreationMode,
    recoveredApiKey,
  };
}

module.exports = {
  extractClientApiKey,
  appendWorkspaceSniparaProvisioningOperation,
  getWorkspaceSniparaProvisioningDiagnostics,
  getWorkspaceSniparaProvisioningOperations,
  provisionWorkspaceSnipara,
  readExistingProvisioning,
  readWorkspaceSettingValue,
  runWorkspaceSniparaProvisioningProbe,
  writeWorkspaceSetting,
};
