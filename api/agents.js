/**
 * Agents API — PostgreSQL (Vaultbrix)
 * Migrated from MongoDB/Rocket.Chat
 */
const express = require("express");
const crypto = require('crypto');
const pool = require("../lib/vaultbrix");
const { normalizeStoredAvatar, buildSpriteAvatar } = require("../lib/avatarPath");
const {
  normalizeCapabilities,
  splitCapabilities,
  buildAgentConfigUpdate,
  countCountedSkills,
  mergeCapabilities,
} = require("../services/agentConfigPolicy");
const {
  normalizeAgentIntegrationProviders,
  listAgentIntegrationProviders,
  replaceAgentIntegrationProviders,
} = require("../services/agentIntegrationService");
const {
  ensureAgentDriveProvisioned,
  resolveAgentDriveRoot,
} = require('../services/agentDriveService');
const { ensureAgentConfigurationSchema } = require('../services/agentSchemaService');
const {
  getDefaultCapabilitiesForAgentTypes,
} = require('../services/agentTypeProfiles');
const {
  getAgentConfigSections,
  normalizeAgentConfig,
  normalizeAccessPolicy,
  normalizeProvisioning,
  normalizeMemoryPolicy,
  normalizeGovernance,
  mergeAgentConfiguration,
  reconcileSandboxCapability,
  validateSandboxConfiguration,
} = require('../services/agentAccessPolicyService');
const { resolveAgentCapabilityMatrix } = require('../services/agentCapabilityMatrixService');
const router = express.Router();
const SCHEMA = "tenant_vutler";
const MINIMAL_PROMPT = (agentName) => `You are ${agentName}, an AI agent on Vutler. Load your context from Snipara at startup (rlm_recall). Adapt your tools and knowledge based on your user's needs. Persist learnings via rlm_remember.`;
const COORDINATOR_NAME = (process.env.VUTLER_COORDINATOR_NAME || 'Jarvis').toLowerCase();
const FALLBACK_DOMAIN_SUFFIX = process.env.VUTLER_FALLBACK_DOMAIN_SUFFIX || 'vutler.ai';
const MAX_SKILLS = 8;
const DEFAULT_WORKSPACE = "00000000-0000-0000-0000-000000000001";

/** Serialize type for DB: array → JSON string, string → as-is */
function serializeType(type) {
  if (Array.isArray(type)) return JSON.stringify(type);
  return type || null;
}

/** Deserialize type from DB: JSON array string → array, plain string → wrap */
function deserializeType(type) {
  if (!type) return [];
  try {
    const parsed = JSON.parse(type);
    if (Array.isArray(parsed)) return parsed;
  } catch (_) {}
  return type === 'bot' ? [] : [type];
}

/**
 * Resolve the default email domain for a workspace.
 * Prefers the first fully-verified custom domain; falls back to {slug}.vutler.ai.
 */
async function resolveWorkspaceEmailDomain(workspaceId) {
  try {
    const verified = await pool.query(
      `SELECT domain FROM ${SCHEMA}.workspace_domains
       WHERE workspace_id = $1 AND mx_verified = true AND spf_verified = true
       ORDER BY verified_at DESC LIMIT 1`,
      [workspaceId]
    );
    if (verified.rows[0]) return verified.rows[0].domain;
  } catch (_) {}

  try {
    const ws = await pool.query(
      `SELECT slug FROM ${SCHEMA}.workspaces WHERE id = $1 LIMIT 1`,
      [workspaceId]
    );
    if (ws.rows[0]?.slug) return `${ws.rows[0].slug}.${FALLBACK_DOMAIN_SUFFIX}`;
  } catch (_) {}

  return `workspace.${FALLBACK_DOMAIN_SUFFIX}`;
}

/**
 * Generate a unique agent email address: {username}@{domain}
 * If the address is taken, append a short suffix.
 */
async function generateAgentEmail(username, workspaceId) {
  const domain = await resolveWorkspaceEmailDomain(workspaceId);
  const base = `${username.toLowerCase().replace(/[^a-z0-9._-]/g, '')}@${domain}`;

  // Check uniqueness in email_routes
  try {
    const existing = await pool.query(
      `SELECT id FROM ${SCHEMA}.email_routes WHERE email_address = $1 LIMIT 1`,
      [base]
    );
    if (existing.rows.length === 0) return base;
    // Address taken — append a random 4-char suffix
    const suffix = Math.random().toString(36).slice(2, 6);
    return `${username.toLowerCase().replace(/[^a-z0-9._-]/g, '')}-${suffix}@${domain}`;
  } catch (_) {
    return base;
  }
}

function getWorkspaceId(req) {
  return req.workspaceId || DEFAULT_WORKSPACE;
}

async function findAgentByRef(agentRef, workspaceId, columns = '*') {
  return pool.query(
    `SELECT ${columns}
       FROM ${SCHEMA}.agents
      WHERE (id::text = $1 OR username = $1)
        AND workspace_id = $2
      LIMIT 1`,
    [agentRef, workspaceId]
  );
}

function normalizePlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key);
}

function pickFirstDefined(...values) {
  for (const value of values) {
    if (value !== undefined) return value;
  }
  return undefined;
}

