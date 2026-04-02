'use strict';

const express = require('express');
const pool = require('../../../lib/vaultbrix');
const { authenticateAgent } = require('../lib/auth');
const { getRunEngine } = require('../../../services/orchestration/runEngine');
const {
  getRunById,
  getCurrentRunStep,
  listRunEvents,
  listRunSteps,
} = require('../../../services/orchestration/runStore');

const router = express.Router();
const SCHEMA = 'tenant_vutler';
const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';

function workspaceIdOf(req) {
  return req.workspaceId || DEFAULT_WORKSPACE;
}

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

router.get('/runs/:id', authenticateAgent, async (req, res) => {
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

router.get('/runs/:id/timeline', authenticateAgent, async (req, res) => {
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

router.post('/runs/:id/resume', authenticateAgent, async (req, res) => {
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

router.post('/runs/:id/cancel', authenticateAgent, async (req, res) => {
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
