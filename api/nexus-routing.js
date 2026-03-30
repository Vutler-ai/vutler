'use strict';

/**
 * Nexus Routing API
 * GET  /api/v1/nexus/routing              — full routing matrix
 * POST /api/v1/nexus/routing/resolve       — resolve agent for a task type
 * POST /api/v1/nexus/routing/report        — report task result (health tracking)
 * GET  /api/v1/nexus/routing/smoke         — post-deploy smoke test
 * POST /api/v1/nexus/routing/cache/invalidate — flush routing rules cache
 */

const express = require('express');
const router = express.Router();
const {
  routeTask,
  getRoutingMatrix,
  reportTaskResult,
  invalidateRoutingRulesCache,
} = require('../services/nexusRouting');

// GET /routing — full matrix (optionally scoped to a workspace)
router.get('/', async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id || null;
    const matrix = await getRoutingMatrix(workspaceId);
    res.json({ success: true, routing: matrix });
  } catch (err) {
    console.error('[NEXUS-ROUTING] matrix error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /routing/resolve — resolve agent for task type (with load balancing)
router.post('/resolve', async (req, res) => {
  try {
    const { taskType, workspace_id } = req.body || {};
    if (!taskType) {
      return res.status(400).json({ success: false, error: 'taskType is required' });
    }
    const result = await routeTask(taskType, workspace_id || null);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[NEXUS-ROUTING] resolve error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /routing/report — report task result for health tracking
router.post('/report', (req, res) => {
  try {
    const { agentId, success } = req.body || {};
    if (!agentId || typeof success !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'agentId (string) and success (boolean) are required',
      });
    }
    reportTaskResult(agentId, success);
    res.json({ success: true });
  } catch (err) {
    console.error('[NEXUS-ROUTING] report error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /routing/cache/invalidate — flush routing rules cache
router.post('/cache/invalidate', (req, res) => {
  try {
    const { workspace_id } = req.body || {};
    invalidateRoutingRulesCache(workspace_id || null);
    res.json({ success: true, flushed: workspace_id || 'all' });
  } catch (err) {
    console.error('[NEXUS-ROUTING] cache invalidate error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /routing/smoke — post-deploy smoke test
router.get('/smoke', async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id || null;
    const tests = ['feature', 'bug', 'deploy', 'migration', 'review'];
    const results = [];
    let allPass = true;

    for (const type of tests) {
      const r = await routeTask(type, workspaceId);
      const pass = !!(r.agent && r.agent.id);
      if (!pass) allPass = false;
      results.push({
        type,
        agent: r.agent ? r.agent.username : null,
        status: pass ? 'PASS' : 'FAIL',
        warning: r.warning || null,
      });
    }

    res.json({
      success: true,
      allPass,
      tests: results,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[NEXUS-ROUTING] smoke error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
