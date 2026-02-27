// Providers API (Sprint 8.1: workspace_id)
const express = require('express');
const pool = require("../lib/vaultbrix");
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM workspace_llm_providers WHERE workspace_id = $1 ORDER BY created_at DESC',
      [req.workspaceId]
    );
    res.json({ success: true, providers: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('[PROVIDERS] Error fetching providers:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch providers', error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM workspace_llm_providers WHERE id = $1 AND workspace_id = $2',
      [req.params.id, req.workspaceId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Provider not found' });
    }
    res.json({ success: true, provider: result.rows[0] });
  } catch (error) {
    console.error('[PROVIDERS] Error fetching provider:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch provider', error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, provider_type, api_key, api_url, model, config, is_active = true } = req.body;
    if (!name || !provider_type) {
      return res.status(400).json({ success: false, message: 'Name and provider_type are required' });
    }

    const result = await pool.query(
      `INSERT INTO workspace_llm_providers 
       (name, provider_type, api_key, api_url, model, config, is_active, workspace_id, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()) 
       RETURNING *`,
      [name, provider_type, api_key, api_url, model, config, is_active, req.workspaceId]
    );
    res.status(201).json({ success: true, message: 'Provider created successfully', provider: result.rows[0] });
  } catch (error) {
    console.error('[PROVIDERS] Error creating provider:', error);
    res.status(500).json({ success: false, message: 'Failed to create provider', error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, provider_type, api_key, api_url, model, config, is_active } = req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) { updates.push(`name = $${paramCount++}`); values.push(name); }
    if (provider_type !== undefined) { updates.push(`provider_type = $${paramCount++}`); values.push(provider_type); }
    if (api_key !== undefined) { updates.push(`api_key = $${paramCount++}`); values.push(api_key); }
    if (api_url !== undefined) { updates.push(`api_url = $${paramCount++}`); values.push(api_url); }
    if (model !== undefined) { updates.push(`model = $${paramCount++}`); values.push(model); }
    if (config !== undefined) { updates.push(`config = $${paramCount++}`); values.push(config); }
    if (is_active !== undefined) { updates.push(`is_active = $${paramCount++}`); values.push(is_active); }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id, req.workspaceId);

    const query = `
      UPDATE workspace_llm_providers SET ${updates.join(', ')}
      WHERE id = $${paramCount} AND workspace_id = $${paramCount + 1}
      RETURNING *`;

    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Provider not found' });
    }
    res.json({ success: true, message: 'Provider updated successfully', provider: result.rows[0] });
  } catch (error) {
    console.error('[PROVIDERS] Error updating provider:', error);
    res.status(500).json({ success: false, message: 'Failed to update provider', error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM workspace_llm_providers WHERE id = $1 AND workspace_id = $2 RETURNING *',
      [req.params.id, req.workspaceId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Provider not found' });
    }
    res.json({ success: true, message: 'Provider deleted successfully', provider: result.rows[0] });
  } catch (error) {
    console.error('[PROVIDERS] Error deleting provider:', error);
    res.status(500).json({ success: false, message: 'Failed to delete provider', error: error.message });
  }
});

module.exports = router;
