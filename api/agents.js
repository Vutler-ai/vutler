/**
 * Agents API — PostgreSQL (Vaultbrix)
 * Migrated from MongoDB/Rocket.Chat
 */
const express = require("express");
const pool = require("../lib/vaultbrix");
const { normalizeStoredAvatar, buildSpriteAvatar } = require("../lib/avatarPath");
const {
  normalizeCapabilities,
  splitCapabilities,
  buildAgentConfigUpdate,
  countCountedSkills,
} = require("../services/agentConfigPolicy");
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


// GET /api/v1/agents — list all agents
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.agents WHERE workspace_id = $1 ORDER BY name`,
      [getWorkspaceId(req)]
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
    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.agents WHERE (id::text = $1 OR username = $1) AND workspace_id = $2 LIMIT 1`,
      [id, getWorkspaceId(req)]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Agent not found", id });
    }
    const a = result.rows[0];
    const capabilities = normalizeCapabilities(a.capabilities || []);
    const { skills, tools } = splitCapabilities(capabilities);
    res.json({
      success: true,
      agent: {
        id: a.id, name: a.name, username: a.username, email: a.email,
        status: a.status, type: deserializeType(a.type),
        avatar: a.avatar || null,
        description: a.description || "", role: a.role, mbti: a.mbti,
        model: a.model, provider: a.provider, platform: a.platform || a.role || null,
        system_prompt: ((a.type === 'coordinator' || String(a.role||'').toLowerCase()==='coordinator') ? null : a.system_prompt),
        temperature: a.temperature, max_tokens: a.max_tokens,
        capabilities,
        skills,
        tools,
        badge: ((a.type === 'coordinator' || String(a.role||'').toLowerCase()==='coordinator') ? 'system-coordinator' : null),
        systemAgent: (a.type === 'coordinator' || String(a.role||'').toLowerCase()==='coordinator'),
        createdAt: a.created_at, updatedAt: a.updated_at
      }
    });
  } catch (err) {
    console.error("[AGENTS] Get error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/agents — create agent
router.post("/", async (req, res) => {
  try {
    const { name, username, email, type, role, mbti, model, provider, description, system_prompt, temperature, max_tokens, template_id } = req.body;
    if (!name || !username) return res.status(400).json({ success: false, error: "name and username required" });

    const ws = getWorkspaceId(req);

    const wsPlan = await pool.query(`SELECT plan FROM ${SCHEMA}.workspaces WHERE id = $1 LIMIT 1`, [ws]);
    const plan = String(wsPlan.rows[0]?.plan || 'free').toLowerCase();
    const typeStr = Array.isArray(type) ? type.join(',') : String(type || 'bot');
    if (plan === 'free' && typeStr.toLowerCase() !== 'coordinator') {
      return res.status(403).json({ success: false, error: 'Free plan allows only the Coordinator. Upgrade to Pro to add specialized agents.' });
    }

    let finalModel = model||null;
    let finalSystemPrompt = system_prompt || null;

    if (template_id) {
      const tmpl = await pool.query(
        `SELECT model, system_prompt FROM ${SCHEMA}.marketplace_templates WHERE id = $1`,
        [template_id]
      );
      if (tmpl.rows.length === 0) return res.status(404).json({ success: false, error: "Template not found" });
      finalModel = finalModel || tmpl.rows[0].model || null;
      finalSystemPrompt = tmpl.rows[0].system_prompt || finalSystemPrompt || MINIMAL_PROMPT(name);
    } else if (!finalSystemPrompt) {
      finalSystemPrompt = MINIMAL_PROMPT(name);
    }

    // Enforce skill limit
    const capabilities = normalizeCapabilities(req.body.capabilities || []);
    const skillCount = countCountedSkills(capabilities);
    if (skillCount > MAX_SKILLS) {
      return res.status(400).json({ success: false, error: `Maximum ${MAX_SKILLS} skills allowed (got ${skillCount})` });
    }

    // Auto-generate email if not provided
    let finalEmail = email || null;
    if (!finalEmail) {
      try {
      finalEmail = await generateAgentEmail(username, ws);
      } catch (emailErr) {
        console.warn("[AGENTS] Email auto-generation failed (non-fatal):", emailErr.message);
      }
    }

    const normalizedAvatar = normalizeStoredAvatar(req.body.avatar, { username });

    const result = await pool.query(
      `INSERT INTO ${SCHEMA}.agents (name, username, email, type, role, mbti, model, provider, description, system_prompt, temperature, max_tokens, avatar, workspace_id, capabilities)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [name, username, finalEmail, serializeType(type)||"bot", role||null, mbti||null, finalModel, provider||null,
       description||"", finalSystemPrompt, temperature||0.7, max_tokens||4096,
       normalizedAvatar || buildSpriteAvatar(username), ws, capabilities]
    );

    // Register email route for inbound routing
    if (finalEmail) {
      try {
        const agentId = result.rows[0].id;
        await pool.query(
          `INSERT INTO ${SCHEMA}.email_routes (workspace_id, email_address, agent_id, auto_reply, approval_required)
           VALUES ($1, $2, $3, true, true)
           ON CONFLICT (email_address) DO NOTHING`,
          [ws, finalEmail, agentId]
        );
      } catch (routeErr) {
        console.warn("[AGENTS] Email route registration failed (non-fatal):", routeErr.message);
      }
    }

    res.json({ success: true, agent: result.rows[0] });
  } catch (err) {
    console.error("[AGENTS] Create error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/agents/:id — update agent
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    const workspaceId = getWorkspaceId(req);
    const existing = await findAgentByRef(id, workspaceId, 'id,name,username,type,role,capabilities');
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: "Agent not found" });
    const ex = existing.rows[0];
    const isCoordinator = ex.type === 'coordinator' || String(ex.role||'').toLowerCase() === 'coordinator' || String(ex.username||'').toLowerCase().startsWith(COORDINATOR_NAME);
    if (isCoordinator && fields.system_prompt !== undefined) {
      return res.status(403).json({ success: false, error: 'Cannot modify system coordinator prompt' });
    }
    if (isCoordinator && (fields.type || fields.role || fields.username || fields.status === 'inactive')) {
      return res.status(403).json({ success: false, error: 'System Coordinator is protected' });
    }

    if (fields.capabilities !== undefined) {
      const normalizedCapabilities = normalizeCapabilities(fields.capabilities);
      const skillCount = countCountedSkills(normalizedCapabilities);
      if (skillCount > MAX_SKILLS) {
        return res.status(400).json({ success: false, error: `Maximum ${MAX_SKILLS} skills allowed (got ${skillCount})` });
      }
      fields.capabilities = normalizedCapabilities;
    }

    if (fields.avatar !== undefined) {
      fields.avatar = normalizeStoredAvatar(fields.avatar, {
        username: fields.username || ex.username || ex.name,
      });
    }

    const allowed = ["name","username","email","status","type","role","mbti","model","provider","description","system_prompt","temperature","max_tokens","avatar","capabilities"];
    const sets = []; const vals = []; let idx = 1;
    for (const k of allowed) {
      if (fields[k] !== undefined) { sets.push(`${k} = $${idx}`); vals.push(fields[k]); idx++; }
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
    res.json({ success: true, agent: result.rows[0] });
  } catch (err) {
    console.error("[AGENTS] Update error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/agents/:id/config — update agent runtime config and capabilities
router.put("/:id/config", async (req, res) => {
  try {
    const { id } = req.params;
    const workspaceId = getWorkspaceId(req);
    const existing = await findAgentByRef(
      id,
      workspaceId,
      'id, name, username, type, role, system_prompt, capabilities'
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Agent not found" });
    }

    const current = existing.rows[0];
    const isCoordinator = current.type === 'coordinator' || String(current.role || '').toLowerCase() === 'coordinator' || String(current.username || '').toLowerCase().startsWith(COORDINATOR_NAME);
    const normalized = buildAgentConfigUpdate({
      body: req.body || {},
      existing: current,
      isCoordinator,
    });

    if (Object.keys(normalized.updates).length === 0) {
      return res.status(400).json({ success: false, error: "No fields to update" });
    }

    const skillCount = countCountedSkills(normalized.capabilities);
    if (skillCount > MAX_SKILLS) {
      return res.status(400).json({ success: false, error: `Maximum ${MAX_SKILLS} skills allowed (got ${skillCount})` });
    }

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

    const row = result.rows[0];
    const capabilities = normalizeCapabilities(row.capabilities || normalized.capabilities || []);
    const { skills, tools } = splitCapabilities(capabilities);

    return res.json({
      success: true,
      agent: {
        id: row.id,
        name: row.name,
        username: row.username,
        email: row.email,
        status: row.status,
        type: deserializeType(row.type),
        avatar: row.avatar || null,
        description: row.description || "",
        role: row.role,
        mbti: row.mbti,
        model: row.model,
        provider: row.provider,
        system_prompt: isCoordinator ? null : row.system_prompt,
        temperature: row.temperature,
        max_tokens: row.max_tokens,
        capabilities,
        skills,
        tools,
        badge: isCoordinator ? 'system-coordinator' : null,
        systemAgent: isCoordinator,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
      config: {
        model: row.model,
        provider: row.provider,
        temperature: row.temperature,
        max_tokens: row.max_tokens,
        system_prompt: isCoordinator ? null : row.system_prompt,
        skills,
        tools,
        capabilities,
        type: deserializeType(row.type),
        locked_prompt: isCoordinator,
      },
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
    const result = await findAgentByRef(
      req.params.id,
      getWorkspaceId(req),
      'model, provider, temperature, max_tokens, system_prompt, capabilities, type, role'
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: "Agent not found" });
    const row = result.rows[0];
    const isCoordinator = row.type === 'coordinator' || String(row.role||'').toLowerCase() === 'coordinator';
    const capabilities = normalizeCapabilities(row.capabilities || []);
    const { skills, tools } = splitCapabilities(capabilities);
    const cfg = {
      model: row.model,
      provider: row.provider,
      temperature: row.temperature,
      max_tokens: row.max_tokens,
      system_prompt: isCoordinator ? null : row.system_prompt,
      skills,
      tools,
      capabilities,
      type: deserializeType(row.type),
      locked_prompt: isCoordinator
    };
    // Spread cfg at top level so frontend `...data` picks up fields directly
    res.json({ success: true, ...cfg, config: cfg });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/agents/:id/config — updates agent config
router.put("/:id/config", async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { model, provider, temperature, max_tokens, system_prompt, skills, tools, type } = req.body;
    const existing = await findAgentByRef(req.params.id, workspaceId, 'id,username,type,role');
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: "Agent not found" });
    const ex = existing.rows[0];
    const isCoordinator = ex.type === 'coordinator' || String(ex.role||'').toLowerCase() === 'coordinator' || String(ex.username||'').toLowerCase().startsWith(COORDINATOR_NAME);
    if (isCoordinator && system_prompt !== undefined) {
      return res.status(403).json({ success: false, error: 'Cannot modify system coordinator prompt' });
    }
    const capabilities = (skills || tools)
      ? normalizeCapabilities([...(skills || []), ...(tools || [])])
      : undefined;
    // Enforce skill limit
    if (capabilities) {
      const skillCount = countCountedSkills(capabilities);
      if (skillCount > MAX_SKILLS) {
        return res.status(400).json({ success: false, error: `Maximum ${MAX_SKILLS} skills allowed (got ${skillCount})` });
      }
    }
    const result = await pool.query(
      `UPDATE ${SCHEMA}.agents SET
        model=COALESCE($1,model),
        provider=COALESCE($2,provider),
        temperature=COALESCE($3,temperature),
        max_tokens=COALESCE($4,max_tokens),
        system_prompt=CASE WHEN $5::text IS NULL THEN system_prompt ELSE $5 END,
        capabilities=COALESCE($6::text[],capabilities),
        type=COALESCE($8,type),
        updated_at=NOW()
       WHERE (id::text = $7 OR username = $7)
         AND workspace_id = $9
       RETURNING model, provider, temperature, max_tokens, system_prompt, capabilities, type`,
      [model||null, provider||null, temperature||null, max_tokens||null, isCoordinator ? null : (system_prompt||null), capabilities || null, req.params.id, serializeType(type), workspaceId]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: "Agent not found" });
    const row = result.rows[0];
    const nextCapabilities = normalizeCapabilities(row.capabilities || []);
    const split = splitCapabilities(nextCapabilities);
    res.json({ success: true, config: { ...row, capabilities: nextCapabilities, skills: split.skills, tools: split.tools, type: deserializeType(row.type) } });
  } catch (err) {
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
