// Settings API (Sprint 8.1: workspace_id)
const express = require('express');
const pool = require("../lib/vaultbrix");
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM workspace_settings WHERE workspace_id = $1 ORDER BY key ASC',
      [req.workspaceId]
    );
    const settings = {};
    result.rows.forEach(row => {
      settings[row.key] = { value: row.value, type: row.type, description: row.description, updated_at: row.updated_at };
    });
    res.json({ success: true, settings, count: result.rows.length });
  } catch (error) {
    console.error('[SETTINGS] Error fetching settings:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch settings', error: error.message });
  }
});

router.get('/:key', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM workspace_settings WHERE key = $1 AND workspace_id = $2',
      [req.params.key, req.workspaceId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Setting not found' });
    }
    res.json({ success: true, setting: result.rows[0] });
  } catch (error) {
    console.error('[SETTINGS] Error fetching setting:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch setting', error: error.message });
  }
});

router.put('/', async (req, res) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, message: 'Settings object is required' });
    }

    const client = await pool.connect();
    const updatedSettings = [];
    try {
      await client.query('BEGIN');
      for (const [key, data] of Object.entries(settings)) {
        const { value, type, description } = data;
        const result = await client.query(
          `INSERT INTO workspace_settings (key, value, type, description, workspace_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
           ON CONFLICT (key, workspace_id) 
           DO UPDATE SET 
             value = EXCLUDED.value,
             type = COALESCE(EXCLUDED.type, workspace_settings.type),
             description = COALESCE(EXCLUDED.description, workspace_settings.description),
             updated_at = NOW()
           RETURNING *`,
          [key, value, type, description, req.workspaceId]
        );
        updatedSettings.push(result.rows[0]);
      }
      await client.query('COMMIT');
      res.json({ success: true, message: 'Settings updated successfully', settings: updatedSettings, count: updatedSettings.length });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[SETTINGS] Error updating settings:', error);
    res.status(500).json({ success: false, message: 'Failed to update settings', error: error.message });
  }
});

router.put('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value, type, description } = req.body;
    if (value === undefined) {
      return res.status(400).json({ success: false, message: 'Value is required' });
    }
    const result = await pool.query(
      `INSERT INTO workspace_settings (key, value, type, description, workspace_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (key, workspace_id) 
       DO UPDATE SET 
         value = EXCLUDED.value,
         type = COALESCE(EXCLUDED.type, workspace_settings.type),
         description = COALESCE(EXCLUDED.description, workspace_settings.description),
         updated_at = NOW()
       RETURNING *`,
      [key, value, type, description, req.workspaceId]
    );
    res.json({ success: true, message: 'Setting updated successfully', setting: result.rows[0] });
  } catch (error) {
    console.error('[SETTINGS] Error updating setting:', error);
    res.status(500).json({ success: false, message: 'Failed to update setting', error: error.message });
  }
});

router.delete('/:key', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM workspace_settings WHERE key = $1 AND workspace_id = $2 RETURNING *',
      [req.params.key, req.workspaceId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Setting not found' });
    }
    res.json({ success: true, message: 'Setting deleted successfully', setting: result.rows[0] });
  } catch (error) {
    console.error('[SETTINGS] Error deleting setting:', error);
    res.status(500).json({ success: false, message: 'Failed to delete setting', error: error.message });
  }
});

module.exports = router;
