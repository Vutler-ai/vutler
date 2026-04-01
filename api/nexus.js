/**
 * Nexus API — real deployment/runtime flow (API-key-first cloud)
 */
const crypto = require('crypto');
const express = require('express');
const { requireApiKey } = require('../lib/auth');
const pool = require('../lib/vaultbrix');
const { normalizeStoredAvatar, buildSpriteAvatar } = require('../lib/avatarPath');
const {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  resolveApiKey,
  ensureApiKeysTable,
} = require('../services/apiKeys');
const {
  getNodeMode,
  getWorkspaceNexusBillingSummary,
  getWorkspaceNexusUsage,
} = require('../services/nexusBilling');
const { ensureEnterpriseDriveLayout } = require('../services/nexusEnterpriseDrive');
const {
  ensureGovernanceTables,
  createApprovalRequest,
  listApprovalRequests,
  getApprovalRequest,
  resolveApprovalRequest,
  markApprovalExecution,
  findActiveApprovalScope,
  revokeApprovalScope,
  createAuditEvent,
  listAuditEvents,
} = require('../services/nexusEnterpriseGovernance');
const { sendPostalMail } = require('../services/postalMailer');

const router = express.Router();
const SCHEMA = 'tenant_vutler';
const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';
const HEARTBEAT_ONLINE_SECONDS = 90;
const DEPLOY_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const NODE_COMMAND_DEFAULT_TTL_MS = Number.parseInt(process.env.NEXUS_COMMAND_TTL_MS || '600000', 10);
const NODE_COMMAND_DEFAULT_LEASE_MS = Number.parseInt(process.env.NEXUS_COMMAND_LEASE_MS || '45000', 10);
const NODE_COMMAND_DEFAULT_MAX_ATTEMPTS = Number.parseInt(process.env.NEXUS_COMMAND_MAX_ATTEMPTS || '3', 10);

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signDeployToken(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64urlJson(header);
  const encodedPayload = base64urlJson(payload);
  const secret = process.env.NEXUS_DEPLOY_TOKEN_SECRET || process.env.JWT_SECRET || 'vutler-nexus';
  const signature = crypto.createHmac('sha256', secret).update(`${encodedHeader}.${encodedPayload}`).digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function cleanObject(input = {}) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim())
    : [];
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'nexus';
}

function getApiBaseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function buildTokenPayload(base) {
  const now = Math.floor(Date.now() / 1000);
  return cleanObject({
    iss: 'vutler',
    aud: 'nexus',
    iat: now,
    exp: now + DEPLOY_TOKEN_TTL_SECONDS,
    ...base,
  });
}

function buildLocalDeployToken({ req, body = {} }) {
  const apiBaseUrl = getApiBaseUrl(req);
  const nodeName = body.nodeName || body.node_name || body.name || `nexus-${slugify(req.user?.name || req.workspaceId || 'local')}`;
  const permissions = body.permissions || {};

  const payload = buildTokenPayload({
    mode: 'local',
    server: apiBaseUrl,
    node_name: nodeName,
    permissions,
    role: body.role || 'general',
    snipara_instance_id: body.sniparaInstanceId || body.snipara_instance_id || null,
  });

  return {
    token: signDeployToken(payload),
    payload,
    apiBaseUrl,
    nodeName,
  };
}

async function buildEnterpriseDeployToken({ req, body = {} }) {
  const apiBaseUrl = getApiBaseUrl(req);
  const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
  const nodeName = body.name || body.nodeName || body.node_name;
  const clientName = body.clientName || body.client_name;
  const primaryAgentId = body.primaryAgentId || body.primary_agent;
  const poolAgentIds = Array.isArray(body.poolAgentIds) ? body.poolAgentIds : (Array.isArray(body.available_pool) ? body.available_pool : []);
  const allowCreatingNewAgents = body.allowCreatingNewAgents ?? body.allow_create ?? false;
  const autoSpawnRules = Array.isArray(body.autoSpawnRules) ? body.autoSpawnRules : (Array.isArray(body.auto_spawn_rules) ? body.auto_spawn_rules : []);
  const routingRules = Array.isArray(body.routingRules) ? body.routingRules : (Array.isArray(body.routing_rules) ? body.routing_rules : []);
  const profileKey = body.profileKey || body.profile_key || null;
  const profileVersion = body.profileVersion || body.profile_version || null;
  const deploymentMode = body.deploymentMode || body.deployment_mode || 'fixed';
  const selectedCapabilities = normalizeStringArray(Array.isArray(body.selectedCapabilities) ? body.selectedCapabilities : body.selected_capabilities);
  const selectedLocalIntegrations = normalizeStringArray(Array.isArray(body.selectedLocalIntegrations) ? body.selectedLocalIntegrations : body.selected_local_integrations);
  const selectedHelperProfiles = normalizeStringArray(Array.isArray(body.selectedHelperProfiles) ? body.selectedHelperProfiles : body.selected_helper_profiles);
  const seats = Number.isFinite(Number(body.seats)) ? Number(body.seats) : (Number.isFinite(Number(body.max_seats)) ? Number(body.max_seats) : 1);
  const filesystemRoot = body.filesystemRoot || body.filesystem_root || `/opt/${slugify(clientName)}`;

  if (!nodeName || !clientName || !primaryAgentId) {
    const missing = [
      !nodeName && 'name',
      !clientName && 'clientName',
      !primaryAgentId && 'primaryAgentId',
    ].filter(Boolean);
    const error = new Error(`${missing.join(', ')} is required`);
    error.statusCode = 400;
    throw error;
  }

  const driveRepo = await ensureEnterpriseDriveLayout({
    workspaceId,
    clientName,
    nodeName,
  });

  const payload = buildTokenPayload({
    mode: 'enterprise',
    server: apiBaseUrl,
    node_name: nodeName,
    client_name: clientName,
    role: body.role || 'general',
    seats,
    max_seats: seats,
    primary_agent: primaryAgentId,
    available_pool: poolAgentIds,
    allow_create: !!allowCreatingNewAgents,
    routing_rules: routingRules,
    auto_spawn_rules: autoSpawnRules,
    enterprise_profile: profileKey ? {
      profile_key: profileKey,
      profile_version: profileVersion,
      deployment_mode: deploymentMode,
      selected_capabilities: selectedCapabilities,
      selected_local_integrations: selectedLocalIntegrations,
      selected_helper_profiles: selectedHelperProfiles,
    } : null,
    filesystem_root: filesystemRoot,
    offline_config: {
      enabled: !!(body.offlineMode ?? body.offline_mode),
    },
    permissions: body.permissions || {},
    snipara_instance_id: body.sniparaInstanceId || body.snipara_instance_id || null,
    drive_repo: driveRepo,
  });

  return {
    token: signDeployToken(payload),
    payload,
    apiBaseUrl,
    nodeName,
    clientName,
    seats,
  };
}

async function ensureNexusTables() {
  try {
    const check1 = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='tenant_vutler' AND table_name='nexus_deployments'`
    );
    if (check1.rows.length === 0) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${SCHEMA}.nexus_deployments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          workspace_id UUID NOT NULL,
          created_by_user_id UUID NULL,
          agent_id TEXT NOT NULL,
          mode TEXT NOT NULL CHECK (mode IN ('local', 'docker')),
          status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'online', 'offline', 'error')),
          api_key_id UUID NULL,
          client_company TEXT NULL,
          command_context JSONB NOT NULL DEFAULT '{}'::jsonb,
          last_heartbeat_at TIMESTAMPTZ NULL,
          last_heartbeat_payload JSONB NULL,
          runtime_version TEXT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    }
    const check2 = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='tenant_vutler' AND table_name='nexus_runtime_heartbeats'`
    );
    if (check2.rows.length === 0) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${SCHEMA}.nexus_runtime_heartbeats (
          id BIGSERIAL PRIMARY KEY,
          deployment_id UUID NOT NULL REFERENCES ${SCHEMA}.nexus_deployments(id) ON DELETE CASCADE,
          workspace_id UUID NOT NULL,
          runtime_id TEXT NULL,
          runtime_version TEXT NULL,
          status TEXT NOT NULL DEFAULT 'online',
          payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    }
  } catch (err) {
    console.warn('[NEXUS] ensureNexusTables warning (tables may already exist):', err.message);
  }
}


