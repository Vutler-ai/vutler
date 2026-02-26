const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.PG_HOST || 'vutler-postgres',
  port: process.env.PG_PORT || 5432,
  user: 'vaultbrix',
  password: 'vaultbrix',
  database: 'vaultbrix',
});

/**
 * GET /api/v1/providers
 * Get all configured LLM providers
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM workspace_llm_providers ORDER BY created_at DESC'
    );

    res.json({
      success: true,
      providers: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('[PROVIDERS] Error fetching providers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch providers',
      error: error.message,
    });
  }
});

/**
 * GET /api/v1/providers/:id
 * Get a specific provider by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM workspace_llm_providers WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found',
      });
    }

    res.json({
      success: true,
      provider: result.rows[0],
    });
  } catch (error) {
    console.error('[PROVIDERS] Error fetching provider:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch provider',
      error: error.message,
    });
  }
});

/**
 * POST /api/v1/providers
 * Create a new LLM provider
 */
router.post('/', async (req, res) => {
  try {
    const {
      name,
      provider_type,
      api_key,
      api_url,
      model,
      config,
      is_active = true,
    } = req.body;

    // Validate required fields
    if (!name || !provider_type) {
      return res.status(400).json({
        success: false,
        message: 'Name and provider_type are required',
      });
    }

    const result = await pool.query(
      `INSERT INTO workspace_llm_providers 
       (name, provider_type, api_key, api_url, model, config, is_active, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) 
       RETURNING *`,
      [name, provider_type, api_key, api_url, model, config, is_active]
    );

    res.status(201).json({
      success: true,
      message: 'Provider created successfully',
      provider: result.rows[0],
    });
  } catch (error) {
    console.error('[PROVIDERS] Error creating provider:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create provider',
      error: error.message,
    });
  }
});

/**
 * PUT /api/v1/providers/:id
 * Update an existing provider
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      provider_type,
      api_key,
      api_url,
      model,
      config,
      is_active,
    } = req.body;

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (provider_type !== undefined) {
      updates.push(`provider_type = $${paramCount++}`);
      values.push(provider_type);
    }
    if (api_key !== undefined) {
      updates.push(`api_key = $${paramCount++}`);
      values.push(api_key);
    }
    if (api_url !== undefined) {
      updates.push(`api_url = $${paramCount++}`);
      values.push(api_url);
    }
    if (model !== undefined) {
      updates.push(`model = $${paramCount++}`);
      values.push(model);
    }
    if (config !== undefined) {
      updates.push(`config = $${paramCount++}`);
      values.push(config);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update',
      });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE workspace_llm_providers 
      SET ${updates.join(', ')} 
      WHERE id = $${paramCount} 
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found',
      });
    }

    res.json({
      success: true,
      message: 'Provider updated successfully',
      provider: result.rows[0],
    });
  } catch (error) {
    console.error('[PROVIDERS] Error updating provider:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update provider',
      error: error.message,
    });
  }
});

/**
 * DELETE /api/v1/providers/:id
 * Delete a provider
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM workspace_llm_providers WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found',
      });
    }

    res.json({
      success: true,
      message: 'Provider deleted successfully',
      provider: result.rows[0],
    });
  } catch (error) {
    console.error('[PROVIDERS] Error deleting provider:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete provider',
      error: error.message,
    });
  }
});

module.exports = router;