function extractAgentPayload(body = {}) {
  const payload = normalizePlainObject(body);
  return {
    payload,
    identity: normalizePlainObject(payload.identity),
    profile: normalizePlainObject(payload.profile),
    brain: normalizePlainObject(payload.brain),
    accessPolicyInput: pickFirstDefined(payload.access_policy, payload.accessPolicy),
    provisioningInput: pickFirstDefined(payload.provisioning, payload.provisioning_policy),
    memoryPolicyInput: pickFirstDefined(payload.memory_policy, payload.memoryPolicy),
    governanceInput: pickFirstDefined(payload.governance, payload.governance_policy),
  };
}

function resolveRequestedCapabilities(body = {}, existingCapabilities = [], fallbackTypes = []) {
  if (Array.isArray(body.persistent_skills)) {
    return normalizeCapabilities(body.persistent_skills);
  }

  if (hasOwn(body, 'capabilities') || hasOwn(body, 'skills') || hasOwn(body, 'tools')) {
    return mergeCapabilities(body, existingCapabilities);
  }

  return getDefaultCapabilitiesForAgentTypes(fallbackTypes, MAX_SKILLS);
}

function isCoordinatorAgent(agent = {}) {
  const typeValues = Array.isArray(agent.type) ? agent.type : deserializeType(agent.type);
  return typeValues.includes('coordinator')
    || String(agent.role || '').toLowerCase() === 'coordinator'
    || String(agent.username || '').toLowerCase().startsWith(COORDINATOR_NAME);
}

