'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../lib/vaultbrix');
const { recommendAgents } = require('../services/coordinatorPrompt');
const SCHEMA = 'tenant_vutler';

function getWorkspaceId(req) {
  return req.workspaceId || req.user?.workspaceId || null;
}

router.get('/status', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const ws = await pool.query(
      `SELECT onboarding_completed FROM ${SCHEMA}.workspaces WHERE id = $1 LIMIT 1`,
      [workspaceId]
    );

    if (!ws.rows.length) return res.status(404).json({ success: false, error: 'Workspace not found' });

    const coordinator = await pool.query(
      `SELECT id FROM ${SCHEMA}.agents WHERE workspace_id = $1 AND agent_type = 'coordinator' ORDER BY created_at ASC LIMIT 1`,
      [workspaceId]
    );

    const channel = await pool.query(
      `SELECT id FROM ${SCHEMA}.chat_channels WHERE workspace_id = $1 AND name = 'DM-jarvis' AND type = 'dm' ORDER BY created_at ASC LIMIT 1`,
      [workspaceId]
    );

    return res.json({
      success: true,
      data: {
        onboarding_completed: !!ws.rows[0].onboarding_completed,
        coordinator_channel_id: channel.rows[0]?.id || null,
        coordinator_agent_id: coordinator.rows[0]?.id || null,
      },
    });
  } catch (err) {
    console.error('[ONBOARDING] status error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/complete', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    await pool.query(
      `UPDATE ${SCHEMA}.workspaces SET onboarding_completed = true, updated_at = NOW() WHERE id = $1`,
      [workspaceId]
    );

    return res.json({ success: true, data: { onboarding_completed: true } });
  } catch (err) {
    console.error('[ONBOARDING] complete error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/recommend-agents', async (req, res) => {
  try {
    const { use_case } = req.body || {};
    if (!use_case || typeof use_case !== 'string') {
      return res.status(400).json({ success: false, error: 'use_case is required' });
    }

    const templates = recommendAgents(use_case);
    return res.json({ success: true, data: { use_case, templates } });
  } catch (err) {
    console.error('[ONBOARDING] recommend-agents error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