async function ensureNexusNodesTable() {
  try {
    const check = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='tenant_vutler' AND table_name='nexus_nodes'`
    );
    if (check.rows.length === 0) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${SCHEMA}.nexus_nodes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          workspace_id UUID NOT NULL,
          name TEXT NOT NULL,
          type TEXT DEFAULT 'vps',
          status TEXT DEFAULT 'offline',
          host TEXT,
          port INTEGER,
          api_key TEXT,
          config JSONB DEFAULT '{}'::jsonb,
          last_heartbeat TIMESTAMPTZ,
          agents_deployed JSONB DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
    }
    // Columns are migrated on Vaultbrix by SQL migration; avoid ALTER here to prevent owner conflicts.
  } catch (err) {
    console.warn('[NEXUS] ensureNexusNodesTable warning (table may already exist):', err.message);
  }
}

async function ensureNexusCommandsTable() {
  try {
    const check = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='tenant_vutler' AND table_name='nexus_commands'`
    );
    if (check.rows.length === 0) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${SCHEMA}.nexus_commands (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          workspace_id UUID NOT NULL,
          node_id UUID NOT NULL,
          command_type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'in_progress', 'completed', 'failed', 'expired')),
          payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          progress JSONB NULL,
          result JSONB NULL,
          error TEXT NULL,
          timeout_ms INTEGER NOT NULL DEFAULT 600000,
          lease_ms INTEGER NOT NULL DEFAULT 45000,
          expires_at TIMESTAMPTZ NULL,
          lease_expires_at TIMESTAMPTZ NULL,
          attempt_count INTEGER NOT NULL DEFAULT 0,
          max_attempts INTEGER NOT NULL DEFAULT 3,
          created_by_user_id UUID NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          started_at TIMESTAMPTZ NULL,
          completed_at TIMESTAMPTZ NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_nexus_commands_node_status ON ${SCHEMA}.nexus_commands (node_id, status, created_at ASC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_nexus_commands_workspace_created ON ${SCHEMA}.nexus_commands (workspace_id, created_at DESC)`);
    }
    await pool.query(`ALTER TABLE ${SCHEMA}.nexus_commands ADD COLUMN IF NOT EXISTS progress JSONB NULL`);
    await pool.query(`ALTER TABLE ${SCHEMA}.nexus_commands ADD COLUMN IF NOT EXISTS timeout_ms INTEGER NOT NULL DEFAULT 600000`);
    await pool.query(`ALTER TABLE ${SCHEMA}.nexus_commands ADD COLUMN IF NOT EXISTS lease_ms INTEGER NOT NULL DEFAULT 45000`);
    await pool.query(`ALTER TABLE ${SCHEMA}.nexus_commands ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL`);
    await pool.query(`ALTER TABLE ${SCHEMA}.nexus_commands ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ NULL`);
    await pool.query(`ALTER TABLE ${SCHEMA}.nexus_commands ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE ${SCHEMA}.nexus_commands ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_nexus_commands_expiry ON ${SCHEMA}.nexus_commands (workspace_id, node_id, status, expires_at, lease_expires_at)`);
  } catch (err) {
    console.warn('[NEXUS] ensureNexusCommandsTable warning:', err.message);
  }
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function resolveCommandTiming(options = {}) {
  return {
    timeoutMs: clampInteger(options.timeoutMs ?? options.timeout_ms, NODE_COMMAND_DEFAULT_TTL_MS, 100, 30 * 60 * 1000),
    leaseMs: clampInteger(options.leaseMs ?? options.lease_ms, NODE_COMMAND_DEFAULT_LEASE_MS, 100, 10 * 60 * 1000),
    maxAttempts: clampInteger(options.maxAttempts ?? options.max_attempts, NODE_COMMAND_DEFAULT_MAX_ATTEMPTS, 1, 10),
  };
}

function buildCommandFilter(workspaceId, { nodeId = null, commandId = null } = {}) {
  const params = [workspaceId];
  const clauses = ['workspace_id = $1'];

  if (nodeId) {
    params.push(nodeId);
    clauses.push(`node_id = $${params.length}::uuid`);
  }
  if (commandId) {
    params.push(commandId);
    clauses.push(`id::text = $${params.length}`);
  }

  return { params, where: clauses.join(' AND ') };
}

async function refreshCommandState(workspaceId, filters = {}) {
  await ensureNexusCommandsTable();
  const { params, where } = buildCommandFilter(workspaceId, filters);

  await pool.query(
    `UPDATE ${SCHEMA}.nexus_commands
        SET status = 'expired',
            error = COALESCE(error, 'Command expired before completion'),
            completed_at = COALESCE(completed_at, NOW()),
            lease_expires_at = NULL,
            updated_at = NOW()
      WHERE ${where}
        AND status IN ('queued', 'in_progress')
        AND expires_at IS NOT NULL
        AND expires_at <= NOW()`,
    params
  );

  await pool.query(
    `UPDATE ${SCHEMA}.nexus_commands
        SET status = 'expired',
            error = COALESCE(error, 'Command lease expired after maximum retry attempts'),
            completed_at = COALESCE(completed_at, NOW()),
            lease_expires_at = NULL,
            updated_at = NOW()
      WHERE ${where}
        AND status = 'in_progress'
        AND lease_expires_at IS NOT NULL
        AND lease_expires_at <= NOW()
        AND attempt_count >= max_attempts
        AND (expires_at IS NULL OR expires_at > NOW())`,
    params
  );

  await pool.query(
    `UPDATE ${SCHEMA}.nexus_commands
        SET status = 'queued',
            progress = jsonb_build_object(
              'stage', 'requeued',
              'message', 'Previous execution lease expired, command requeued',
              'updatedAt', NOW()
            ),
            lease_expires_at = NULL,
            updated_at = NOW()
      WHERE ${where}
        AND status = 'in_progress'
        AND lease_expires_at IS NOT NULL
        AND lease_expires_at <= NOW()
        AND attempt_count < max_attempts
        AND (expires_at IS NULL OR expires_at > NOW())`,
    params
  );
}

function mapNode(row) {
  const mode = getNodeMode(row);
  const agents = Array.isArray(row.agents_deployed) ? row.agents_deployed : [];
  const maxSeats = row.config?.max_seats ?? row.config?.seats ?? null;
  return {
    id: row.id,
    name: row.name,
    type: row.type || 'vps',
    status: row.status || 'offline',
    host: row.host || null,
    port: row.port || null,
    config: row.config || row.metadata || {},
    agentsDeployed: row.agents_deployed || [],
    lastHeartbeat: row.last_heartbeat,
    agentCount: agents.length,
    mode,
    clientName: row.config?.client_name || row.client_name || null,
    agents,
    seats: maxSeats === null ? null : {
      used: agents.length,
      max: maxSeats,
      available: Math.max(0, maxSeats - agents.length),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapNodeListItem(row) {
  const node = mapNode(row);
  return {
    id: node.id,
    name: node.name,
    status: node.status === 'online' ? 'online' : 'offline',
    agentCount: node.agentCount,
    lastHeartbeat: node.lastHeartbeat,
    mode: node.mode,
    clientName: node.clientName || undefined,
    providerSources: undefined,
  };
}

function mapRuntimeAgent(agent = {}) {
  const enterpriseProfile = agent.enterprise_profile || agent.enterpriseProfile || null;
  return {
    id: agent.id,
    name: agent.name || agent.username || 'Agent',
    model: agent.model || 'gpt-5.4',
    status: agent.status || 'idle',
    tasksCompleted: Number(agent.tasksCompleted || agent.tasks_completed || 0),
    profileKey: enterpriseProfile?.profile_key || enterpriseProfile?.profileKey || agent.profile_key || agent.profileKey || undefined,
    profileVersion: enterpriseProfile?.profile_version || enterpriseProfile?.profileVersion || agent.profile_version || agent.profileVersion || undefined,
  };
}

function mapAgentConfig(agent, sniparaInstanceId, enterpriseProfile = null) {
  const capabilities = agent.capabilities || [];
  return {
    ...agent,
    skills: capabilities,
    tools: capabilities,
    snipara_instance_id: sniparaInstanceId,
    enterprise_profile: enterpriseProfile || undefined,
    profile_key: enterpriseProfile?.profile_key || enterpriseProfile?.profileKey || undefined,
    profile_version: enterpriseProfile?.profile_version || enterpriseProfile?.profileVersion || undefined,
  };
}

function getNodeEnterpriseProfile(node, agentEntry = null) {
  return agentEntry?.enterprise_profile
    || agentEntry?.enterpriseProfile
    || node?.config?.enterprise_profile
    || node?.config?.enterpriseProfile
    || null;
}

function resolveEnterpriseProfilePayload(body = {}, fallbackProfile = null) {
  const profileKey = body.profileKey || body.profile_key || fallbackProfile?.profile_key || fallbackProfile?.profileKey || null;
  if (!profileKey) return null;

  return cleanObject({
    profile_key: profileKey,
    profile_version: body.profileVersion || body.profile_version || fallbackProfile?.profile_version || fallbackProfile?.profileVersion || null,
    deployment_mode: body.deploymentMode || body.deployment_mode || fallbackProfile?.deployment_mode || fallbackProfile?.deploymentMode || null,
    selected_capabilities: normalizeStringArray(body.selectedCapabilities || body.selected_capabilities || fallbackProfile?.selected_capabilities || fallbackProfile?.selectedCapabilities),
    selected_local_integrations: normalizeStringArray(body.selectedLocalIntegrations || body.selected_local_integrations || fallbackProfile?.selected_local_integrations || fallbackProfile?.selectedLocalIntegrations),
    selected_helper_profiles: normalizeStringArray(body.selectedHelperProfiles || body.selected_helper_profiles || fallbackProfile?.selected_helper_profiles || fallbackProfile?.selectedHelperProfiles),
  });
}

async function loadNodeForWorkspace(workspaceId, nodeId) {
  const nodeRes = await pool.query(
    `SELECT * FROM ${SCHEMA}.nexus_nodes WHERE id::text = $1 AND workspace_id = $2 LIMIT 1`,
    [nodeId, workspaceId]
  );
  return nodeRes.rows[0] || null;
}

async function getNodeProviderSources(workspaceId, node) {
  const mode = getNodeMode(node);
  if (mode !== 'enterprise' && node.type !== 'docker') {
    return {
      filesystem: { active: 'local', fallbacks: [] },
      shell: { active: 'local', fallbacks: [] },
      clipboard: { active: 'local', fallbacks: [] },
      mail: { active: 'desktop', fallbacks: [] },
      calendar: { active: 'desktop', fallbacks: [] },
      contacts: { active: 'desktop', fallbacks: [] },
    };
  }

  const integrations = await pool.query(
    `SELECT provider
       FROM ${SCHEMA}.workspace_integrations
      WHERE workspace_id = $1
        AND connected = TRUE
        AND provider = ANY($2::text[])`,
    [workspaceId, ['google', 'microsoft365']]
  ).catch(() => ({ rows: [] }));

  const connected = new Set(integrations.rows.map((row) => row.provider));
  const activeWorkspaceSource = connected.has('google')
    ? 'google'
    : connected.has('microsoft365')
      ? 'microsoft365'
      : 'workspace';

  const workspaceFallbacks = [];
  if (activeWorkspaceSource !== 'google' && connected.has('google')) workspaceFallbacks.push('google');
  if (activeWorkspaceSource !== 'microsoft365' && connected.has('microsoft365')) workspaceFallbacks.push('microsoft365');
  if (activeWorkspaceSource !== 'workspace') workspaceFallbacks.push('workspace');

  return {
    filesystem: { active: 'local', fallbacks: [] },
    shell: { active: 'local', fallbacks: [] },
    clipboard: { active: 'local', fallbacks: [] },
    mail: { active: activeWorkspaceSource, fallbacks: workspaceFallbacks },
    calendar: { active: activeWorkspaceSource, fallbacks: workspaceFallbacks },
    contacts: { active: activeWorkspaceSource, fallbacks: workspaceFallbacks },
  };
}

async function createEnterpriseAgentForNode({ workspaceId, nodeId, body = {} }) {
  const node = await loadNodeForWorkspace(workspaceId, nodeId);
  if (!node) {
    const err = new Error('Node not found');
    err.statusCode = 404;
    throw err;
  }

  const isEnterprise = getNodeMode(node) === 'enterprise';
  if (!isEnterprise) {
    const err = new Error('agent creation is only available in enterprise mode');
    err.statusCode = 403;
    throw err;
  }

  const agentsDeployed = Array.isArray(node.agents_deployed) ? node.agents_deployed : [];
  const maxSeats = node.config?.max_seats ?? node.config?.seats ?? null;
  if (maxSeats !== null && agentsDeployed.length >= maxSeats) {
    const err = new Error(`Node is at capacity (${maxSeats} seats)`);
    err.statusCode = 400;
    throw err;
  }

  const {
    name,
    username,
    role = 'general',
    system_prompt,
    model = 'gpt-5.4',
    temperature = 0.7,
    max_tokens = 4096,
    skills = [],
    tools = [],
    avatar = null,
  } = body;
  const enterpriseProfile = resolveEnterpriseProfilePayload(body, getNodeEnterpriseProfile(node));

  if (!name) {
    const err = new Error('name is required');
    err.statusCode = 400;
    throw err;
  }

  const capabilities = Array.from(new Set([...(Array.isArray(skills) ? skills : []), ...(Array.isArray(tools) ? tools : [])]));

  const insertAgent = await pool.query(
    `INSERT INTO ${SCHEMA}.agents (workspace_id, name, username, role, system_prompt, model, temperature, max_tokens, avatar, capabilities)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text[])
     RETURNING id, username, name, role, system_prompt, model, temperature, max_tokens, avatar, capabilities`,
    [
      workspaceId,
      name,
      username || name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      role,
      system_prompt || null,
      model,
      temperature,
      max_tokens,
      normalizeStoredAvatar(avatar, { username }) || buildSpriteAvatar(username || name),
      capabilities,
    ]
  );

  const agent = insertAgent.rows[0];
  const clientName = node.config?.client_name || node.config?.clientName || node.client_name || 'client';
  const sniparaInstanceId = `nexus-${clientName}-${agent.id}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  const entry = {
    id: agent.id,
    name: agent.name,
    model: agent.model,
    status: 'idle',
    tasksCompleted: 0,
    deployedAt: new Date().toISOString(),
    enterprise_profile: enterpriseProfile || undefined,
  };
  agentsDeployed.push(entry);

  await pool.query(
    `UPDATE ${SCHEMA}.nexus_nodes SET agents_deployed = $3::jsonb, updated_at = NOW()
     WHERE id::text = $1 AND workspace_id = $2`,
    [nodeId, workspaceId, JSON.stringify(agentsDeployed)]
  );

  const seatsUsed = agentsDeployed.length;
  return {
    success: true,
    agent: {
      ...mapAgentConfig(agent, sniparaInstanceId, enterpriseProfile),
      status: 'idle',
      tasksCompleted: 0,
    },
    seats: maxSeats === null ? null : { used: seatsUsed, max: maxSeats, available: Math.max(0, maxSeats - seatsUsed) },
  };
}

