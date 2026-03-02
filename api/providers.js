/**
 * Providers API — PostgreSQL (Vaultbrix)
 * LLM provider management
 */
const express = require("express");
const pool = require("../lib/vaultbrix");
const router = express.Router();
const SCHEMA = "tenant_vutler";

// GET /api/v1/providers — list all providers
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.llm_providers WHERE workspace_id = $1 ORDER BY provider_name`,
      [req.workspaceId || "00000000-0000-0000-0000-000000000001"]
    );
    
    const providers = result.rows.map(p => ({
      id: p.id,
      provider_name: p.provider_name,
      display_name: p.display_name || p.provider_name,
      api_key_encrypted: p.api_key_encrypted ? p.api_key_encrypted.slice(0, 8) + '...' : null,
      is_active: p.is_active !== false,
      supported_models: p.supported_models || [],
      default_model: p.default_model,
      config: p.config || {},
      created_at: p.created_at,
      updated_at: p.updated_at
    }));
    
    res.json({ success: true, providers });
  } catch (err) {
    console.error("[PROVIDERS] List error:", err.message);
    // Return empty providers array instead of error for now
    res.json({ success: true, providers: [] });
  }
});

// GET /api/v1/providers/:id — single provider
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.llm_providers WHERE id::text = $1 AND workspace_id = $2 LIMIT 1`,
      [id, req.workspaceId || "00000000-0000-0000-0000-000000000001"]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Provider not found" });
    }
    
    const p = result.rows[0];
    res.json({
      success: true,
      provider: {
        id: p.id,
        provider_name: p.provider_name,
        display_name: p.display_name,
        is_active: p.is_active !== false,
        supported_models: p.supported_models || [],
        default_model: p.default_model,
        config: p.config || {}
      }
    });
  } catch (err) {
    console.error("[PROVIDERS] Get error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/providers/:id — update provider
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active, api_key, default_model } = req.body;
    
    const updates = [];
    const values = [];
    let idx = 1;
    
    if (is_active !== undefined) {
      updates.push(`is_active = $${idx++}`);
      values.push(is_active);
    }
    
    if (default_model) {
      updates.push(`default_model = $${idx++}`);
      values.push(default_model);
    }
    
    if (api_key) {
      updates.push(`api_key_encrypted = $${idx++}`);
      values.push(api_key); // In production, encrypt this
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: "No fields to update" });
    }
    
    values.push(id);
    values.push(req.workspaceId || "00000000-0000-0000-0000-000000000001");
    
    const result = await pool.query(
      `UPDATE ${SCHEMA}.llm_providers SET ${updates.join(', ')}, updated_at = NOW() 
       WHERE id::text = $${idx++} AND workspace_id = $${idx} RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Provider not found" });
    }
    
    res.json({ success: true, provider: result.rows[0] });
  } catch (err) {
    console.error("[PROVIDERS] Update error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
