'use strict';

/**
 * Nexus Routing API
 * GET  /api/v1/nexus/routing          — full routing matrix
 * POST /api/v1/nexus/routing/resolve   — resolve agent for a task type
 * GET  /api/v1/nexus/routing/smoke     — post-deploy smoke test
 */

const express = require('express');
const router = express.Router();
const { routeTask, getRoutingMatrix } = require('../services/nexusRouting');

// GET /routing — full matrix
router.get('/', async (req, res) => {
  try {
    const matrix = getRoutingMatrix();
    res.json({ success: true, routing: matrix });
  } catch (err) {
    console.error('[NEXUS-ROUTING] matrix error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /routing/resolve — resolve agent for task type
router.post('/resolve', async (req, res) => {
  try {
    const { taskType } = req.body || {};
    if (!taskType) {
      return res.status(400).json({ success: false, error: 'taskType is required' });
    }
    const result = await routeTask(taskType);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[NEXUS-ROUTING] resolve error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /routing/smoke — post-deploy smoke test
router.get('/smoke', async (req, res) => {
  try {
    const tests = ['feature', 'bug', 'deploy', 'migration', 'review'];
    const results = [];
    let allPass = true;

    for (const type of tests) {
      const r = await routeTask(type);
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
