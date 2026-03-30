'use strict';

/**
 * Jira API Routes
 *
 * All routes are workspace-scoped. Credentials (baseUrl, email, apiToken) are
 * stored encrypted in workspace_integrations.credentials for the 'jira' provider.
 *
 * Mount at: /api/v1/jira  (see packages/office/routes.js)
 */

const express = require('express');
const pool = require('../lib/vaultbrix');
const { JiraAdapter } = require('../services/integrations/jira');
const { CryptoService } = require('../services/crypto');

const router = express.Router();
const crypto = new CryptoService();

const SCHEMA = 'tenant_vutler';
const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';

function getWorkspaceId(req) {
  return req.workspaceId || DEFAULT_WORKSPACE;
}

/**
 * Load and decrypt Jira credentials for a workspace.
 * Returns { baseUrl, email, apiToken } or throws if not connected.
 */
async function getJiraCredentials(workspaceId) {
  const result = await pool.query(
    `SELECT credentials, connected, status
     FROM ${SCHEMA}.workspace_integrations
     WHERE workspace_id = $1 AND provider = 'jira'
     LIMIT 1`,
    [workspaceId]
  );

  const row = result.rows[0];
  if (!row) {
    throw Object.assign(new Error('Jira is not connected for this workspace'), { statusCode: 400 });
  }
  if (!row.connected || row.status !== 'connected') {
    throw Object.assign(new Error('Jira integration is disconnected. Reconnect via /integrations/jira/connect'), { statusCode: 400 });
  }

  const creds = row.credentials;
  if (!creds?.baseUrl || !creds?.email || !creds?.apiToken) {
    throw Object.assign(new Error('Jira credentials are incomplete. Please reconnect.'), { statusCode: 400 });
  }

  let apiToken;
  try {
    apiToken = crypto.decrypt(creds.apiToken);
  } catch (_) {
    throw Object.assign(new Error('Failed to decrypt Jira API token. Please reconnect.'), { statusCode: 500 });
  }

  return { baseUrl: creds.baseUrl, email: creds.email, apiToken };
}

/** Instantiate JiraAdapter from workspace credentials. */
async function getAdapter(workspaceId) {
  const { baseUrl, email, apiToken } = await getJiraCredentials(workspaceId);
  return new JiraAdapter(baseUrl, email, apiToken);
}

// ─── Projects ─────────────────────────────────────────────────────────────────

// GET /api/v1/jira/projects
router.get('/projects', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const jira = await getAdapter(workspaceId);
    const data = await jira.listProjects();
    res.json({ success: true, data });
  } catch (err) {
    console.error('[JIRA] listProjects error:', err.message);
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

// ─── Issues ───────────────────────────────────────────────────────────────────

// GET /api/v1/jira/issues?jql=...&maxResults=50
router.get('/issues', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { jql, maxResults } = req.query;

    if (!jql) {
      return res.status(400).json({ success: false, error: 'jql query parameter is required' });
    }

    const jira = await getAdapter(workspaceId);
    const data = await jira.searchIssues(jql, maxResults ? parseInt(maxResults, 10) : 50);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[JIRA] searchIssues error:', err.message);
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/jira/issues
router.post('/issues', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { projectKey, summary, description, issueType, priority, assignee, labels } = req.body || {};

    if (!projectKey || !summary) {
      return res.status(400).json({ success: false, error: 'projectKey and summary are required' });
    }

    const jira = await getAdapter(workspaceId);
    const data = await jira.createIssue({ projectKey, summary, description, issueType, priority, assignee, labels });
    res.status(201).json({ success: true, data });
  } catch (err) {
    console.error('[JIRA] createIssue error:', err.message);
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/jira/issues/:key
router.get('/issues/:key', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const jira = await getAdapter(workspaceId);
    const data = await jira.getIssue(req.params.key);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[JIRA] getIssue error:', err.message);
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

// PATCH /api/v1/jira/issues/:key
router.patch('/issues/:key', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { fields } = req.body || {};

    if (!fields || typeof fields !== 'object') {
      return res.status(400).json({ success: false, error: 'fields object is required in request body' });
    }

    const jira = await getAdapter(workspaceId);
    await jira.updateIssue(req.params.key, fields);
    res.json({ success: true, data: { updated: true, key: req.params.key } });
  } catch (err) {
    console.error('[JIRA] updateIssue error:', err.message);
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

// ─── Comments ─────────────────────────────────────────────────────────────────

// POST /api/v1/jira/issues/:key/comment
router.post('/issues/:key/comment', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { body } = req.body || {};

    if (!body) {
      return res.status(400).json({ success: false, error: 'body is required' });
    }

    const jira = await getAdapter(workspaceId);
    const data = await jira.addComment(req.params.key, body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    console.error('[JIRA] addComment error:', err.message);
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

// ─── Transitions ──────────────────────────────────────────────────────────────

// GET /api/v1/jira/issues/:key/transitions
router.get('/issues/:key/transitions', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const jira = await getAdapter(workspaceId);
    const data = await jira.getTransitions(req.params.key);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[JIRA] getTransitions error:', err.message);
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/jira/issues/:key/transition
router.post('/issues/:key/transition', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { transitionId } = req.body || {};

    if (!transitionId) {
      return res.status(400).json({ success: false, error: 'transitionId is required' });
    }

    const jira = await getAdapter(workspaceId);
    await jira.transitionIssue(req.params.key, transitionId);
    res.json({ success: true, data: { transitioned: true, key: req.params.key, transitionId } });
  } catch (err) {
    console.error('[JIRA] transitionIssue error:', err.message);
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

module.exports = router;