async function enqueueNodeCommand({ workspaceId, nodeId, commandType, payload = {}, userId = null, timing = {} }) {
  await ensureNexusCommandsTable();
  const commandTiming = resolveCommandTiming(timing);
  const safeUserId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(userId || ''))
    ? userId
    : null;
  const expiresAt = new Date(Date.now() + commandTiming.timeoutMs).toISOString();
  const inserted = await pool.query(
    `INSERT INTO ${SCHEMA}.nexus_commands (
       workspace_id, node_id, command_type, payload, created_by_user_id,
       timeout_ms, lease_ms, expires_at, max_attempts
     )
     VALUES ($1, $2::uuid, $3, $4::jsonb, $5, $6, $7, $8::timestamptz, $9)
     RETURNING id, command_type, status, payload, progress, result, error,
               timeout_ms, lease_ms, expires_at, lease_expires_at, attempt_count, max_attempts,
               created_at, started_at, completed_at, updated_at`,
    [
      workspaceId,
      nodeId,
      commandType,
      JSON.stringify(payload || {}),
      safeUserId,
      commandTiming.timeoutMs,
      commandTiming.leaseMs,
      expiresAt,
      commandTiming.maxAttempts,
    ]
  );
  return inserted.rows[0];
}

async function waitForNodeCommand(workspaceId, commandId, timeoutMs = 15000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    await refreshCommandState(workspaceId, { commandId });
    const result = await pool.query(
      `SELECT id, command_type, status, payload, progress, result, error,
              timeout_ms, lease_ms, expires_at, lease_expires_at, attempt_count, max_attempts,
              created_at, started_at, completed_at, updated_at
         FROM ${SCHEMA}.nexus_commands
        WHERE id::text = $1
          AND workspace_id = $2
        LIMIT 1`,
      [commandId, workspaceId]
    );

    const row = result.rows[0];
    if (!row) return null;
    if (row.status === 'completed' || row.status === 'failed' || row.status === 'expired') return row;

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return null;
}

function mapNodeCommand(row) {
  const payload = row.payload || {};
  const result = row.result || null;
  const progress = row.progress || result?.progress || null;
  const startedAt = row.started_at ? new Date(row.started_at).getTime() : null;
  const completedAt = row.completed_at ? new Date(row.completed_at).getTime() : null;
  const durationMs = startedAt && completedAt ? Math.max(0, completedAt - startedAt) : (progress?.elapsedMs ?? undefined);

  return {
    id: row.id,
    type: row.command_type,
    status: row.status,
    payload,
    progress,
    result: row.status === 'completed' || row.status === 'failed' ? result : undefined,
    error: row.error || undefined,
    attempts: Number(row.attempt_count || 0),
    maxAttempts: Number(row.max_attempts || 0),
    timeoutMs: Number(row.timeout_ms || 0),
    leaseMs: Number(row.lease_ms || 0),
    durationMs,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    leaseExpiresAt: row.lease_expires_at,
    expiresAt: row.expires_at,
    updatedAt: row.updated_at,
  };
}

function describeNodeCommand(row) {
  const action = row.payload?.action ? `:${row.payload.action}` : '';
  return `${row.command_type}${action} ${row.status}`;
}

async function resolveWorkspaceApprovalRecipients(workspaceId) {
  const settingsRes = await pool.query(
    `SELECT key, value
       FROM ${SCHEMA}.workspace_settings
      WHERE workspace_id = $1
        AND key IN ('nexus_approval_email', 'approval_email', 'nexus_approval_emails')`,
    [workspaceId]
  ).catch(() => ({ rows: [] }));

  const recipients = [];
  for (const row of settingsRes.rows) {
    const raw = row.value && typeof row.value === 'object' && 'value' in row.value ? row.value.value : row.value;
    if (typeof raw === 'string' && raw.trim()) {
      recipients.push(...raw.split(',').map((entry) => entry.trim()).filter(Boolean));
    } else if (Array.isArray(raw)) {
      recipients.push(...raw.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim()));
    }
  }
  if (recipients.length > 0) {
    return Array.from(new Set(recipients));
  }

  const ownerRes = await pool.query(
    `SELECT ua.email
       FROM ${SCHEMA}.workspaces w
       LEFT JOIN ${SCHEMA}.users_auth ua ON ua.id = w.owner_id
      WHERE w.id = $1
      LIMIT 1`,
    [workspaceId]
  ).catch(() => ({ rows: [] }));

  const ownerEmail = ownerRes.rows[0]?.email || null;
  return ownerEmail ? [ownerEmail] : [];
}

async function notifyApprovalByEmail({ workspaceId, node, approval }) {
  const recipients = await resolveWorkspaceApprovalRecipients(workspaceId);
  if (!recipients.length) return { skipped: true, reason: 'No approval recipients configured' };

  const appUrl = process.env.APP_URL || 'https://app.vutler.ai';
  const nodeUrl = `${appUrl}/nexus/${node.id}`;
  const subject = `[Vutler] Approval required for ${approval.title}`;
  const plain = [
    `Approval required for workspace ${workspaceId}.`,
    '',
    `Node: ${node.name}`,
    `Request: ${approval.title}`,
    approval.summary ? `Summary: ${approval.summary}` : '',
    approval.scopeKey ? `Process scope: ${approval.scopeKey}` : '',
    '',
    `Open node: ${nodeUrl}`,
    `Approval ID: ${approval.id}`,
  ].filter(Boolean).join('\n');
  const html = `
    <p>Approval required for workspace <strong>${workspaceId}</strong>.</p>
    <p><strong>Node:</strong> ${node.name}</p>
    <p><strong>Request:</strong> ${approval.title}</p>
    ${approval.summary ? `<p><strong>Summary:</strong> ${approval.summary}</p>` : ''}
    ${approval.scopeKey ? `<p><strong>Process scope:</strong> ${approval.scopeKey}</p>` : ''}
    <p><a href="${nodeUrl}">Open node approvals in Vutler</a></p>
    <p style="color:#6b7280;font-size:12px;">Approval ID: ${approval.id}</p>
  `;

  return sendPostalMail({
    to: recipients,
    from: 'noreply@vutler.ai',
    subject,
    plain_body: plain,
    html_body: html,
  });
}

async function getWorkspaceCommandStats(workspaceId, nodeId = null) {
  const params = [workspaceId];
  const nodeFilter = nodeId
    ? (() => {
        params.push(nodeId);
        return `AND node_id = $${params.length}::uuid`;
      })()
    : '';

  const result = await pool.query(
    `SELECT
        COUNT(*) FILTER (WHERE status = 'queued')::int AS queued,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
        COUNT(*) FILTER (WHERE status = 'completed' AND created_at >= NOW() - INTERVAL '24 hours')::int AS completed_24h,
        COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours')::int AS failed_24h,
        COUNT(*) FILTER (WHERE status = 'expired' AND created_at >= NOW() - INTERVAL '24 hours')::int AS expired_24h,
        COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)
          FILTER (WHERE status = 'completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL), 0)::bigint AS avg_duration_ms
       FROM ${SCHEMA}.nexus_commands
      WHERE workspace_id = $1
        ${nodeFilter}`,
    params
  ).catch(() => ({ rows: [{}] }));

  const row = result.rows[0] || {};
  return {
    queued: Number(row.queued || 0),
    inProgress: Number(row.in_progress || 0),
    completed24h: Number(row.completed_24h || 0),
    failed24h: Number(row.failed_24h || 0),
    expired24h: Number(row.expired_24h || 0),
    avgDurationMs: Number(row.avg_duration_ms || 0),
  };
}

function buildCommands({ mode, apiKey, deploymentId, apiBaseUrl }) {
  const baseEnv = [
    `export NEXUS_API_BASE="${apiBaseUrl}"`,
    `export NEXUS_API_KEY="${apiKey}"`,
    `export NEXUS_DEPLOYMENT_ID="${deploymentId}"`,
  ];

  if (mode === 'local') {
    return {
      install: [
        'npm i -g vutler-nexus',
      ],
      run: [
        ...baseEnv,
        'vutler-nexus start',
      ],
      heartbeatHint: 'vutler-nexus will call /api/v1/nexus/runtime/heartbeat using NEXUS_API_KEY + NEXUS_DEPLOYMENT_ID.',
    };
  }

  return {
    install: [
      'docker pull starbox/vutler-nexus:latest || true',
    ],
    run: [
      `docker run -d --name vutler-nexus-${deploymentId.slice(0, 8)} \\`,
      `  -e NEXUS_API_BASE="${apiBaseUrl}" \\`,
      `  -e NEXUS_API_KEY="${apiKey}" \\`,
      `  -e NEXUS_DEPLOYMENT_ID="${deploymentId}" \\`,
      '  --restart unless-stopped starbox/vutler-nexus:latest',
    ],
    heartbeatHint: 'Container runtime must post heartbeat to /api/v1/nexus/runtime/heartbeat.',
  };
}

