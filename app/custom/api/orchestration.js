'use strict';

const express = require('express');
const pool = require('../../../lib/vaultbrix');
const { authenticateAgent } = require('../lib/auth');
const { getRunEngine } = require('../../../services/orchestration/runEngine');
const {
  getAutonomyMetrics,
  getRunById,
  getCurrentRunStep,
  listRunEvents,
  listRunSteps,
} = require('../../../services/orchestration/runStore');

const router = express.Router();
const SCHEMA = 'tenant_vutler';

function normalizeWorkspaceId(value) {
  if (typeof value !== 'string') return value || null;
  const normalized = value.trim();
  return normalized || null;
}

function workspaceIdOf(req) {
  const candidates = [
    req.workspaceId,
    req.user?.workspaceId,
    req.user?.workspace_id,
    req.agent?.workspaceId,
    req.agent?.workspace_id,
  ];
  for (const candidate of candidates) {
    const value = normalizeWorkspaceId(candidate);
    if (value) return value;
  }
  return null;
}

function ensureWorkspaceContext(req, res, next) {
  const workspaceId = workspaceIdOf(req);
  if (!workspaceId) {
    return res.status(400).json({
      success: false,
      error: 'workspace context is required',
    });
  }
  req.workspaceId = workspaceId;
  return next();
}

router.use(authenticateAgent, ensureWorkspaceContext);

function asDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function buildTimeline(steps = [], events = []) {
  const items = [
    ...steps.map((step) => ({
      kind: 'step',
      id: step.id,
      timestamp: step.created_at || step.started_at || step.updated_at || null,
      data: step,
    })),
    ...events.map((event) => ({
      kind: 'event',
      id: event.id,
      timestamp: event.created_at || null,
      data: event,
    })),
  ];

  return items.sort((left, right) => {
    const leftTime = asDate(left.timestamp)?.getTime() || 0;
    const rightTime = asDate(right.timestamp)?.getTime() || 0;
    return leftTime - rightTime;
  });
}

async function loadRootTask(taskId, workspaceId) {
  if (!taskId) return null;
  const result = await pool.query(
    `SELECT *
       FROM ${SCHEMA}.tasks
      WHERE id = $1
        AND workspace_id = $2
      LIMIT 1`,
    [taskId, workspaceId]
  );
  return result.rows[0] || null;
}

async function loadRunDetail(runId, workspaceId) {
  const run = await getRunById(undefined, runId);
  if (!run || run.workspace_id !== workspaceId) return null;

  const [currentStep, steps, events, rootTask] = await Promise.all([
    getCurrentRunStep(undefined, run.id),
    listRunSteps(undefined, run.id),
    listRunEvents(undefined, run.id, { limit: 200 }),
    loadRootTask(run.root_task_id, workspaceId),
  ]);

  return {
    run,
    current_step: currentStep,
    steps,
    events,
    timeline: {
      items: buildTimeline(steps, events),
      total_steps: steps.length,
      total_events: events.length,
    },
    root_task: rootTask,
  };
}

router.get('/metrics/autonomy', async (req, res) => {
  try {
    const windowDays = Number.parseInt(String(req.query?.windowDays || '14'), 10);
    const data = await getAutonomyMetrics(undefined, workspaceIdOf(req), {
      windowDays: Number.isFinite(windowDays) ? windowDays : 14,
    });
    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[Orchestration API] GET autonomy metrics error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch orchestration autonomy metrics',
      message: error.message,
    });
  }
});

router.get('/runs/:id', async (req, res) => {
  try {
    const detail = await loadRunDetail(req.params.id, workspaceIdOf(req));
    if (!detail) {
      return res.status(404).json({ success: false, error: 'Run not found' });
    }
    return res.json({
      success: true,
      data: detail,
    });
  } catch (error) {
    console.error('[Orchestration API] GET run error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch orchestration run', message: error.message });
  }
});

router.get('/runs/:id/timeline', async (req, res) => {
  try {
    const detail = await loadRunDetail(req.params.id, workspaceIdOf(req));
    if (!detail) {
      return res.status(404).json({ success: false, error: 'Run not found' });
    }

    return res.json({
      success: true,
      data: {
        run: detail.run,
        current_step: detail.current_step,
        timeline: detail.timeline,
      },
    });
  } catch (error) {
    console.error('[Orchestration API] GET timeline error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch orchestration timeline', message: error.message });
  }
});

router.post('/runs/:id/approve', async (req, res) => {
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

router.post('/runs/:id/resume', async (req, res) => {
  try {
    const run = await getRunById(undefined, req.params.id);
    if (!run || run.workspace_id !== workspaceIdOf(req)) {
      return res.status(404).json({ success: false, error: 'Run not found' });
    }

    const result = await getRunEngine().resumeRun(run.id, {
      actor: req.agent?.username || req.agent?.id || 'human',
      note: req.body?.note || null,
    });

    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('[Orchestration API] POST resume error:', error.message);
    return res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/runs/:id/cancel', async (req, res) => {
  try {
    const run = await getRunById(undefined, req.params.id);
    if (!run || run.workspace_id !== workspaceIdOf(req)) {
      return res.status(404).json({ success: false, error: 'Run not found' });
    }

    const result = await getRunEngine().cancelRun(run.id, {
      actor: req.agent?.username || req.agent?.id || 'human',
      note: req.body?.note || null,
    });

    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('[Orchestration API] POST cancel error:', error.message);
    return res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;
module.exports._private = {
  workspaceIdOf,
  ensureWorkspaceContext,
};
