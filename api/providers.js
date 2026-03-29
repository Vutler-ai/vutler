// Providers API (fixed to match actual DB schema)
const express = require('express');
const pool = require("../lib/vaultbrix");
const { CryptoService } = require('../services/crypto');
const cryptoSvc = new CryptoService();
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM tenant_vutler.workspace_llm_providers WHERE workspace_id = $1 ORDER BY created_at DESC',
      [req.workspaceId]
    );
    const masked = result.rows.map(p => ({
      ...p,
      api_key_encrypted: p.api_key_encrypted ? '••••••••' : null,
    }));
    res.json({ success: true, providers: masked, count: masked.length });
  } catch (error) {
    console.error('[PROVIDERS] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch providers', error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM tenant_vutler.workspace_llm_providers WHERE id = $1 AND workspace_id = $2',
      [req.params.id, req.workspaceId]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Provider not found' });
    // SECURITY: never return raw API key (audit 2026-03-29)
    const provider = { ...result.rows[0], api_key_encrypted: result.rows[0].api_key_encrypted ? '••••••••' : null };
    res.json({ success: true, provider });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, provider, provider_type, type, api_key, base_url, api_url, is_active = true } = req.body;
    const providerVal = provider || provider_type || type || 'openai';
    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });
    // SECURITY: encrypt API key before storing (audit 2026-03-29)
    const encryptedKey = api_key ? cryptoSvc.encrypt(api_key) : '';
    const result = await pool.query(
      'INSERT INTO tenant_vutler.workspace_llm_providers (name, provider, api_key_encrypted, base_url, is_active, workspace_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING *',
      [name, providerVal, encryptedKey, base_url || api_url || null, is_active, req.workspaceId]
    );
    const created = { ...result.rows[0], api_key_encrypted: '••••••••' };
    res.status(201).json({ success: true, message: 'Provider created', provider: created });
  } catch (error) {
    console.error('[PROVIDERS] Error creating:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, provider, api_key, base_url, is_active } = req.body;
    const updates = []; const params = []; let pc = 1;
    if (name !== undefined) { updates.push('name = $' + pc); params.push(name); pc++; }
    if (provider !== undefined) { updates.push('provider = $' + pc); params.push(provider); pc++; }
    if (api_key !== undefined) { updates.push('api_key_encrypted = $' + pc); params.push(api_key ? cryptoSvc.encrypt(api_key) : ''); pc++; }
    if (base_url !== undefined) { updates.push('base_url = $' + pc); params.push(base_url); pc++; }
    if (is_active !== undefined) { updates.push('is_active = $' + pc); params.push(is_active); pc++; }
    if (!updates.length) return res.status(400).json({ success: false, message: 'No fields to update' });
    updates.push('updated_at = NOW()');
    params.push(req.params.id, req.workspaceId);
    const result = await pool.query('UPDATE tenant_vutler.workspace_llm_providers SET ' + updates.join(', ') + ' WHERE id = $' + pc + ' AND workspace_id = $' + (pc+1) + ' RETURNING *', params);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, provider: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM tenant_vutler.workspace_llm_providers WHERE id = $1 AND workspace_id = $2 RETURNING *', [req.params.id, req.workspaceId]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
