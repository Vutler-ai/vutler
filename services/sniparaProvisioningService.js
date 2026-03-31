'use strict';

const pool = require('../lib/vaultbrix');
const {
  buildSniparaProjectUrl,
  clearSniparaConfigCache,
  normalizeProjectSlug,
} = require('./sniparaResolver');
const sniparaService = require('./sniparaService');

const SCHEMA = 'tenant_vutler';

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

async function readExistingProvisioning(db, workspaceId) {
  const result = await db.query(
    `SELECT key, value
     FROM ${SCHEMA}.workspace_settings
     WHERE workspace_id = $1
       AND key IN ('snipara_api_key', 'snipara_api_url', 'snipara_project_id', 'snipara_project_slug', 'snipara_client_id', 'snipara_swarm_id')`,
    [workspaceId]
  );

  const map = new Map(result.rows.map((row) => [row.key, typeof row.value?.value === 'string' ? row.value.value : row.value]));
  return {
    apiKey: map.get('snipara_api_key') || null,
    apiUrl: map.get('snipara_api_url') || null,
    projectId: map.get('snipara_project_id') || null,
    projectSlug: map.get('snipara_project_slug') || null,
    clientId: map.get('snipara_client_id') || null,
    swarmId: map.get('snipara_swarm_id') || null,
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
  const canReuseProject = Boolean(existing.apiKey && existing.apiUrl && (existing.projectId || existing.projectSlug));
  const project = canReuseProject
    ? null
    : await sniparaService.createProject({
      workspaceName,
      workspaceId,
      workspaceSlug: normalizedSlug,
      ownerEmail,
    });

  const apiUrl = existing.apiUrl || project?.api_url || buildSniparaProjectUrl(existing.projectSlug || project?.project_slug || normalizedSlug);
  const apiKey = existing.apiKey || project?.api_key;
  const projectId = existing.projectId || project?.project_id || null;
  const clientId = existing.clientId || project?.client_id || null;
  const projectSlug = existing.projectSlug || project?.project_slug || normalizedSlug;

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
  };
}

module.exports = {
  provisionWorkspaceSnipara,
  readExistingProvisioning,
  writeWorkspaceSetting,
};
