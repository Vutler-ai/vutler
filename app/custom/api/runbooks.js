'use strict';

/**
 * Runbooks API
 *
 * Routes are mounted at /api/v1 via packages/agents/routes.js:
 *   POST   /runbooks/parse          — parse text or JSON into a runbook preview
 *   POST   /runbooks/execute        — launch a runbook execution
 *   GET    /runbooks                — list runbooks for the workspace
 *   GET    /runbooks/:id            — get status / results of a single runbook
 *   POST   /runbooks/:id/cancel     — cancel a running runbook
 *   POST   /runbooks/:id/approve/:stepOrder — approve a step waiting for human review
 */

const express = require('express');
const { authenticateAgent } = require('../lib/auth');
const {
  parseRunbookFromText,
  parseRunbookFromJSON,
  validateRunbook,
  executeRunbook,
  getRunbookStatus,
  listRunbooks,
  cancelRunbook,
  approveStep,
} = require('../../../services/runbooks');

const router = express.Router();
const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';

function getWorkspaceId(req) {
  const candidates = [
    req.headers?.['x-workspace-id'],
    req.workspaceId,
  ];
  for (const candidate of candidates) {
    const value = typeof candidate === 'string' ? candidate.trim() : candidate;
    if (value) return value;
  }
  return null;
}

function ensureWorkspaceContext(req, res, next) {
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({
      success: false,
      error: 'workspace context is required',
    });
  }
  req.workspaceId = workspaceId;
  return next();
}

router.use(ensureWorkspaceContext);

// ── POST /runbooks/parse ──────────────────────────────────────────────────────
// Parse free text or raw JSON into a structured runbook for preview.
// Body: { text: string } | { json: object }

router.post('/runbooks/parse', authenticateAgent, async (req, res) => {
  try {
    const { text, json } = req.body || {};

    if (!text && !json) {
      return res.status(400).json({
        success: false,
        error: 'Provide either "text" (free-form) or "json" (structured runbook)',
      });
    }

    let runbook;
    if (json) {
      runbook = parseRunbookFromJSON(json);
    } else {
      runbook = await parseRunbookFromText(text);
    }

    const workspaceId = getWorkspaceId(req);
    const validation = await validateRunbook(runbook, workspaceId);

    res.json({
      success: true,
      data: {
        runbook,
        validation,
      },
    });
  } catch (err) {
    console.error('[Runbooks API] POST /parse error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /runbooks/execute ────────────────────────────────────────────────────
// Launch execution of a runbook.
// Body: { runbook: Runbook, agentId?: string, dryRun?: boolean }

router.post('/runbooks/execute', authenticateAgent, async (req, res) => {
  try {
    const { runbook: rawRunbook, agentId, dryRun = false } = req.body || {};

    if (!rawRunbook) {
      return res.status(400).json({ success: false, error: '"runbook" is required' });
    }

    const workspaceId = getWorkspaceId(req);
    let runbook;

    // Accept either a pre-parsed runbook object or raw JSON/text
    if (typeof rawRunbook === 'string') {
      runbook = await parseRunbookFromText(rawRunbook);
    } else {
      runbook = parseRunbookFromJSON(rawRunbook);
    }

    if (agentId) runbook.agentId = agentId;

    const validation = await validateRunbook(runbook, workspaceId);
    if (!validation.valid) {
      return res.status(422).json({
        success: false,
        error: 'Runbook validation failed',
        details: validation.errors,
      });
    }

    if (dryRun) {
      return res.json({
        success: true,
        data: { dryRun: true, runbook, validation },
      });
    }

    const createdBy =
      req.agent?.id ||
      req.headers['x-user-id'] ||
      req.headers['x-agent-id'] ||
      null;

    const result = await executeRunbook(runbook, { workspaceId, createdBy });

    res.status(202).json({ success: true, data: result });
  } catch (err) {
    console.error('[Runbooks API] POST /execute error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /runbooks ─────────────────────────────────────────────────────────────
// List runbooks for the workspace.

router.get('/runbooks', authenticateAgent, async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const limit = parseInt(req.query.limit) || 50;
    const status = req.query.status || undefined;

    const rows = await listRunbooks(workspaceId, { limit, status });
    res.json({ success: true, data: rows, meta: { total: rows.length, limit } });
  } catch (err) {
    console.error('[Runbooks API] GET /runbooks error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /runbooks/:id ─────────────────────────────────────────────────────────

router.get('/runbooks/:id', authenticateAgent, async (req, res) => {
  try {
    const rb = await getRunbookStatus(req.params.id);
    if (!rb) return res.status(404).json({ success: false, error: 'Runbook not found' });
    res.json({ success: true, data: rb });
  } catch (err) {
    console.error('[Runbooks API] GET /runbooks/:id error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /runbooks/:id/cancel ─────────────────────────────────────────────────

router.post('/runbooks/:id/cancel', authenticateAgent, async (req, res) => {
  try {
    const found = await cancelRunbook(req.params.id);
    if (!found) return res.status(404).json({ success: false, error: 'Runbook not found or already finished' });
    res.json({ success: true, data: { cancelled: true } });
  } catch (err) {
    console.error('[Runbooks API] POST /cancel error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /runbooks/:id/approve/:stepOrder ─────────────────────────────────────

router.post('/runbooks/:id/approve/:stepOrder', authenticateAgent, async (req, res) => {
  try {
    const runbookId = req.params.id;
    const stepOrder = parseInt(req.params.stepOrder);
    const approved = req.body?.approved !== false; // default true

    if (isNaN(stepOrder)) {
      return res.status(400).json({ success: false, error: 'stepOrder must be a number' });
    }

    const delivered = approveStep(runbookId, stepOrder, approved);
    if (!delivered) {
      return res.status(404).json({
        success: false,
        error: 'No pending approval found for this runbook / step',
      });
    }

    res.json({ success: true, data: { runbookId, stepOrder, approved } });
  } catch (err) {
    console.error('[Runbooks API] POST /approve error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
module.exports._private = {
  getWorkspaceId,
  ensureWorkspaceContext,
};
