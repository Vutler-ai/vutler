'use strict';

const express = require('express');
const { authenticateAgent } = require('../lib/auth');
const { getRunEngine } = require('../../../services/orchestration/runEngine');
const {
  getRunById,
  listRunSteps,
} = require('../../../services/orchestration/runStore');

const router = express.Router();
const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';

function workspaceIdOf(req) {
  return req.workspaceId || DEFAULT_WORKSPACE;
}

router.get('/runs/:id', authenticateAgent, async (req, res) => {
  try {
    const run = await getRunById(undefined, req.params.id);
    if (!run || run.workspace_id !== workspaceIdOf(req)) {
      return res.status(404).json({ success: false, error: 'Run not found' });
    }

    const steps = await listRunSteps(undefined, run.id);
    return res.json({
      success: true,
      data: {
        run,
        steps,
      },
    });
  } catch (error) {
    console.error('[Orchestration API] GET run error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch orchestration run', message: error.message });
  }
});

router.post('/runs/:id/approve', authenticateAgent, async (req, res) => {
  try {
    const run = await getRunById(undefined, req.params.id);
    if (!run || run.workspace_id !== workspaceIdOf(req)) {
      return res.status(404).json({ success: false, error: 'Run not found' });
    }

    const decision = await getRunEngine().approveRun(run.id, {
      approved: req.body?.approved !== false,
      note: req.body?.note || null,
      actor: req.agent?.username || req.agent?.id || 'human',
    });

    return res.json({ success: true, data: decision });
  } catch (error) {
    console.error('[Orchestration API] POST approve error:', error.message);
    return res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;