function buildAgentResponse(row, { drivePath = null, integrations = null } = {}) {
  const isCoordinator = isCoordinatorAgent(row);
  const capabilities = normalizeCapabilities(row.capabilities || []);
  const { skills, tools } = splitCapabilities(capabilities);
  const { accessPolicy, provisioning, memoryPolicy, governance } = getAgentConfigSections(row);

  return {
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email,
    status: row.status || 'online',
    type: deserializeType(row.type),
    avatar: row.avatar || null,
    description: row.description || '',
    role: row.role,
    mbti: row.mbti,
    model: row.model,
    provider: row.provider,
    platform: row.platform || row.role || null,
    system_prompt: isCoordinator ? null : row.system_prompt,
    temperature: row.temperature,
    max_tokens: row.max_tokens,
    capabilities,
    skills,
    tools,
    integrations,
    access_policy: accessPolicy,
    provisioning,
    memory_policy: memoryPolicy,
    governance,
    badge: isCoordinator ? 'system-coordinator' : null,
    systemAgent: isCoordinator,
    drive_path: drivePath,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildConfigResponse(row, integrations = []) {
  const isCoordinator = isCoordinatorAgent(row);
  const capabilities = normalizeCapabilities(row.capabilities || []);
  const { skills, tools } = splitCapabilities(capabilities);
  const { accessPolicy, provisioning, memoryPolicy, governance } = getAgentConfigSections(row);

  return {
    model: row.model,
    provider: row.provider,
    temperature: row.temperature,
    max_tokens: row.max_tokens,
    system_prompt: isCoordinator ? null : row.system_prompt,
    skills,
    tools,
    capabilities,
    integrations,
    type: deserializeType(row.type),
    access_policy: accessPolicy,
    provisioning,
    memory_policy: memoryPolicy,
    governance,
    locked_prompt: isCoordinator,
  };
}

async function syncAgentEmailRoute(db, workspaceId, agentId, emailAddress) {
  if (!workspaceId || !agentId || !emailAddress) return;

  await db.query(
    `DELETE FROM ${SCHEMA}.email_routes
     WHERE workspace_id = $1
       AND agent_id = $2
       AND email_address <> $3`,
    [workspaceId, agentId, emailAddress]
  ).catch(() => {});

  await db.query(
    `INSERT INTO ${SCHEMA}.email_routes (workspace_id, email_address, agent_id, auto_reply, approval_required)
     VALUES ($1, $2, $3, true, true)
     ON CONFLICT (email_address) DO UPDATE SET
       workspace_id = EXCLUDED.workspace_id,
       agent_id = EXCLUDED.agent_id,
       auto_reply = EXCLUDED.auto_reply,
       approval_required = EXCLUDED.approval_required`,
    [workspaceId, emailAddress, agentId]
  );
}

async function clearAgentEmailRoutes(db, workspaceId, agentId) {
  if (!workspaceId || !agentId) return;
  await db.query(
    `DELETE FROM ${SCHEMA}.email_routes
     WHERE workspace_id = $1
       AND agent_id = $2`,
    [workspaceId, agentId]
  ).catch(() => {});
}


// GET /api/v1/agents — list all agents
router.get("/", async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const driveRootBase = await resolveAgentDriveRoot(workspaceId, { id: 'agent-root-placeholder' })
      .then((value) => value.replace(/\/agent-root-placeholder$/, ''))
      .catch(() => null);
    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.agents WHERE workspace_id = $1 ORDER BY name`,
      [workspaceId]
    );
    const agents = result.rows.map(a => {
      const capabilities = normalizeCapabilities(a.capabilities || []);
      return ({
      id: a.id,
      name: a.name,
      username: a.username,
      email: a.email,
      status: a.status || "online",
      type: deserializeType(a.type),
      avatar: a.avatar || null,
      description: a.description || "",
      role: a.role,
      mbti: a.mbti,
      model: a.model,
      provider: a.provider,
      platform: a.platform || a.role || null,
      system_prompt: ((a.type === 'coordinator' || String(a.role||'').toLowerCase()==='coordinator') ? null : a.system_prompt),
      temperature: a.temperature,
      max_tokens: a.max_tokens,
      capabilities,
      badge: ((a.type === 'coordinator' || String(a.role||'').toLowerCase()==='coordinator') ? 'system-coordinator' : null),
      systemAgent: (a.type === 'coordinator' || String(a.role||'').toLowerCase()==='coordinator'),
      drive_path: driveRootBase ? `${driveRootBase}/${a.id}` : null,
      createdAt: a.created_at,
      updatedAt: a.updated_at
    });
    });
    res.json({ success: true, agents, count: agents.length, skip: 0, limit: 100 });
  } catch (err) {
    console.error("[AGENTS] List error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/agents/:id — single agent (by id or username)
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const workspaceId = getWorkspaceId(req);
    const result = await findAgentByRef(id, workspaceId);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Agent not found", id });
    }
    const a = result.rows[0];
    const drivePath = await resolveAgentDriveRoot(workspaceId, a).catch(() => null);
    const integrations = await listAgentIntegrationProviders(workspaceId, a.id).catch(() => []);
    res.json({
      success: true,
      agent: buildAgentResponse(a, { drivePath, integrations }),
    });
  } catch (err) {
    console.error("[AGENTS] Get error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/:id/capability-matrix", async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const result = await findAgentByRef(req.params.id, workspaceId);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Agent not found" });
    }

    const matrix = await resolveAgentCapabilityMatrix({
      workspaceId,
      agent: result.rows[0],
      db: pool,
    });

    res.json({ success: true, data: matrix });
  } catch (err) {
    console.error("[AGENTS] Capability matrix error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/agents — create agent
router.post("/", async (req, res) => {
  let client = null;
  try {
    await ensureAgentConfigurationSchema(pool);
    const {
      payload,
      identity,
      profile,
      brain,
      accessPolicyInput,
      provisioningInput,
      memoryPolicyInput,
      governanceInput,
    } = extractAgentPayload(req.body);
    const name = pickFirstDefined(identity.name, payload.name);
    const username = pickFirstDefined(identity.username, payload.username);
    const email = pickFirstDefined(
      payload.email,
      normalizePlainObject(provisioningInput).email?.address,
      normalizePlainObject(provisioningInput).email?.email
    );
    const type = pickFirstDefined(profile.types, payload.type);
    const role = pickFirstDefined(profile.role, payload.role);
    const mbti = pickFirstDefined(profile.mbti, payload.mbti);
    const model = pickFirstDefined(brain.model, payload.model);
    const provider = pickFirstDefined(brain.provider, payload.provider);
    const description = pickFirstDefined(identity.description, payload.description);
    const system_prompt = pickFirstDefined(brain.system_prompt, brain.systemPrompt, payload.system_prompt);
    const temperature = pickFirstDefined(brain.temperature, payload.temperature);
    const max_tokens = pickFirstDefined(brain.max_tokens, brain.maxTokens, payload.max_tokens);
    const template_id = payload.template_id;
    if (!name || !username) return res.status(400).json({ success: false, error: "name and username required" });

    const ws = getWorkspaceId(req);
    client = await pool.connect();
    await client.query('BEGIN');
    const agentId = crypto.randomUUID();

    const wsPlan = await client.query(`SELECT plan FROM ${SCHEMA}.workspaces WHERE id = $1 LIMIT 1`, [ws]);
    const plan = String(wsPlan.rows[0]?.plan || 'free').toLowerCase();
    const typeStr = Array.isArray(type) ? type.join(',') : String(type || 'bot');
    if (plan === 'free' && typeStr.toLowerCase() !== 'coordinator') {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'Free plan allows only the Coordinator. Upgrade to Pro to add specialized agents.' });
    }

    let finalModel = model||null;
    let finalSystemPrompt = system_prompt || null;

    if (template_id) {
      const tmpl = await client.query(
        `SELECT model, system_prompt FROM ${SCHEMA}.marketplace_templates WHERE id = $1`,
        [template_id]
      );
      if (tmpl.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: "Template not found" });
      }
      finalModel = finalModel || tmpl.rows[0].model || null;
      finalSystemPrompt = tmpl.rows[0].system_prompt || finalSystemPrompt || MINIMAL_PROMPT(name);
    } else if (!finalSystemPrompt) {
      finalSystemPrompt = MINIMAL_PROMPT(name);
    }

    const accessPolicy = normalizeAccessPolicy(accessPolicyInput, { agentTypes: type });
    const provisioning = normalizeProvisioning(provisioningInput);
    const memoryPolicy = normalizeMemoryPolicy(memoryPolicyInput);
    const governance = normalizeGovernance(governanceInput);
    let capabilities = resolveRequestedCapabilities(payload, [], type);
    capabilities = reconcileSandboxCapability(capabilities, accessPolicy, type);
    const skillCount = countCountedSkills(capabilities);
    if (skillCount > MAX_SKILLS) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: `Maximum ${MAX_SKILLS} skills allowed (got ${skillCount})` });
    }
    const sandboxValidationError = validateSandboxConfiguration({
      agentTypes: type,
      capabilities,
      accessPolicy,
    });
    if (sandboxValidationError) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: sandboxValidationError });
    }
    const config = mergeAgentConfiguration({}, {
      accessPolicy,
      provisioning,
      memoryPolicy,
      governance,
    });

    // Auto-generate email if not provided
    let finalEmail = email || null;
    if (normalizePlainObject(provisioning.email).provisioned === false) {
      finalEmail = null;
    } else if (!finalEmail) {
      try {
        finalEmail = await generateAgentEmail(username, ws);
      } catch (emailErr) {
        console.warn("[AGENTS] Email auto-generation failed (non-fatal):", emailErr.message);
      }
    }

    if (finalEmail) {
      config.provisioning = {
        ...(config.provisioning || {}),
        email: {
          ...normalizePlainObject(config.provisioning?.email),
          address: finalEmail,
          provisioned: true,
        },
      };
    }

    const normalizedAvatar = normalizeStoredAvatar(pickFirstDefined(identity.avatar, payload.avatar), { username });

    const result = await client.query(
      `INSERT INTO ${SCHEMA}.agents (id, name, username, email, type, role, mbti, model, provider, description, system_prompt, temperature, max_tokens, avatar, workspace_id, capabilities, config)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb) RETURNING *`,
      [agentId, name, username, finalEmail, serializeType(type)||"bot", role||null, mbti||null, finalModel, provider||null,
       description||"", finalSystemPrompt, temperature||0.7, max_tokens||4096,
       normalizedAvatar || buildSpriteAvatar(username), ws, capabilities, JSON.stringify(config)]
    );

    // Register email route for inbound routing
    if (finalEmail) {
      try {
        await syncAgentEmailRoute(client, ws, agentId, finalEmail);
      } catch (routeErr) {
        console.warn("[AGENTS] Email route registration failed (non-fatal):", routeErr.message);
      }
    }

    await ensureAgentDriveProvisioned(client, ws, {
      id: agentId,
      name,
      username,
    }, {
      uploadedBy: req.userId || null,
    });

    await client.query('COMMIT');

    const createdAgent = result.rows[0];
    const drivePath = await resolveAgentDriveRoot(ws, createdAgent).catch(() => null);
    const integrations = await listAgentIntegrationProviders(ws, createdAgent.id, client).catch(() => []);
    res.json({
      success: true,
      agent: buildAgentResponse(createdAgent, { drivePath, integrations }),
    });
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
    }
    console.error("[AGENTS] Create error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client?.release?.();
  }
});

// PUT /api/v1/agents/:id — update agent
router.put("/:id", async (req, res) => {
  try {
    await ensureAgentConfigurationSchema(pool);
    const { id } = req.params;
    const {
      payload,
      identity,
      profile,
      brain,
      accessPolicyInput,
      provisioningInput,
      memoryPolicyInput,
      governanceInput,
    } = extractAgentPayload(req.body);
    const fields = { ...payload };
    const workspaceId = getWorkspaceId(req);
    const existing = await findAgentByRef(id, workspaceId, 'id,name,username,email,type,role,capabilities,config');
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: "Agent not found" });
    const ex = existing.rows[0];
    const isCoordinator = isCoordinatorAgent(ex);
    if (isCoordinator && (brain.system_prompt !== undefined || brain.systemPrompt !== undefined || fields.system_prompt !== undefined)) {
      return res.status(403).json({ success: false, error: 'Cannot modify system coordinator prompt' });
    }
    if (isCoordinator && (profile.types !== undefined || fields.type || profile.role !== undefined || fields.role || identity.username !== undefined || fields.username || fields.status === 'inactive')) {
      return res.status(403).json({ success: false, error: 'System Coordinator is protected' });
    }

    const nextType = pickFirstDefined(profile.types, fields.type, deserializeType(ex.type));
    const accessPolicy = normalizeAccessPolicy(accessPolicyInput, {
      agentTypes: nextType,
      capabilities: ex.capabilities,
    });
    const provisioning = normalizeProvisioning(provisioningInput);
    const memoryPolicy = normalizeMemoryPolicy(memoryPolicyInput);
    const governance = normalizeGovernance(governanceInput);

    const hasContractCapabilities = Array.isArray(payload.persistent_skills)
      || hasOwn(payload, 'capabilities')
      || hasOwn(payload, 'skills')
      || hasOwn(payload, 'tools');

    if (hasContractCapabilities) {
      fields.capabilities = resolveRequestedCapabilities(payload, ex.capabilities, nextType);
    }

    if (fields.capabilities !== undefined) {
      fields.capabilities = reconcileSandboxCapability(fields.capabilities, accessPolicy, nextType);
      const skillCount = countCountedSkills(fields.capabilities);
      if (skillCount > MAX_SKILLS) {
        return res.status(400).json({ success: false, error: `Maximum ${MAX_SKILLS} skills allowed (got ${skillCount})` });
      }
    }

    const mergedConfig = mergeAgentConfiguration(normalizeAgentConfig(ex.config), {
      accessPolicy,
      provisioning,
      memoryPolicy,
      governance,
    });
    if (fields.capabilities === undefined && Object.prototype.hasOwnProperty.call(mergedConfig, 'access_policy')) {
      fields.capabilities = reconcileSandboxCapability(ex.capabilities, mergedConfig.access_policy || {}, nextType);
    }
    const nextCapabilities = fields.capabilities !== undefined ? fields.capabilities : ex.capabilities;
    const sandboxValidationError = validateSandboxConfiguration({
      agentTypes: nextType,
      capabilities: nextCapabilities,
      accessPolicy: mergedConfig.access_policy || {},
    });
    if (sandboxValidationError) {
      return res.status(400).json({ success: false, error: sandboxValidationError });
    }

    fields.name = pickFirstDefined(identity.name, fields.name);
    fields.username = pickFirstDefined(identity.username, fields.username);
    fields.email = pickFirstDefined(
      fields.email,
      normalizePlainObject(provisioning.email).address,
      normalizePlainObject(provisioning.email).email
    );
    fields.type = pickFirstDefined(profile.types, fields.type);
    fields.role = pickFirstDefined(profile.role, fields.role);
    fields.mbti = pickFirstDefined(profile.mbti, fields.mbti);
    fields.description = pickFirstDefined(identity.description, fields.description);
    fields.avatar = pickFirstDefined(identity.avatar, fields.avatar);
    fields.model = pickFirstDefined(brain.model, fields.model);
    fields.provider = pickFirstDefined(brain.provider, fields.provider);
    fields.system_prompt = pickFirstDefined(brain.system_prompt, brain.systemPrompt, fields.system_prompt);
    fields.temperature = pickFirstDefined(brain.temperature, fields.temperature);
    fields.max_tokens = pickFirstDefined(brain.max_tokens, brain.maxTokens, fields.max_tokens);

    if (fields.avatar !== undefined) {
      fields.avatar = normalizeStoredAvatar(fields.avatar, {
        username: fields.username || ex.username || ex.name,
      });
    }

    const emailProvisioning = normalizePlainObject(provisioning.email);
    if (emailProvisioning.provisioned === true && !fields.email) {
      fields.email = emailProvisioning.address || ex.email || null;
    }
    if (emailProvisioning.provisioned === false) {
      fields.email = null;
      mergedConfig.provisioning = {
        ...(normalizePlainObject(mergedConfig.provisioning)),
        email: {
          ...normalizePlainObject(mergedConfig.provisioning?.email),
          provisioned: false,
        },
      };
    } else if (fields.email) {
      mergedConfig.provisioning = {
        ...(normalizePlainObject(mergedConfig.provisioning)),
        email: {
          ...normalizePlainObject(mergedConfig.provisioning?.email),
          address: fields.email,
          provisioned: true,
        },
      };
    }

    const allowed = ["name","username","email","status","type","role","mbti","model","provider","description","system_prompt","temperature","max_tokens","avatar","capabilities"];
    const sets = []; const vals = []; let idx = 1;
    for (const k of allowed) {
      if (fields[k] !== undefined) {
        if (k === 'capabilities') {
          sets.push(`${k} = $${idx}::jsonb`);
          vals.push(JSON.stringify(fields[k]));
        } else if (k === 'type') {
          sets.push(`${k} = $${idx}`);
          vals.push(serializeType(fields[k]));
        } else {
          sets.push(`${k} = $${idx}`);
          vals.push(fields[k]);
        }
        idx++;
      }
    }
    const hasConfigUpdates = Object.keys(accessPolicy).length > 0
      || Object.keys(provisioning).length > 0
      || Object.keys(memoryPolicy).length > 0
      || Object.keys(governance).length > 0;
    if (hasConfigUpdates) {
      sets.push(`config = $${idx}::jsonb`);
      vals.push(JSON.stringify(mergedConfig));
      idx++;
    }
    if (sets.length === 0) return res.status(400).json({ success: false, error: "No fields to update" });
    sets.push(`updated_at = NOW()`);
    vals.push(id);
    vals.push(workspaceId);
    const result = await pool.query(
      `UPDATE ${SCHEMA}.agents
          SET ${sets.join(", ")}
        WHERE (id::text = $${idx} OR username = $${idx})
          AND workspace_id = $${idx + 1}
      RETURNING *`,
      vals
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: "Agent not found" });
    const updatedAgent = result.rows[0];
    if (normalizePlainObject(provisioning.email).provisioned === false) {
      await clearAgentEmailRoutes(pool, workspaceId, updatedAgent.id);
    } else if (updatedAgent.email) {
      await syncAgentEmailRoute(pool, workspaceId, updatedAgent.id, updatedAgent.email).catch((routeErr) => {
        console.warn("[AGENTS] Email route sync failed (non-fatal):", routeErr.message);
      });
    }
    const drivePath = await resolveAgentDriveRoot(workspaceId, updatedAgent).catch(() => null);
    const integrations = await listAgentIntegrationProviders(workspaceId, updatedAgent.id).catch(() => []);
    res.json({ success: true, agent: buildAgentResponse(updatedAgent, { drivePath, integrations }) });
  } catch (err) {
    console.error("[AGENTS] Update error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/agents/:id/config — update agent runtime config and capabilities
router.put("/:id/config", async (req, res) => {
  try {
    await ensureAgentConfigurationSchema(pool);
    const { id } = req.params;
    const workspaceId = getWorkspaceId(req);
    const {
      payload,
      profile,
      accessPolicyInput,
      provisioningInput,
      memoryPolicyInput,
      governanceInput,
    } = extractAgentPayload(req.body);
    const existing = await findAgentByRef(
      id,
      workspaceId,
      'id, name, username, email, status, type, role, avatar, description, mbti, model, provider, system_prompt, temperature, max_tokens, capabilities, config, created_at, updated_at'
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Agent not found" });
    }

    const current = existing.rows[0];
    const isCoordinator = isCoordinatorAgent(current);
    const normalized = buildAgentConfigUpdate({
      body: payload,
      existing: current,
      isCoordinator,
    });
    const requestedIntegrations = Object.prototype.hasOwnProperty.call(payload, 'integrations')
      ? normalizeAgentIntegrationProviders(payload.integrations)
      : undefined;
    const nextType = pickFirstDefined(profile.types, payload.type, deserializeType(current.type));
    const accessPolicy = normalizeAccessPolicy(accessPolicyInput, {
      agentTypes: nextType,
      capabilities: normalized.capabilities,
    });
    const provisioning = normalizeProvisioning(provisioningInput);
    const memoryPolicy = normalizeMemoryPolicy(memoryPolicyInput);
    const governance = normalizeGovernance(governanceInput);
    const mergedConfig = mergeAgentConfiguration(normalizeAgentConfig(current.config), {
      accessPolicy,
      provisioning,
      memoryPolicy,
      governance,
    });
    const hasExplicitSocialProvisioning = hasOwn(normalizePlainObject(provisioningInput), 'social');
    const hasSocialProvisioningValue = Object.prototype.hasOwnProperty.call(normalizePlainObject(provisioning), 'social');
    if (hasExplicitSocialProvisioning && !hasSocialProvisioningValue) {
      const nextProvisioning = normalizePlainObject(mergedConfig.provisioning);
      delete nextProvisioning.social;
      if (Object.keys(nextProvisioning).length > 0) {
        mergedConfig.provisioning = nextProvisioning;
      } else {
        delete mergedConfig.provisioning;
      }
    }

    normalized.updates.type = pickFirstDefined(profile.types, normalized.updates.type);
    normalized.updates.capabilities = reconcileSandboxCapability(
      normalized.capabilities,
      mergedConfig.access_policy || {},
      nextType
    );
    normalized.capabilities = normalized.updates.capabilities;

    const hasConfigUpdates = Object.keys(accessPolicy).length > 0
      || Object.keys(provisioning).length > 0
      || Object.keys(memoryPolicy).length > 0
      || Object.keys(governance).length > 0
      || (hasExplicitSocialProvisioning && !hasSocialProvisioningValue);

    if (Object.keys(normalized.updates).length === 0 && requestedIntegrations === undefined && !hasConfigUpdates) {
      return res.status(400).json({ success: false, error: "No fields to update" });
    }

    const skillCount = countCountedSkills(normalized.capabilities);
    if (skillCount > MAX_SKILLS) {
      return res.status(400).json({ success: false, error: `Maximum ${MAX_SKILLS} skills allowed (got ${skillCount})` });
    }
    const sandboxValidationError = validateSandboxConfiguration({
      agentTypes: nextType,
      capabilities: normalized.capabilities,
      accessPolicy: mergedConfig.access_policy || {},
    });
    if (sandboxValidationError) {
      return res.status(400).json({ success: false, error: sandboxValidationError });
    }

    let row = current;
    if (Object.keys(normalized.updates).length > 0 || hasConfigUpdates) {
      const sets = [];
      const vals = [];
      let idx = 1;
      for (const [key, value] of Object.entries(normalized.updates)) {
        if (key === 'capabilities') {
          sets.push(`${key} = $${idx}::jsonb`);
          vals.push(JSON.stringify(value));
        } else if (key === 'type') {
          sets.push(`${key} = $${idx}`);
          vals.push(serializeType(value));
        } else {
          sets.push(`${key} = $${idx}`);
          vals.push(value);
        }
        idx++;
      }
      if (hasConfigUpdates) {
        sets.push(`config = $${idx}::jsonb`);
        vals.push(JSON.stringify(mergedConfig));
        idx++;
      }
      sets.push(`updated_at = NOW()`);
      vals.push(id);
      vals.push(workspaceId);

      const result = await pool.query(
        `UPDATE ${SCHEMA}.agents
            SET ${sets.join(", ")}
          WHERE (id::text = $${idx} OR username = $${idx})
            AND workspace_id = $${idx + 1}
          RETURNING *`,
        vals
      );
      if (result.rows.length === 0) return res.status(404).json({ success: false, error: "Agent not found" });
      row = result.rows[0];
    }

    if (requestedIntegrations !== undefined) {
      await replaceAgentIntegrationProviders(workspaceId, current.id, requestedIntegrations);
    }

    const emailProvisioning = normalizePlainObject(provisioning.email);
    if (emailProvisioning.provisioned === false) {
      await clearAgentEmailRoutes(pool, workspaceId, current.id);
    } else if (emailProvisioning.address) {
      await pool.query(
        `UPDATE ${SCHEMA}.agents
            SET email = $1,
                config = COALESCE(config, '{}'::jsonb) || $2::jsonb,
                updated_at = NOW()
          WHERE id = $3
            AND workspace_id = $4
          RETURNING *`,
        [
          emailProvisioning.address,
          JSON.stringify({
            provisioning: {
              email: {
                address: emailProvisioning.address,
                provisioned: true,
              },
            },
          }),
          current.id,
          workspaceId,
        ]
      ).then((emailResult) => {
        if (emailResult.rows[0]) row = emailResult.rows[0];
      });
      await syncAgentEmailRoute(pool, workspaceId, current.id, emailProvisioning.address).catch((routeErr) => {
        console.warn("[AGENTS] Email route sync failed (non-fatal):", routeErr.message);
      });
    }

    const capabilities = normalizeCapabilities(row.capabilities || normalized.capabilities || []);
    const integrations = requestedIntegrations !== undefined
      ? requestedIntegrations
      : await listAgentIntegrationProviders(workspaceId, current.id).catch(() => []);

    const agentPayload = buildAgentResponse(row, { integrations });
    const configPayload = buildConfigResponse(row, integrations);

    return res.json({
      success: true,
      agent: {
        ...agentPayload,
        capabilities,
      },
      config: configPayload,
      ignored: normalized.ignored,
    });
  } catch (err) {
    console.error("[AGENTS] Config update error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/agents/:id
router.delete("/:id", async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const existing = await findAgentByRef(req.params.id, workspaceId, 'id,name,username,type,role');
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: "Agent not found" });
    const ex = existing.rows[0];
    const isCoordinator = ex.type === 'coordinator' || String(ex.role||'').toLowerCase() === 'coordinator' || String(ex.username||'').toLowerCase().startsWith(COORDINATOR_NAME);
    if (isCoordinator) return res.status(403).json({ success: false, error: 'Cannot delete system coordinator' });

    const result = await pool.query(
      `DELETE FROM ${SCHEMA}.agents
        WHERE (id::text = $1 OR username = $1)
          AND workspace_id = $2
      RETURNING id, name`,
      [req.params.id, workspaceId]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: "Agent not found" });
    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/agents/:id/config — returns agent config (system_prompt, model, temperature, skills, tools)
router.get("/:id/config", async (req, res) => {
  try {
    await ensureAgentConfigurationSchema(pool);
    const result = await findAgentByRef(
      req.params.id,
      getWorkspaceId(req),
      'id, model, provider, temperature, max_tokens, system_prompt, capabilities, type, role, config'
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: "Agent not found" });
    const row = result.rows[0];
    const integrations = await listAgentIntegrationProviders(getWorkspaceId(req), row.id).catch(() => []);
    const cfg = buildConfigResponse(row, integrations);
    // Spread cfg at top level so frontend `...data` picks up fields directly
    res.json({ success: true, ...cfg, config: cfg });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch("/:id/access", async (req, res) => {
  try {
    await ensureAgentConfigurationSchema(pool);
    const workspaceId = getWorkspaceId(req);
    const existing = await findAgentByRef(req.params.id, workspaceId, 'id,type,capabilities,config');
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: "Agent not found" });

    const agent = existing.rows[0];
    const accessPolicy = normalizeAccessPolicy(req.body?.access_policy || req.body?.accessPolicy || {}, {
      agentTypes: deserializeType(agent.type),
      capabilities: agent.capabilities,
    });
    const mergedConfig = mergeAgentConfiguration(normalizeAgentConfig(agent.config), { accessPolicy });
    const nextCapabilities = reconcileSandboxCapability(agent.capabilities, mergedConfig.access_policy || {}, deserializeType(agent.type));
    const sandboxValidationError = validateSandboxConfiguration({
      agentTypes: deserializeType(agent.type),
      capabilities: nextCapabilities,
      accessPolicy: mergedConfig.access_policy || {},
    });
    if (sandboxValidationError) {
      return res.status(400).json({ success: false, error: sandboxValidationError });
    }

    const result = await pool.query(
      `UPDATE ${SCHEMA}.agents
          SET config = $1::jsonb,
              capabilities = $2::jsonb,
              updated_at = NOW()
        WHERE id = $3
          AND workspace_id = $4
      RETURNING *`,
      [JSON.stringify(mergedConfig), JSON.stringify(nextCapabilities), agent.id, workspaceId]
    );
    const row = result.rows[0];
    const matrix = await resolveAgentCapabilityMatrix({ workspaceId, agent: row, db: pool });
    res.json({
      success: true,
      access_policy: getAgentConfigSections(row).accessPolicy,
      data: matrix,
    });
  } catch (err) {
    console.error("[AGENTS] Access patch error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch("/:id/provisioning", async (req, res) => {
  try {
    await ensureAgentConfigurationSchema(pool);
    const workspaceId = getWorkspaceId(req);
    const existing = await findAgentByRef(req.params.id, workspaceId, 'id,email,type,capabilities,config');
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: "Agent not found" });

    const agent = existing.rows[0];
    const provisioning = normalizeProvisioning(req.body?.provisioning || {});
    const memoryPolicy = normalizeMemoryPolicy(req.body?.memory_policy || req.body?.memoryPolicy || {});
    const governance = normalizeGovernance(req.body?.governance || req.body?.governance_policy || {});
    const mergedConfig = mergeAgentConfiguration(normalizeAgentConfig(agent.config), {
      provisioning,
      memoryPolicy,
      governance,
    });

    const emailProvisioning = normalizePlainObject(provisioning.email);
    const nextEmail = emailProvisioning.provisioned === false
      ? null
      : (emailProvisioning.address || agent.email || null);

    if (nextEmail) {
      mergedConfig.provisioning = {
        ...(normalizePlainObject(mergedConfig.provisioning)),
        email: {
          ...normalizePlainObject(mergedConfig.provisioning?.email),
          address: nextEmail,
          provisioned: true,
        },
      };
    }

    const result = await pool.query(
      `UPDATE ${SCHEMA}.agents
          SET config = $1::jsonb,
              email = $2,
              updated_at = NOW()
        WHERE id = $3
          AND workspace_id = $4
      RETURNING *`,
      [JSON.stringify(mergedConfig), nextEmail, agent.id, workspaceId]
    );
    const row = result.rows[0];

    if (emailProvisioning.provisioned === false) {
      await clearAgentEmailRoutes(pool, workspaceId, row.id);
    } else if (nextEmail) {
      await syncAgentEmailRoute(pool, workspaceId, row.id, nextEmail).catch((routeErr) => {
        console.warn("[AGENTS] Email route sync failed (non-fatal):", routeErr.message);
      });
    }

    const matrix = await resolveAgentCapabilityMatrix({ workspaceId, agent: row, db: pool });
    res.json({
      success: true,
      provisioning: getAgentConfigSections(row).provisioning,
      memory_policy: getAgentConfigSections(row).memoryPolicy,
      governance: getAgentConfigSections(row).governance,
      data: matrix,
    });
  } catch (err) {
    console.error("[AGENTS] Provisioning patch error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/agents/:id/executions
router.get("/:id/executions", async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const agent = await findAgentByRef(req.params.id, workspaceId, 'id');
    if (agent.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Agent not found" });
    }
    const agentId = agent.rows[0].id;
    const result = await pool.query(
      `SELECT id, agent_id, input, output, model, provider, tokens_used, latency_ms, created_at
       FROM ${SCHEMA}.agent_executions
       WHERE agent_id::text = $1
       ORDER BY created_at DESC LIMIT 50`,
      [agentId]
    );
    res.json({ success: true, executions: result.rows });
  } catch (err) {
    // Table may not exist yet
    if (err.code === '42P01') return res.json({ success: true, executions: [] });
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/agents/:id/llm-config
router.get("/:id/llm-config", async (req, res) => {
  try {
    const result = await findAgentByRef(
      req.params.id,
      getWorkspaceId(req),
      'model, provider, temperature, max_tokens, system_prompt, type, role'
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: "Agent not found" });
    const row = result.rows[0];
    const isCoordinator = row.type === 'coordinator' || String(row.role||'').toLowerCase() === 'coordinator';
    res.json({ success: true, config: {
      model: row.model,
      provider: row.provider,
      temperature: row.temperature,
      max_tokens: row.max_tokens,
      system_prompt: isCoordinator ? null : row.system_prompt,
      locked_prompt: isCoordinator
    }});
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/agents/:id/llm-config
router.put("/:id/llm-config", async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { model, provider, temperature, max_tokens, system_prompt } = req.body;
    const existing = await findAgentByRef(req.params.id, workspaceId, 'id,username,type,role');
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: "Agent not found" });
    const ex = existing.rows[0];
    const isCoordinator = ex.type === 'coordinator' || String(ex.role||'').toLowerCase() === 'coordinator' || String(ex.username||'').toLowerCase().startsWith(COORDINATOR_NAME);
    if (isCoordinator && system_prompt !== undefined) {
      return res.status(403).json({ success: false, error: 'Cannot modify system coordinator prompt' });
    }

    const result = await pool.query(
      `UPDATE ${SCHEMA}.agents SET model=$1, provider=$2, temperature=$3, max_tokens=$4, system_prompt=COALESCE($5, system_prompt), updated_at=NOW()
       WHERE (id::text = $6 OR username = $6)
         AND workspace_id = $7
       RETURNING model, provider, temperature, max_tokens, system_prompt`,
      [model, provider, temperature||0.7, max_tokens||4096, isCoordinator ? null : (system_prompt||null), req.params.id, workspaceId]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: "Agent not found" });
    res.json({ success: true, config: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
