'use strict';

/**
 * Sandbox Workspace API — Managed Code Workspaces
 *
 * Provides workspace lifecycle management for agent-driven development:
 * create, list, update files/status, execute code, dispatch, and delete.
 *
 * Routes:
 *   POST   /api/v1/sandbox-workspace          — Create workspace
 *   GET    /api/v1/sandbox-workspace          — List workspaces
 *   GET    /api/v1/sandbox-workspace/:id      — Get workspace by ID
 *   PUT    /api/v1/sandbox-workspace/:id/files   — Update files in workspace
 *   PUT    /api/v1/sandbox-workspace/:id/status  — Update workspace status
 *   POST   /api/v1/sandbox-workspace/:id/exec    — Execute code in workspace context
 *   POST   /api/v1/sandbox-workspace/:id/dispatch — Dispatch validated workspace
 *   DELETE /api/v1/sandbox-workspace/:id      — Delete workspace
 */

const express = require('express');
const router = express.Router();
const workspace = require('../services/sandboxWorkspace');
const { getDispatchRouter } = require('../services/dispatchRouter');

const VALID_STATUSES = ['active', 'validated', 'dispatched', 'closed'];

// ── POST / — Create workspace ─────────────────────────────────────────────────

router.post('/', async (req, res) => {
  const workspace_id = req.workspaceId;

  if (!workspace_id) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const { repo_url, branch, base_branch, agent_id, task_title, dispatch_target, dispatch_target_id } = req.body || {};

  if (!repo_url || !branch) {
    return res.status(400).json({ success: false, error: 'repo_url and branch are required' });
  }

  try {
    const result = await workspace.createWorkspace({
      workspace_id,
      repo_url,
      branch,
      base_branch: base_branch || null,
      agent_id: agent_id || null,
      task_title: task_title || null,
      dispatch_target: dispatch_target || null,
      dispatch_target_id: dispatch_target_id || null,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    console.error('[SandboxWorkspace] Create error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET / — List workspaces ───────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const workspace_id = req.workspaceId;

  if (!workspace_id) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const { status, limit = '20', offset = '0' } = req.query;

  try {
    const results = await workspace.listWorkspaces({
      workspace_id,
      status: status || null,
      limit: Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100),
      offset: Math.max(parseInt(offset, 10) || 0, 0),
    });
    res.json({ success: true, data: results });
  } catch (err) {
    console.error('[SandboxWorkspace] List error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /:id — Get workspace by ID ────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const result = await workspace.getWorkspace(req.params.id);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[SandboxWorkspace] Get error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /:id/files — Update files in workspace ────────────────────────────────

router.put('/:id/files', async (req, res) => {
  const { files } = req.body || {};

  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ success: false, error: 'files must be a non-empty array of { path, content }' });
  }

  try {
    const result = await workspace.updateFiles(req.params.id, files);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[SandboxWorkspace] Update files error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /:id/status — Update workspace status ─────────────────────────────────

router.put('/:id/status', async (req, res) => {
  const { status } = req.body || {};

  if (!status) {
    return res.status(400).json({ success: false, error: 'status is required' });
  }

  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  try {
    const result = await workspace.updateStatus(req.params.id, status);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[SandboxWorkspace] Update status error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /:id/exec — Execute code in workspace context ────────────────────────

router.post('/:id/exec', async (req, res) => {
  const { language, code, timeout } = req.body || {};

  if (!language || !code) {
    return res.status(400).json({ success: false, error: 'language and code are required' });
  }

  try {
    const result = await workspace.execInWorkspace(req.params.id, { language, code, timeout: timeout || null });
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[SandboxWorkspace] Exec error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /:id/dispatch — Dispatch validated workspace to target ───────────────

router.post('/:id/dispatch', async (req, res) => {
  try {
    const ws = await workspace.getWorkspace(req.params.id);
    if (!ws) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }

    if (ws.status !== 'validated') {
      return res.status(400).json({ success: false, error: `Workspace must have status 'validated' before dispatching (current: ${ws.status})` });
    }

    const dispatchRouter = getDispatchRouter();
    const dispatchResult = await dispatchRouter.send(ws);

    await workspace.updateStatus(req.params.id, 'dispatched');

    res.json({ success: true, data: dispatchResult });
  } catch (err) {
    console.error('[SandboxWorkspace] Dispatch error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /:id — Delete workspace ────────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    const result = await workspace.deleteWorkspace(req.params.id);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }
    res.json({ success: true, data: { deleted: true, id: req.params.id } });
  } catch (err) {
    console.error('[SandboxWorkspace] Delete error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
