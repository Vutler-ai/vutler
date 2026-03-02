/**
 * Agents API — PostgreSQL (Vaultbrix)
 * Migrated from MongoDB/Rocket.Chat
 */
const express = require("express");
const pool = require("../lib/vaultbrix");
const { authenticateAgent } = require("./middleware/auth");
const router = express.Router();
const SCHEMA = "tenant_vutler";

// GET /api/v1/agents — list all agents
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.agents WHERE workspace_id = $1 ORDER BY name`,
      [req.workspaceId || "00000000-0000-0000-0000-000000000001"]
    );
    const agents = result.rows.map(a => ({
      id: a.id,
      name: a.name,
      username: a.username,
      email: a.email,
      status: a.status || "online",
      type: a.type || "bot",
      avatar: a.avatar || `/sprites/agent-${a.username}.png`,
      description: a.description || "",
      role: a.role,
      mbti: a.mbti,
      model: a.model,
      provider: a.provider,
      system_prompt: a.system_prompt,
      temperature: a.temperature,
      max_tokens: a.max_tokens,
      capabilities: a.capabilities || [],
      createdAt: a.created_at,
      updatedAt: a.updated_at
    }));
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
      [id, req.workspaceId || "00000000-0000-0000-0000-000000000001"]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Agent not found", id });
    }
    const a = result.rows[0];
    res.json({
      success: true,
      agent: {
        id: a.id, name: a.name, username: a.username, email: a.email,
        status: a.status, type: a.type,
        avatar: a.avatar || `/sprites/agent-${a.username}.png`,
        description: a.description || "", role: a.role, mbti: a.mbti,
        model: a.model, provider: a.provider, system_prompt: a.system_prompt,
        temperature: a.temperature, max_tokens: a.max_tokens,
        capabilities: a.capabilities || [],
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
    const { name, username, email, type, role, mbti, model, provider, description, system_prompt, temperature, max_tokens } = req.body;
    if (!name || !username) return res.status(400).json({ success: false, error: "name and username required" });
    const result = await pool.query(
      `INSERT INTO ${SCHEMA}.agents (name, username, email, type, role, mbti, model, provider, description, system_prompt, temperature, max_tokens, avatar, workspace_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [name, username, email||null, type||"bot", role||null, mbti||null, model||null, provider||null,
       description||"", system_prompt||null, temperature||0.7, max_tokens||4096,
       `/sprites/agent-${username}.png`, req.workspaceId||"00000000-0000-0000-0000-000000000001"]
    );
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
    const allowed = ["name","username","email","status","type","role","mbti","model","provider","description","system_prompt","temperature","max_tokens","avatar","capabilities"];
    const sets = []; const vals = []; let idx = 1;
    for (const k of allowed) {
      if (fields[k] !== undefined) { sets.push(`${k} = $${idx}`); vals.push(fields[k]); idx++; }
    }
    if (sets.length === 0) return res.status(400).json({ success: false, error: "No fields to update" });
    sets.push(`updated_at = NOW()`);
    vals.push(id);
    const result = await pool.query(
      `UPDATE ${SCHEMA}.agents SET ${sets.join(", ")} WHERE (id::text = $${idx} OR username = $${idx}) RETURNING *`,
      vals
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: "Agent not found" });
    res.json({ success: true, agent: result.rows[0] });
  } catch (err) {
    console.error("[AGENTS] Update error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/agents/:id
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM ${SCHEMA}.agents WHERE (id::text = $1 OR username = $1) RETURNING id, name`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: "Agent not found" });
    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/agents/:id/llm-config
router.get("/:id/llm-config", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT model, provider, temperature, max_tokens, system_prompt FROM ${SCHEMA}.agents WHERE (id::text = $1 OR username = $1) LIMIT 1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: "Agent not found" });
    res.json({ success: true, config: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/agents/:id/llm-config
router.put("/:id/llm-config", async (req, res) => {
  try {
    const { model, provider, temperature, max_tokens, system_prompt } = req.body;
    const result = await pool.query(
      `UPDATE ${SCHEMA}.agents SET model=$1, provider=$2, temperature=$3, max_tokens=$4, system_prompt=$5, updated_at=NOW()
       WHERE (id::text = $6 OR username = $6) RETURNING model, provider, temperature, max_tokens, system_prompt`,
      [model, provider, temperature||0.7, max_tokens||4096, system_prompt||null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: "Agent not found" });
    res.json({ success: true, config: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/agents/:username/status — update agent status (for real-time sync in Pixel Office)
router.put("/:username/status", async (req, res) => {
  try {
    const { username } = req.params;
    const { status } = req.body;
    
    // Validate status values
    const validStatuses = ["busy", "online", "offline"];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` 
      });
    }

    const result = await pool.query(
      `UPDATE ${SCHEMA}.agents SET status = $1, updated_at = NOW() WHERE username = $2 AND workspace_id = $3 RETURNING id, username, status`,
      [status, username, req.workspaceId || "00000000-0000-0000-0000-000000000001"]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: "Agent not found", 
        username 
      });
    }

    console.log(`[AGENTS] Status updated: ${username} -> ${status}`);
    res.json({ 
      success: true, 
      agent: result.rows[0],
      message: `Agent status updated to ${status}` 
    });
  } catch (err) {
    console.error("[AGENTS] Status update error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