router.post('/tokens/local', async (req, res) => {
  try {
    const result = buildLocalDeployToken({ req, body: req.body || {} });
    res.json({
      success: true,
      token: result.token,
      payload: result.payload,
      message: 'Deploy token created for local Nexus setup.',
    });
  } catch (err) {
    const status = err.statusCode || 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

router.post('/tokens/enterprise', async (req, res) => {
  try {
    const result = await buildEnterpriseDeployToken({ req, body: req.body || {} });
    res.json({
      success: true,
      token: result.token,
      payload: result.payload,
      message: 'Deploy token created for enterprise Nexus setup.',
    });
  } catch (err) {
    const status = err.statusCode || 500;
    res.status(status).json({ success: false, error: err.message });
  }
});


router.get('/', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.nexus_nodes WHERE workspace_id = $1 ORDER BY created_at DESC`,
      [workspaceId]
    );
    res.json({ success: true, data: result.rows.map(mapNode) });
  } catch (err) {
    console.error('[NEXUS] List nodes error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const { name, type = 'vps', host = null, port = null, api_key = null, config = {} } = req.body || {};
    if (!name) return res.status(400).json({ success: false, error: 'name is required' });

    const insert = await pool.query(
      `INSERT INTO ${SCHEMA}.nexus_nodes (workspace_id, name, type, status, host, port, api_key, config, agents_deployed)
       VALUES ($1, $2, $3, 'offline', $4, $5, $6, $7::jsonb, '[]'::jsonb)
       RETURNING *`,
      [workspaceId, name, type, host, port, api_key, JSON.stringify(config || {})]
    );

    res.status(201).json({ success: true, data: mapNode(insert.rows[0]) });
  } catch (err) {
    console.error('[NEXUS] Create node error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/deployments', async (req, res) => {
  try {
    await ensureNexusTables();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const result = await pool.query(
      `SELECT id, agent_id, mode, status, runtime_version, last_heartbeat_at, created_at, updated_at
       FROM ${SCHEMA}.nexus_deployments
       WHERE workspace_id = $1
       ORDER BY created_at DESC`,
      [workspaceId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[NEXUS] List deployments error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Management endpoints (JWT-auth via global middleware)
router.get('/keys', async (req, res) => {
  try {
    await ensureApiKeysTable();
    const keys = await listApiKeys({ workspaceId: req.workspaceId || DEFAULT_WORKSPACE });
    res.json({ success: true, keys });
  } catch (err) {
    console.error('[NEXUS] List keys error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/keys', async (req, res) => {
  try {
    await ensureApiKeysTable();
    const created = await createApiKey({
      workspaceId: req.workspaceId || DEFAULT_WORKSPACE,
      userId: req.userId || req.user?.id || null,
      name: req.body?.name || 'Nexus key',
    });

    res.json({
      success: true,
      key: {
        id: created.id,
        name: created.name,
        key_prefix: created.key_prefix,
        created_at: created.created_at,
      },
      secret: created.secret,
      message: 'Store this secret now. It will not be shown again.',
    });
  } catch (err) {
    console.error('[NEXUS] Create key error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/keys/:id', async (req, res) => {
  try {
    await ensureApiKeysTable();
    const revoked = await revokeApiKey({
      workspaceId: req.workspaceId || DEFAULT_WORKSPACE,
      id: req.params.id,
    });

    if (!revoked) {
      return res.status(404).json({ success: false, error: 'API key not found or already revoked' });
    }

    res.json({ success: true, revoked });
  } catch (err) {
    console.error('[NEXUS] Revoke key error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/deploy/plan', async (req, res) => {
  try {
    await ensureNexusTables();

    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const createdBy = req.userId || req.user?.id || null;
    const { agentIds, mode, apiKeyId, apiKey, clientCompany } = req.body || {};

    if (!Array.isArray(agentIds) || !agentIds.length) {
      return res.status(400).json({ success: false, error: 'agentIds[] is required' });
    }
    if (mode !== 'local' && mode !== 'docker') {
      return res.status(400).json({ success: false, error: 'mode must be local or docker' });
    }
    if (!apiKey) {
      return res.status(400).json({ success: false, error: 'apiKey is required (one-time secret from /nexus/keys)' });
    }

    const apiBaseUrl = `${req.protocol}://${req.get('host')}`;
    const deployments = [];

    for (const agentId of agentIds) {
      const inserted = await pool.query(
        `INSERT INTO ${SCHEMA}.nexus_deployments (
          workspace_id,
          created_by_user_id,
          agent_id,
          mode,
          status,
          api_key_id,
          client_company,
          command_context
        ) VALUES ($1, $2, $3, $4, 'planned', $5, $6, $7::jsonb)
        RETURNING id, agent_id, mode, status, created_at`,
        [
          workspaceId,
          createdBy,
          String(agentId),
          mode,
          apiKeyId || null,
          clientCompany || null,
          JSON.stringify({ apiBaseUrl }),
        ]
      );

      const row = inserted.rows[0];
      deployments.push({
        id: row.id,
        agentId: row.agent_id,
        mode: row.mode,
        status: row.status,
        createdAt: row.created_at,
        commands: buildCommands({ mode: row.mode, apiKey, deploymentId: row.id, apiBaseUrl }),
      });
    }

    res.json({ success: true, deployments, apiBaseUrl });
  } catch (err) {
    console.error('[NEXUS] Deploy plan error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Runtime heartbeat requires API key auth (strict)
router.post('/runtime/heartbeat', requireApiKey, async (req, res) => {
  try {
    await ensureNexusTables();

    const { deploymentId, runtimeId, runtimeVersion, status, payload } = req.body || {};
    if (!deploymentId) {
      return res.status(400).json({ success: false, error: 'deploymentId is required' });
    }

    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const safeStatus = status === 'error' ? 'error' : 'online';

    const updateResult = await pool.query(
      `UPDATE ${SCHEMA}.nexus_deployments
       SET status = $3,
           last_heartbeat_at = NOW(),
           last_heartbeat_payload = $4::jsonb,
           runtime_version = $5,
           updated_at = NOW()
       WHERE id::text = $1 AND workspace_id = $2
       RETURNING id`,
      [deploymentId, workspaceId, safeStatus, JSON.stringify(payload || {}), runtimeVersion || null]
    );

    if (!updateResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Deployment not found for this API key workspace' });
    }

    await pool.query(
      `INSERT INTO ${SCHEMA}.nexus_runtime_heartbeats (
        deployment_id,
        workspace_id,
        runtime_id,
        runtime_version,
        status,
        payload
      ) VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)`,
      [deploymentId, workspaceId, runtimeId || null, runtimeVersion || null, safeStatus, JSON.stringify(payload || {})]
    );

    res.json({ success: true, deploymentId, status: safeStatus, receivedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[NEXUS] Heartbeat error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/runtime/verify/:deploymentId', async (req, res) => {
  try {
    await ensureNexusTables();

    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const result = await pool.query(
      `SELECT
        id,
        agent_id,
        mode,
        status,
        runtime_version,
        last_heartbeat_at,
        last_heartbeat_payload,
        created_at,
        updated_at,
        CASE
          WHEN last_heartbeat_at IS NULL THEN false
          WHEN last_heartbeat_at >= NOW() - ($3::int * INTERVAL '1 second') THEN true
          ELSE false
        END AS online
      FROM ${SCHEMA}.nexus_deployments
      WHERE id::text = $1 AND workspace_id = $2
      LIMIT 1`,
      [req.params.deploymentId, workspaceId, HEARTBEAT_ONLINE_SECONDS]
    );

    const deployment = result.rows[0];
    if (!deployment) {
      return res.status(404).json({ success: false, error: 'Deployment not found' });
    }

    res.json({
      success: true,
      deployment: {
        id: deployment.id,
        agentId: deployment.agent_id,
        mode: deployment.mode,
        status: deployment.status,
        runtimeVersion: deployment.runtime_version,
        online: deployment.online,
        lastHeartbeat: deployment.last_heartbeat_at,
        lastHeartbeatPayload: deployment.last_heartbeat_payload || {},
        createdAt: deployment.created_at,
        updatedAt: deployment.updated_at,
      },
    });
  } catch (err) {
    console.error('[NEXUS] Verify runtime error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Legacy CLI token endpoints now backed by workspace API keys
router.get('/cli/tokens', async (req, res) => {
  try {
    await ensureApiKeysTable();
    const keys = await listApiKeys({ workspaceId: req.workspaceId || DEFAULT_WORKSPACE });
    const tokens = keys.map((k) => ({
      id: k.id,
      name: k.name,
      token: `${k.key_prefix}...`,
      createdAt: k.created_at,
      lastUsed: k.last_used_at,
      revokedAt: k.revoked_at,
    }));
    res.json({ success: true, tokens });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/cli/tokens', async (req, res) => {
  try {
    await ensureApiKeysTable();
    const created = await createApiKey({
      workspaceId: req.workspaceId || DEFAULT_WORKSPACE,
      userId: req.userId || req.user?.id || null,
      name: req.body?.name || 'Nexus key',
    });
    res.json({ success: true, token: created.secret, id: created.id, key_prefix: created.key_prefix });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/cli/tokens/:id', async (req, res) => {
  try {
    await ensureApiKeysTable();
    const revoked = await revokeApiKey({ workspaceId: req.workspaceId || DEFAULT_WORKSPACE, id: req.params.id });
    if (!revoked) return res.status(404).json({ success: false, error: 'Token not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Backward-compatibility shims
router.post('/local-token', async (_req, res) => {
  return res.status(410).json({
    success: false,
    error: 'Deprecated. Use /api/v1/nexus/keys to create an API key for cloud pairing.',
    code: 'LOCAL_TOKEN_DEPRECATED',
  });
});

router.get('/status', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    await ensureNexusCommandsTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    await refreshCommandState(workspaceId);
    const nodesRes = await pool.query(
      `SELECT * FROM ${SCHEMA}.nexus_nodes WHERE workspace_id = $1 ORDER BY created_at DESC`,
      [workspaceId]
    );
    const nodes = await Promise.all(
      nodesRes.rows.map(async (row) => ({
        ...mapNodeListItem(row),
        providerSources: await getNodeProviderSources(workspaceId, row),
      }))
    );
    const usage = await getWorkspaceNexusUsage(pool, workspaceId).catch(() => ({ total: nodes.length, enterprise: 0, local: 0 }));
    const billing = await getWorkspaceNexusBillingSummary(pool, workspaceId).catch(() => null);
    const commandStats = await getWorkspaceCommandStats(workspaceId).catch(() => null);
    const online = nodes.filter((node) => node.status === 'online').length;
    const agentCount = nodes.reduce((sum, node) => sum + (node.agentCount || 0), 0);
    const tasksCompleted = nodesRes.rows.reduce((sum, row) => {
      const agents = Array.isArray(row.agents_deployed) ? row.agents_deployed : [];
      return sum + agents.reduce((agentSum, agent) => agentSum + Number(agent.tasksCompleted || agent.tasks_completed || 0), 0);
    }, 0);
    const lastHeartbeat = nodesRes.rows.reduce((latest, row) => {
      if (!row.last_heartbeat) return latest;
      if (!latest) return row.last_heartbeat;
      return new Date(row.last_heartbeat) > new Date(latest) ? row.last_heartbeat : latest;
    }, null);

    res.json({
      success: true,
      nodes,
      stats: {
        total: usage.total,
        online,
        agents: agentCount,
        tasksCompleted,
      },
      billing,
      commandStats,
      registered: nodes.length > 0,
      connected: online > 0,
      syncState: 'cloud',
      connectedAgents: agentCount,
      deploymentsTotal: usage.total,
      lastSync: lastHeartbeat,
      workspaceId,
      auth: req.authType || 'jwt',
    });
  } catch (err) {
    console.error('[NEXUS] Status error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/register', async (req, res) => {
  try {
    // Extract API key from Authorization header or body
    const authHeader = req.headers['authorization'] || '';
    const secret = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : req.body?.apiKey || req.body?.key || null;

    if (!secret) {
      return res.status(401).json({ success: false, error: 'API key is required' });
    }

    const { name, type = 'local', host = null, port = null, config = {} } = req.body || {};
    const nodeName = name || require('os').hostname();

    let workspaceId = DEFAULT_WORKSPACE;
    let nodeId;
    let authMethod;
    const isDev = process.env.NODE_ENV !== 'production';

    // In dev mode: accept any key prefixed with "vutler_" without DB validation
    if (isDev && secret.startsWith('vutler_')) {
      try {
        await ensureApiKeysTable();
        await ensureNexusNodesTable();
        const keyRecord = await resolveApiKey(secret);
        if (keyRecord) {
          workspaceId = keyRecord.workspace_id;
          authMethod = 'api_key';
        }
      } catch (_) { /* DB down in dev — ignore */ }

      if (!authMethod) {
        console.warn('[NEXUS] Dev mode — accepting key without DB validation');
        authMethod = 'dev_mode';
      }

      nodeId = require('crypto').randomUUID();
      // Try to persist to DB (best effort)
      try {
        const insert = await pool.query(
          `INSERT INTO ${SCHEMA}.nexus_nodes (workspace_id, name, type, status, host, port, config, agents_deployed)
           VALUES ($1, $2, $3, 'online', $4, $5, $6::jsonb, '[]'::jsonb)
           RETURNING id`,
          [workspaceId, nodeName, type, host, port, JSON.stringify(config || {})]
        );
        nodeId = insert.rows[0].id;
      } catch (_) { /* DB down — use random UUID */ }

    } else {
      // Production mode: strict DB validation
      await ensureApiKeysTable();
      await ensureNexusNodesTable();
      const keyRecord = await resolveApiKey(secret);
      if (!keyRecord) {
        return res.status(401).json({ success: false, error: 'Invalid or revoked API key' });
      }
      workspaceId = keyRecord.workspace_id;
      authMethod = 'api_key';

      const insert = await pool.query(
        `INSERT INTO ${SCHEMA}.nexus_nodes (workspace_id, name, type, status, host, port, config, agents_deployed)
         VALUES ($1, $2, $3, 'online', $4, $5, $6::jsonb, '[]'::jsonb)
         RETURNING id`,
        [workspaceId, nodeName, type, host, port, JSON.stringify(config || {})]
      );
      nodeId = insert.rows[0].id;
    }

    console.log(`[NEXUS] Node registered: ${nodeName} (${nodeId}) [${authMethod}]`);

    res.json({
      success: true,
      message: 'Registered',
      nodeId,
      workspaceId,
      auth: authMethod,
    });
  } catch (err) {
    console.error('[NEXUS] Register error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});


// === Nexus UI wiring endpoints ===

async function ensureNexusRoutesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.nexus_routes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
      task_type TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      model TEXT DEFAULT 'GPT-4o',
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

router.get('/routes', async (req, res) => {
  try {
    await ensureNexusRoutesTable();
    const wsId = req.workspaceId || DEFAULT_WORKSPACE;
    const result = await pool.query(
      `SELECT id, task_type, agent_name, model, status, created_at FROM ${SCHEMA}.nexus_routes WHERE workspace_id = $1 ORDER BY created_at`, [wsId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/routes', async (req, res) => {
  try {
    await ensureNexusRoutesTable();
    const wsId = req.workspaceId || DEFAULT_WORKSPACE;
    const { task_type, agent_name, model } = req.body || {};
    if (!task_type || !agent_name) return res.status(400).json({ success: false, error: 'task_type and agent_name required' });
    const result = await pool.query(
      `INSERT INTO ${SCHEMA}.nexus_routes (workspace_id, task_type, agent_name, model) VALUES ($1, $2, $3, $4) RETURNING *`,
      [wsId, task_type, agent_name, model || 'GPT-4o']
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/stats', async (req, res) => {
  try {
    await ensureNexusTables();
    const wsId = req.workspaceId || DEFAULT_WORKSPACE;
    const deploys = await pool.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE last_heartbeat_at >= NOW() - INTERVAL '24 hours')::int AS routed_today, COUNT(*) FILTER (WHERE status = 'error')::int AS fallbacks FROM ${SCHEMA}.nexus_deployments WHERE workspace_id = $1`, [wsId]
    );
    const row = deploys.rows[0] || {};
    res.json({ success: true, data: { routedToday: row.routed_today || 0, avgResponseMs: null, fallbackTriggers: row.fallbacks || 0, totalDeployments: row.total || 0 } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/smoke-test', async (req, res) => {
  const checks = []; const t0 = Date.now();
  checks.push({ name: 'API Health', passed: true, ms: Date.now() - t0 });
  try { const t1 = Date.now(); await pool.query('SELECT 1'); checks.push({ name: 'Database', passed: true, ms: Date.now() - t1 }); }
  catch (e) { checks.push({ name: 'Database', passed: false, ms: 0, error: e.message }); }
  try { const t2 = Date.now(); await pool.query(`SELECT COUNT(*)::int FROM ${SCHEMA}.nexus_deployments LIMIT 1`); checks.push({ name: 'Nexus Tables', passed: true, ms: Date.now() - t2 }); }
  catch (e) { checks.push({ name: 'Nexus Tables', passed: false, ms: 0, error: e.message }); }
  try { await ensureNexusRoutesTable(); const t3 = Date.now(); await pool.query(`SELECT COUNT(*)::int FROM ${SCHEMA}.nexus_routes LIMIT 1`); checks.push({ name: 'Routes Table', passed: true, ms: Date.now() - t3 }); }
  catch (e) { checks.push({ name: 'Routes Table', passed: false, ms: 0, error: e.message }); }
  checks.push({ name: 'Response Time', passed: (Date.now() - t0) < 5000, ms: Date.now() - t0 });
  res.json({ success: true, data: { checks, totalMs: Date.now() - t0, allPassed: checks.every(c => c.passed), timestamp: new Date().toISOString() } });
});


// Node runtime operations
router.put('/:id', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const { name, type, status, host, port, api_key, config } = req.body || {};
    const update = await pool.query(
      `UPDATE ${SCHEMA}.nexus_nodes
       SET name = COALESCE($3, name),
           type = COALESCE($4, type),
           status = COALESCE($5, status),
           host = COALESCE($6, host),
           port = COALESCE($7, port),
           api_key = COALESCE($8, api_key),
           config = COALESCE($9::jsonb, config),
           updated_at = NOW()
       WHERE id::text = $1 AND workspace_id = $2
       RETURNING *`,
      [req.params.id, workspaceId, name || null, type || null, status || null, host || null, port || null, api_key || null, config ? JSON.stringify(config) : null]
    );
    if (!update.rows.length) return res.status(404).json({ success: false, error: 'Node not found' });
    res.json({ success: true, data: mapNode(update.rows[0]) });
  } catch (err) {
    console.error('[NEXUS] Update node error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const del = await pool.query(`DELETE FROM ${SCHEMA}.nexus_nodes WHERE id::text = $1 AND workspace_id = $2 RETURNING id`, [req.params.id, workspaceId]);
    if (!del.rows.length) return res.status(404).json({ success: false, error: 'Node not found' });
    res.json({ success: true, deletedId: del.rows[0].id });
  } catch (err) {
    console.error('[NEXUS] Delete node error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/deploy', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const { agentId, agentName } = req.body || {};
    if (!agentId && !agentName) return res.status(400).json({ success: false, error: 'agentId or agentName is required' });

    const nodeRes = await pool.query(`SELECT * FROM ${SCHEMA}.nexus_nodes WHERE id::text = $1 AND workspace_id = $2 LIMIT 1`, [req.params.id, workspaceId]);
    if (!nodeRes.rows.length) return res.status(404).json({ success: false, error: 'Node not found' });

    const node = nodeRes.rows[0];
    const deployed = Array.isArray(node.agents_deployed) ? node.agents_deployed : [];
    const entry = { id: agentId || null, name: agentName || agentId, deployedAt: new Date().toISOString() };
    deployed.push(entry);

    const updated = await pool.query(
      `UPDATE ${SCHEMA}.nexus_nodes
       SET agents_deployed = $3::jsonb,
           status = 'online',
           updated_at = NOW()
       WHERE id::text = $1 AND workspace_id = $2
       RETURNING *`,
      [req.params.id, workspaceId, JSON.stringify(deployed)]
    );

    res.json({ success: true, message: 'Agent deployment registered', data: mapNode(updated.rows[0]), deployment: entry });
  } catch (err) {
    console.error('[NEXUS] Deploy node error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id/health', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const out = await pool.query(`SELECT * FROM ${SCHEMA}.nexus_nodes WHERE id::text = $1 AND workspace_id = $2 LIMIT 1`, [req.params.id, workspaceId]);
    if (!out.rows.length) return res.status(404).json({ success: false, error: 'Node not found' });

    const node = out.rows[0];
    const last = node.last_heartbeat ? new Date(node.last_heartbeat).getTime() : 0;
    const online = !!last && (Date.now() - last <= HEARTBEAT_ONLINE_SECONDS * 1000);
    const health = online ? 'healthy' : 'offline';

    res.json({
      success: true,
      data: {
        nodeId: node.id,
        status: node.status,
        health,
        online,
        lastHeartbeat: node.last_heartbeat,
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[NEXUS] Node health error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/connect', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const { status, agents, memory, uptime, api_key } = req.body || {};
    const currentNode = await loadNodeForWorkspace(workspaceId, req.params.id);
    if (!currentNode) return res.status(404).json({ success: false, error: 'Node not found' });
    const existingAgents = Array.isArray(currentNode.agents_deployed) ? currentNode.agents_deployed : [];
    const existingAgentMap = new Map(
      existingAgents
        .filter((agent) => agent && typeof agent === 'object' && agent.id)
        .map((agent) => [agent.id, agent])
    );
    const mergedAgents = (Array.isArray(agents) ? agents : []).map((agent) => {
      const existing = existingAgentMap.get(agent?.id) || {};
      const enterpriseProfile = agent?.enterprise_profile
        || agent?.enterpriseProfile
        || existing.enterprise_profile
        || existing.enterpriseProfile
        || undefined;

      return {
        ...existing,
        ...agent,
        enterprise_profile: enterpriseProfile,
        profile_key: enterpriseProfile?.profile_key || enterpriseProfile?.profileKey || agent?.profile_key || agent?.profileKey || existing.profile_key || existing.profileKey || undefined,
        profile_version: enterpriseProfile?.profile_version || enterpriseProfile?.profileVersion || agent?.profile_version || agent?.profileVersion || existing.profile_version || existing.profileVersion || undefined,
      };
    });
    const updated = await pool.query(
      `UPDATE ${SCHEMA}.nexus_nodes
       SET status = $3,
           last_heartbeat = NOW(),
           agents_deployed = $4::jsonb,
           config = COALESCE(config, '{}'::jsonb) || $5::jsonb,
           api_key = COALESCE($6, api_key),
           updated_at = NOW()
       WHERE id::text = $1 AND workspace_id = $2
       RETURNING *`,
      [
        req.params.id,
        workspaceId,
        status || 'online',
        JSON.stringify(mergedAgents),
        JSON.stringify({ memory, uptime }),
        api_key || null,
      ]
    );
    if (!updated.rows.length) return res.status(404).json({ success: false, error: 'Node not found' });
    res.json({ success: true, message: 'Node connected', data: mapNode(updated.rows[0]) });
  } catch (err) {
    console.error('[NEXUS] Node connect error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id/logs', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    await ensureNexusTables();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const node = await pool.query(`SELECT * FROM ${SCHEMA}.nexus_nodes WHERE id::text = $1 AND workspace_id = $2 LIMIT 1`, [req.params.id, workspaceId]);
    if (!node.rows.length) return res.status(404).json({ success: false, error: 'Node not found' });

    const logs = await pool.query(
      `SELECT id, deployment_id, status, payload, received_at
       FROM ${SCHEMA}.nexus_runtime_heartbeats
       WHERE workspace_id = $1
       ORDER BY received_at DESC
       LIMIT 100`,
      [workspaceId]
    );

    res.json({ success: true, data: logs.rows, source: 'nexus_runtime_heartbeats', note: 'Workspace-level latest runtime logs' });
  } catch (err) {
    console.error('[NEXUS] Node logs error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Task delivery endpoints for Nexus nodes
router.get('/:nodeId/tasks', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const { nodeId } = req.params;

    const nodeRes = await pool.query(
      `SELECT * FROM ${SCHEMA}.nexus_nodes WHERE id::text = $1 AND workspace_id = $2 LIMIT 1`,
      [nodeId, workspaceId]
    );
    if (!nodeRes.rows.length) {
      return res.status(404).json({ success: false, error: 'Node not found' });
    }

    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.tasks
       WHERE status IN ('pending', 'assigned') AND workspace_id = $1
       ORDER BY priority DESC, created_at ASC
       LIMIT 10`,
      [workspaceId]
    );

    res.json({ success: true, tasks: result.rows });
  } catch (err) {
    console.error('[NEXUS] Get node tasks error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:nodeId/tasks/:taskId/status', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const { nodeId, taskId } = req.params;
    const { status, output, error: taskError } = req.body || {};

    const ALLOWED_STATUSES = ['in_progress', 'completed', 'failed'];
    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `status must be one of: ${ALLOWED_STATUSES.join(', ')}`,
      });
    }

    const nodeRes = await pool.query(
      `SELECT * FROM ${SCHEMA}.nexus_nodes WHERE id::text = $1 AND workspace_id = $2 LIMIT 1`,
      [nodeId, workspaceId]
    );
    if (!nodeRes.rows.length) {
      return res.status(404).json({ success: false, error: 'Node not found' });
    }

    const updateResult = await pool.query(
      `UPDATE ${SCHEMA}.tasks
       SET status = $1, updated_at = NOW()
       WHERE id::text = $2 AND workspace_id = $3
       RETURNING *`,
      [status, taskId, workspaceId]
    );

    if (!updateResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    const task = updateResult.rows[0];

    if (status === 'completed' && task.swarm_task_id) {
      try {
        const swarmCoordinator = require('../services/swarmCoordinator');
        await swarmCoordinator.completeTask(task.swarm_task_id, nodeId, output || null);
      } catch (swarmErr) {
        console.error('[NEXUS] swarmCoordinator.completeTask error:', swarmErr.message);
      }
    }

    res.json({ success: true, task });
  } catch (err) {
    console.error('[NEXUS] Update task status error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Multi-agent endpoints ─────────────────────────────────────────────────────

/**
 * GET /:nodeId/agent-configs
 * Returns full config for each agent assigned to this node.
 */
router.get('/:nodeId/agent-configs', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const { nodeId } = req.params;

    const nodeRes = await pool.query(
      `SELECT * FROM ${SCHEMA}.nexus_nodes WHERE id::text = $1 AND workspace_id = $2 LIMIT 1`,
      [nodeId, workspaceId]
    );
    if (!nodeRes.rows.length) {
      return res.status(404).json({ success: false, error: 'Node not found' });
    }

    const node = nodeRes.rows[0];
    const agentsDeployed = Array.isArray(node.agents_deployed) ? node.agents_deployed : [];
    const agentIds = agentsDeployed.map(a => (typeof a === 'string' ? a : a.id)).filter(Boolean);
    const agentEntryMap = new Map(
      agentsDeployed
        .filter((entry) => entry && typeof entry === 'object' && entry.id)
        .map((entry) => [entry.id, entry])
    );

    if (!agentIds.length) {
      return res.json({ agents: [] });
    }

    const agentsRes = await pool.query(
      `SELECT id, username, name, role, system_prompt, model, temperature, max_tokens, avatar, capabilities
       FROM ${SCHEMA}.agents
       WHERE id = ANY($1::uuid[]) AND workspace_id = $2`,
      [agentIds, workspaceId]
    );

    const isEnterprise = getNodeMode(node) === 'enterprise';
    const clientName = node.config?.client_name || node.config?.clientName || 'client';

    const agents = agentsRes.rows.map(agent => {
      const enterpriseProfile = getNodeEnterpriseProfile(node, agentEntryMap.get(agent.id));
      const sniparaInstanceId = isEnterprise
        ? `nexus-${clientName}-${agent.id}`.toLowerCase().replace(/[^a-z0-9-]/g, '-')
        : agent.id;
      return mapAgentConfig(agent, sniparaInstanceId, enterpriseProfile);
    });

    res.json({ agents });
  } catch (err) {
    console.error('[NEXUS] Get agent-configs error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /:nodeId/agent-configs/:agentId
 * Returns config for a single agent on this node (used by spawn).
 */
router.get('/:nodeId/agent-configs/:agentId', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const { nodeId, agentId } = req.params;

    const nodeRes = await pool.query(
      `SELECT * FROM ${SCHEMA}.nexus_nodes WHERE id::text = $1 AND workspace_id = $2 LIMIT 1`,
      [nodeId, workspaceId]
    );
    if (!nodeRes.rows.length) {
      return res.status(404).json({ success: false, error: 'Node not found' });
    }

    const node = nodeRes.rows[0];
    const agentsDeployed = Array.isArray(node.agents_deployed) ? node.agents_deployed : [];
    const isDeployed = agentsDeployed.some(a => (typeof a === 'string' ? a : a.id) === agentId);
    const agentEntry = agentsDeployed.find((entry) => (typeof entry === 'string' ? entry : entry.id) === agentId);
    if (!isDeployed) {
      return res.status(404).json({ success: false, error: 'Agent not deployed on this node' });
    }

    const agentRes = await pool.query(
      `SELECT id, username, name, role, system_prompt, model, temperature, max_tokens, avatar, capabilities
       FROM ${SCHEMA}.agents
       WHERE id = $1::uuid AND workspace_id = $2
       LIMIT 1`,
      [agentId, workspaceId]
    );
    if (!agentRes.rows.length) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    const agent = agentRes.rows[0];
    const isEnterprise = getNodeMode(node) === 'enterprise';
    const clientName = node.config?.client_name || node.config?.clientName || 'client';
    const sniparaInstanceId = isEnterprise
      ? `nexus-${clientName}-${agent.id}`.toLowerCase().replace(/[^a-z0-9-]/g, '-')
      : agent.id;

    res.json({ agent: mapAgentConfig(agent, sniparaInstanceId, getNodeEnterpriseProfile(node, agentEntry)) });
  } catch (err) {
    console.error('[NEXUS] Get agent-config error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:nodeId/commands', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    await ensureNexusCommandsTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const { nodeId } = req.params;

    const node = await loadNodeForWorkspace(workspaceId, nodeId);
    if (!node) {
      return res.status(404).json({ success: false, error: 'Node not found' });
    }

    await refreshCommandState(workspaceId, { nodeId });
    const limit = Math.max(1, Math.min(10, Number.parseInt(String(req.query.limit || '5'), 10) || 5));
    const claim = String(req.query.claim || '1') !== '0';

    let commands = [];
    if (claim) {
      const claimRes = await pool.query(
        `WITH next_commands AS (
           SELECT id
             FROM ${SCHEMA}.nexus_commands
            WHERE workspace_id = $1
              AND node_id = $2::uuid
              AND status = 'queued'
            ORDER BY created_at ASC
            LIMIT $3
            FOR UPDATE SKIP LOCKED
         )
         UPDATE ${SCHEMA}.nexus_commands cmd
            SET status = 'in_progress',
                started_at = COALESCE(cmd.started_at, NOW()),
                updated_at = NOW(),
                lease_expires_at = NOW() + (cmd.lease_ms * INTERVAL '1 millisecond'),
                attempt_count = cmd.attempt_count + 1
           FROM next_commands
          WHERE cmd.id = next_commands.id
          RETURNING cmd.id, cmd.command_type, cmd.payload, cmd.created_at, cmd.started_at, cmd.attempt_count, cmd.max_attempts, cmd.lease_expires_at, cmd.expires_at`,
        [workspaceId, nodeId, limit]
      );
      commands = claimRes.rows;
    } else {
      const listRes = await pool.query(
        `SELECT id, command_type, payload, created_at, started_at, attempt_count, max_attempts, lease_expires_at, expires_at
           FROM ${SCHEMA}.nexus_commands
          WHERE workspace_id = $1
            AND node_id = $2::uuid
            AND status = 'queued'
          ORDER BY created_at ASC
          LIMIT $3`,
        [workspaceId, nodeId, limit]
      );
      commands = listRes.rows;
    }

    res.json({
      success: true,
      commands: commands.map((row) => ({
        id: row.id,
        type: row.command_type,
        payload: row.payload || {},
        createdAt: row.created_at,
        startedAt: row.started_at || null,
        attempts: Number(row.attempt_count || 0),
        maxAttempts: Number(row.max_attempts || 0),
        leaseExpiresAt: row.lease_expires_at || null,
        expiresAt: row.expires_at || null,
      })),
    });
  } catch (err) {
    console.error('[NEXUS] Get commands error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:nodeId/commands/:commandId/result', async (req, res) => {
  try {
    await ensureNexusCommandsTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const { nodeId, commandId } = req.params;
    await refreshCommandState(workspaceId, { nodeId, commandId });
    const { status, result, error } = req.body || {};
    const safeStatus = status === 'completed' ? 'completed' : 'failed';

    const updated = await pool.query(
      `UPDATE ${SCHEMA}.nexus_commands
          SET status = $3,
              result = $4::jsonb,
              error = $5,
              progress = COALESCE(progress, $6::jsonb),
              completed_at = NOW(),
              lease_expires_at = NULL,
              updated_at = NOW()
        WHERE id::text = $1
          AND workspace_id = $2
          AND node_id = $7::uuid
          AND status IN ('queued', 'in_progress')
        RETURNING id`,
      [
        commandId,
        workspaceId,
        safeStatus,
        JSON.stringify(result || null),
        error || null,
        JSON.stringify(result?.progress || null),
        nodeId,
      ]
    );

    if (!updated.rows.length) {
      return res.status(409).json({ success: false, error: 'Command is no longer claimable' });
    }

    res.json({ success: true, commandId, status: safeStatus });
  } catch (err) {
    console.error('[NEXUS] Command result error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:nodeId/commands/:commandId/progress', async (req, res) => {
  try {
    await ensureNexusCommandsTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const { nodeId, commandId } = req.params;
    await refreshCommandState(workspaceId, { nodeId, commandId });
    const progress = {
      ...(req.body?.progress || {}),
      updatedAt: req.body?.progress?.updatedAt || new Date().toISOString(),
    };

    const updated = await pool.query(
      `UPDATE ${SCHEMA}.nexus_commands
          SET status = CASE WHEN status = 'queued' THEN 'in_progress' ELSE status END,
              progress = $4::jsonb,
              lease_expires_at = NOW() + (lease_ms * INTERVAL '1 millisecond'),
              updated_at = NOW(),
              started_at = COALESCE(started_at, NOW())
        WHERE id::text = $1
          AND workspace_id = $2
          AND node_id = $3::uuid
          AND status IN ('queued', 'in_progress')
        RETURNING id, command_type, status, payload, progress, result, error,
                  timeout_ms, lease_ms, expires_at, lease_expires_at, attempt_count, max_attempts,
                  created_at, started_at, completed_at, updated_at`,
      [commandId, workspaceId, nodeId, JSON.stringify(progress)]
    );

    if (!updated.rows.length) {
      return res.status(404).json({ success: false, error: 'Command not found or already completed' });
    }

    res.json({ success: true, command: mapNodeCommand(updated.rows[0]) });
  } catch (err) {
    console.error('[NEXUS] Command progress error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:nodeId/governance/audit', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    await ensureGovernanceTables();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const node = await loadNodeForWorkspace(workspaceId, req.params.nodeId);
    if (!node) return res.status(404).json({ success: false, error: 'Node not found' });

    const audit = await createAuditEvent({
      workspaceId,
      nodeId: req.params.nodeId,
      commandId: req.body?.commandId || null,
      approvalId: req.body?.approvalId || null,
      agentId: req.body?.agentId || null,
      profileKey: req.body?.profileKey || null,
      requestType: req.body?.requestType || null,
      eventType: req.body?.eventType || 'runtime_event',
      decision: req.body?.decision || null,
      outcomeStatus: req.body?.outcomeStatus || null,
      message: req.body?.message || null,
      payload: req.body?.payload || {},
    });

    res.status(201).json({ success: true, audit });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:nodeId/governance/approvals', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    await ensureGovernanceTables();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const node = await loadNodeForWorkspace(workspaceId, req.params.nodeId);
    if (!node) return res.status(404).json({ success: false, error: 'Node not found' });

    const approval = await createApprovalRequest({
      workspaceId,
      nodeId: req.params.nodeId,
      commandId: req.body?.commandId || null,
      requestType: req.body?.requestType || 'unknown',
      title: req.body?.title || 'Enterprise approval required',
      summary: req.body?.summary || null,
      profileKey: req.body?.profileKey || null,
      agentId: req.body?.agentId || null,
      governance: req.body?.governance || {},
      requestPayload: req.body?.requestPayload || {},
      scopeKey: req.body?.scopeKey || req.body?.scope_key || null,
      scopeMode: req.body?.scopeMode || req.body?.scope_mode || null,
      scopeExpiresAt: req.body?.scopeExpiresAt || req.body?.scope_expires_at || null,
    });

    const email = await notifyApprovalByEmail({ workspaceId, node, approval });

    res.status(201).json({ success: true, approval, email });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:nodeId/governance/scopes/resolve', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    await ensureGovernanceTables();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const scopeKey = typeof req.query.scopeKey === 'string' ? req.query.scopeKey : '';
    if (!scopeKey) return res.status(400).json({ success: false, error: 'scopeKey is required' });
    const node = await loadNodeForWorkspace(workspaceId, req.params.nodeId);
    if (!node) return res.status(404).json({ success: false, error: 'Node not found' });

    const approval = await findActiveApprovalScope(workspaceId, req.params.nodeId, scopeKey);
    res.json({ success: true, scope: approval });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:nodeId/governance/approvals/:approvalId', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    await ensureGovernanceTables();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const node = await loadNodeForWorkspace(workspaceId, req.params.nodeId);
    if (!node) return res.status(404).json({ success: false, error: 'Node not found' });

    const approval = await getApprovalRequest(workspaceId, req.params.nodeId, req.params.approvalId);
    if (!approval) return res.status(404).json({ success: false, error: 'Approval not found' });

    res.json({ success: true, approval });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:nodeId/governance/approvals/:approvalId/runtime-status', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    await ensureGovernanceTables();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const node = await loadNodeForWorkspace(workspaceId, req.params.nodeId);
    if (!node) return res.status(404).json({ success: false, error: 'Node not found' });

    const approval = await markApprovalExecution({
      workspaceId,
      nodeId: req.params.nodeId,
      approvalId: req.params.approvalId,
      status: req.body?.status || 'approved',
      executionCommandId: req.body?.executionCommandId || req.body?.execution_command_id || null,
    });
    if (!approval) return res.status(404).json({ success: false, error: 'Approval not found' });

    res.json({ success: true, approval });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/nodes/:nodeId/commands', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    await ensureNexusCommandsTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const { nodeId } = req.params;
    await refreshCommandState(workspaceId, { nodeId });

    const node = await loadNodeForWorkspace(workspaceId, nodeId);
    if (!node) return res.status(404).json({ success: false, error: 'Node not found' });

    const limit = Math.max(1, Math.min(100, Number.parseInt(String(req.query.limit || '25'), 10) || 25));
    const result = await pool.query(
      `SELECT id, command_type, status, payload, progress, result, error,
              timeout_ms, lease_ms, expires_at, lease_expires_at, attempt_count, max_attempts,
              created_at, started_at, completed_at, updated_at
         FROM ${SCHEMA}.nexus_commands
        WHERE workspace_id = $1
          AND node_id = $2::uuid
        ORDER BY created_at DESC
        LIMIT $3`,
      [workspaceId, nodeId, limit]
    );

    res.json({
      success: true,
      summary: await getWorkspaceCommandStats(workspaceId, nodeId),
      commands: result.rows.map(mapNodeCommand),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/nodes/:nodeId/governance/approvals', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    await ensureGovernanceTables();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const node = await loadNodeForWorkspace(workspaceId, req.params.nodeId);
    if (!node) return res.status(404).json({ success: false, error: 'Node not found' });

    const approvals = await listApprovalRequests(workspaceId, req.params.nodeId, {
      status: typeof req.query.status === 'string' ? req.query.status : null,
      limit: req.query.limit,
    });

    res.json({ success: true, approvals });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/nodes/:nodeId/governance/scopes', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    await ensureGovernanceTables();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const node = await loadNodeForWorkspace(workspaceId, req.params.nodeId);
    if (!node) return res.status(404).json({ success: false, error: 'Node not found' });

    const approvals = await listApprovalRequests(workspaceId, req.params.nodeId, {
      status: typeof req.query.status === 'string' ? req.query.status : null,
      limit: req.query.limit || 100,
    });
    const scopes = approvals.filter((approval) => approval.scopeKey && approval.scopeMode === 'process');
    res.json({ success: true, scopes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/nodes/:nodeId/governance/audit', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    await ensureGovernanceTables();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const node = await loadNodeForWorkspace(workspaceId, req.params.nodeId);
    if (!node) return res.status(404).json({ success: false, error: 'Node not found' });

    const audit = await listAuditEvents(workspaceId, req.params.nodeId, {
      requestType: typeof req.query.requestType === 'string' ? req.query.requestType : null,
      limit: req.query.limit,
    });

    res.json({ success: true, audit });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/nodes/:nodeId/governance/approvals/:approvalId/approve', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    await ensureGovernanceTables();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const node = await loadNodeForWorkspace(workspaceId, req.params.nodeId);
    if (!node) return res.status(404).json({ success: false, error: 'Node not found' });

    const resolved = await resolveApprovalRequest({
      workspaceId,
      nodeId: req.params.nodeId,
      approvalId: req.params.approvalId,
      status: 'approved',
      resolutionComment: req.body?.comment || req.body?.resolutionComment || null,
      resolvedByUserId: req.userId || req.user?.id || null,
      resolvedByName: req.user?.name || req.user?.email || 'Unknown',
      scopeKey: req.body?.scopeKey || req.body?.scope_key || null,
      scopeMode: req.body?.scopeMode || req.body?.scope_mode || null,
      scopeExpiresAt: req.body?.scopeExpiresAt || req.body?.scope_expires_at || null,
    });
    if (!resolved) {
      return res.status(409).json({ success: false, error: 'Approval is not pending or does not exist' });
    }

    const governance = resolved.governance || {};
    const requestPayload = resolved.requestPayload || {};
    const action = governance.runtimeAction || requestPayload.action;
    const args = {
      ...(requestPayload.args || {}),
      governanceApprovalId: resolved.id,
    };

    let executionCommand = null;
    let queueError = null;
    try {
      executionCommand = await enqueueNodeCommand({
        workspaceId,
        nodeId: req.params.nodeId,
        commandType: 'dispatch_action',
        payload: { action, args },
        userId: req.userId || req.user?.id || null,
        timing: req.body || {},
      });
    } catch (error) {
      queueError = error.message;
    }

    await markApprovalExecution({
      workspaceId,
      nodeId: req.params.nodeId,
      approvalId: resolved.id,
      status: 'approved',
      executionCommandId: executionCommand?.id || null,
    });

    await createAuditEvent({
      workspaceId,
      nodeId: req.params.nodeId,
      commandId: executionCommand?.id || resolved.commandId,
      approvalId: resolved.id,
      agentId: governance.agentId || args.agentId || args.agent_id || null,
      profileKey: governance.profileKey || null,
      requestType: governance.requestType || null,
      eventType: 'approval_approved',
      decision: 'approved',
      outcomeStatus: executionCommand ? 'queued' : 'approved',
      message: executionCommand
        ? `Approval granted for ${governance.requestType || 'enterprise_request'}`
        : `Approval granted for ${governance.requestType || 'enterprise_request'} (execution queue pending manual retry)`,
      payload: {
        approval: resolved,
        executionCommandId: executionCommand?.id || null,
        queueError,
      },
    });

    res.json({
      success: true,
      approval: resolved,
      executionCommandId: executionCommand?.id || undefined,
      queueError: queueError || undefined,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/nodes/:nodeId/governance/approvals/:approvalId/reject', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    await ensureGovernanceTables();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const node = await loadNodeForWorkspace(workspaceId, req.params.nodeId);
    if (!node) return res.status(404).json({ success: false, error: 'Node not found' });

    const resolved = await resolveApprovalRequest({
      workspaceId,
      nodeId: req.params.nodeId,
      approvalId: req.params.approvalId,
      status: 'rejected',
      resolutionComment: req.body?.comment || req.body?.resolutionComment || null,
      resolvedByUserId: req.userId || req.user?.id || null,
      resolvedByName: req.user?.name || req.user?.email || 'Unknown',
    });
    if (!resolved) {
      return res.status(409).json({ success: false, error: 'Approval is not pending or does not exist' });
    }

    await createAuditEvent({
      workspaceId,
      nodeId: req.params.nodeId,
      commandId: resolved.commandId,
      approvalId: resolved.id,
      agentId: resolved.agentId,
      profileKey: resolved.profileKey,
      requestType: resolved.requestType,
      eventType: 'approval_rejected',
      decision: 'rejected',
      outcomeStatus: 'rejected',
      message: `Approval rejected for ${resolved.requestType}`,
      payload: {
        approval: resolved,
      },
    });

    res.json({ success: true, approval: resolved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/nodes/:nodeId/governance/approvals/:approvalId/revoke-scope', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    await ensureGovernanceTables();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const node = await loadNodeForWorkspace(workspaceId, req.params.nodeId);
    if (!node) return res.status(404).json({ success: false, error: 'Node not found' });

    const approval = await revokeApprovalScope({
      workspaceId,
      nodeId: req.params.nodeId,
      approvalId: req.params.approvalId,
    });
    if (!approval) return res.status(404).json({ success: false, error: 'Approval not found' });

    await createAuditEvent({
      workspaceId,
      nodeId: req.params.nodeId,
      commandId: approval.commandId,
      approvalId: approval.id,
      agentId: approval.agentId,
      profileKey: approval.profileKey,
      requestType: approval.requestType,
      eventType: 'scope_revoked',
      decision: 'revoked',
      outcomeStatus: 'revoked',
      message: `Process scope revoked for ${approval.scopeKey || approval.id}`,
      payload: { approval },
    });

    res.json({ success: true, approval });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /:nodeId/agents/create
 * Enterprise only — create a new agent from scratch on a node.
 */
router.post('/:nodeId/agents/create', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const out = await createEnterpriseAgentForNode({ workspaceId, nodeId: req.params.nodeId, body: req.body || {} });
    res.status(201).json(out);
  } catch (err) {
    console.error('[NEXUS] Create agent error:', err.message);
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

router.get('/nodes/:id', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    await ensureNexusCommandsTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    await refreshCommandState(workspaceId, { nodeId: req.params.id });
    const node = await loadNodeForWorkspace(workspaceId, req.params.id);
    if (!node) return res.status(404).json({ success: false, error: 'Node not found' });

    const mapped = mapNode(node);
    const providerSources = await getNodeProviderSources(workspaceId, node);
    const commandsRes = await pool.query(
      `SELECT id, command_type, status, payload, created_at, completed_at
         FROM ${SCHEMA}.nexus_commands
        WHERE workspace_id = $1
          AND node_id = $2::uuid
        ORDER BY created_at DESC
        LIMIT 10`,
      [workspaceId, req.params.id]
    ).catch(() => ({ rows: [] }));

    res.json({
      success: true,
      node: {
        id: mapped.id,
        name: mapped.name,
        status: mapped.status === 'online' ? 'online' : 'offline',
        lastHeartbeat: mapped.lastHeartbeat,
        agents: (mapped.agents || []).map(mapRuntimeAgent),
        seats: mapped.seats,
        agentCount: mapped.agentCount,
        mode: mapped.mode,
        clientName: mapped.clientName || undefined,
        poolAgentIds: Array.isArray(mapped.config?.available_pool) ? mapped.config.available_pool : [],
        providerSources,
        recentActivity: commandsRes.rows.map((row) => ({
          id: row.id,
          message: describeNodeCommand(row),
          timestamp: row.completed_at || row.created_at,
        })),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/nodes/:nodeId/commands/:commandId', async (req, res) => {
  try {
    await ensureNexusCommandsTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    await refreshCommandState(workspaceId, { nodeId: req.params.nodeId, commandId: req.params.commandId });
    const commandRes = await pool.query(
      `SELECT id, command_type, status, payload, progress, result, error,
              timeout_ms, lease_ms, expires_at, lease_expires_at, attempt_count, max_attempts,
              created_at, started_at, completed_at, updated_at
         FROM ${SCHEMA}.nexus_commands
        WHERE workspace_id = $1
          AND node_id = $2::uuid
          AND id::text = $3
        LIMIT 1`,
      [workspaceId, req.params.nodeId, req.params.commandId]
    );

    const row = commandRes.rows[0];
    if (!row) return res.status(404).json({ success: false, error: 'Command not found' });

    res.json({ success: true, command: mapNodeCommand(row) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/nodes/:nodeId/agents', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const node = await loadNodeForWorkspace(workspaceId, req.params.nodeId);
    if (!node) return res.status(404).json({ success: false, error: 'Node not found' });
    const agents = (Array.isArray(node.agents_deployed) ? node.agents_deployed : []).map(mapRuntimeAgent);
    res.json({ agents });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/nodes/:nodeId/agents', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const out = await createEnterpriseAgentForNode({ workspaceId, nodeId: req.params.nodeId, body: req.body || {} });
    res.status(201).json(out.agent);
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

router.post('/nodes/:nodeId/agents/spawn', async (_req, res) => {
  try {
    await ensureNexusNodesTable();
    const workspaceId = _req.workspaceId || DEFAULT_WORKSPACE;
    const node = await loadNodeForWorkspace(workspaceId, _req.params.nodeId);
    if (!node) return res.status(404).json({ success: false, error: 'Node not found' });
    const agentId = _req.body?.agentId || null;
    const availablePool = Array.isArray(node.config?.available_pool) ? node.config.available_pool : [];
    if (!agentId) {
      return res.status(400).json({ success: false, error: 'agentId is required' });
    }
    if (!availablePool.includes(agentId)) {
      return res.status(400).json({ success: false, error: 'Agent is not available in this node pool' });
    }

    const command = await enqueueNodeCommand({
      workspaceId,
      nodeId: _req.params.nodeId,
      commandType: 'spawn_agent',
      payload: { agentId },
      userId: _req.userId || _req.user?.id || null,
      timing: _req.body || {},
    });

    const done = await waitForNodeCommand(workspaceId, command.id, 30000);
    if (!done) {
      return res.status(202).json({ success: true, queued: true, commandId: command.id });
    }
    if (done.status !== 'completed') {
      return res.status(400).json({ success: false, error: done.error || 'Agent spawn failed', commandId: command.id });
    }
    res.json({ success: true, commandId: command.id, ...(done.result || {}) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/nodes/:nodeId/agents/:agentId/stop', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const node = await loadNodeForWorkspace(workspaceId, req.params.nodeId);
    if (!node) return res.status(404).json({ success: false, error: 'Node not found' });

    const command = await enqueueNodeCommand({
      workspaceId,
      nodeId: req.params.nodeId,
      commandType: 'stop_agent',
      payload: { agentId: req.params.agentId },
      userId: req.userId || req.user?.id || null,
      timing: req.body || {},
    });

    const done = await waitForNodeCommand(workspaceId, command.id);
    if (!done) {
      return res.status(202).json({ success: true, queued: true, commandId: command.id });
    }
    if (done.status !== 'completed') {
      return res.status(400).json({ success: false, error: done.error || 'Agent stop failed', commandId: command.id });
    }
    res.json({ success: true, commandId: command.id, ...(done.result || {}) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/nodes/:nodeId/dispatch', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const node = await loadNodeForWorkspace(workspaceId, req.params.nodeId);
    if (!node) return res.status(404).json({ success: false, error: 'Node not found' });

    const command = await enqueueNodeCommand({
      workspaceId,
      nodeId: req.params.nodeId,
      commandType: 'dispatch_action',
      payload: {
        action: req.body?.command,
        args: req.body?.args || {},
      },
      userId: req.userId || req.user?.id || null,
      timing: req.body || {},
    });

    const shouldWait = !(
      req.query.wait === '0' ||
      req.query.wait === 'false' ||
      req.body?.wait === false
    );

    if (!shouldWait) {
      return res.status(202).json({
        success: true,
        queued: true,
        commandId: command.id,
        command: mapNodeCommand(command),
      });
    }

    const done = await waitForNodeCommand(workspaceId, command.id);
    if (!done) {
      return res.status(202).json({
        success: true,
        queued: true,
        commandId: command.id,
        command: mapNodeCommand(command),
      });
    }
    if (done.status !== 'completed') {
      return res.status(400).json(done.result || {
        taskId: command.id,
        status: 'error',
        error: done.error || 'Dispatch failed',
      });
    }
    res.json(done.result || { taskId: command.id, status: 'completed', data: null });
  } catch (err) {
    res.status(500).json({ taskId: '', status: 'error', error: err.message });
  }
});

router.get('/nodes/:nodeId/capabilities', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const node = await loadNodeForWorkspace(workspaceId, req.params.nodeId);
    if (!node) return res.status(404).json({ success: false, error: 'Node not found' });
    const providerSources = await getNodeProviderSources(workspaceId, node);

    res.json({
      platform: node.type || 'nexus',
      providers: Object.keys(providerSources),
      providerSources,
      permissions: {
        allowedFolders: node.config?.permissions?.allowedFolders || [],
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
