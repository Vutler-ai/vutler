/**
 * UI Pack Backend Contracts (P0)
 * Covers: Tasks, Inbox/Human Approval, Calendar, Marketplace Deploy, Nexus Setup Status
 * MongoDB refs removed - using in-memory stubs or PG where applicable
 */

const express = require('express');
const { authenticateAgent } = require('../lib/auth');
const { requireCorePermission } = require('../lib/core-permissions');

const router = express.Router();

const featureFlags = {
  inboxStub: process.env.VUTLER_FEATURE_INBOX_STUB !== 'false',
  calendarStub: process.env.VUTLER_FEATURE_CALENDAR_STUB !== 'false',
  deployAsync: process.env.VUTLER_MARKETPLACE_DEPLOY_ASYNC === 'true'
};

function withTimeout(ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Request timeout')), ms);
  return { controller, clear: () => clearTimeout(timer) };
}

async function fetchExternalJson(url, body, token, timeoutMs = 8000) {
  const timeout = withTimeout(timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body || {}),
      signal: timeout.controller.signal
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      throw new Error(payload?.error?.message || payload?.message || `Provider request failed (${response.status})`);
    }

    return payload;
  } finally {
    timeout.clear();
  }
}

async function getInboxThreads(pg, query = {}) {
  const provider = (process.env.VUTLER_INBOX_PROVIDER || 'stub').toLowerCase();
  if (provider === 'http' || provider === 'real') {
    const endpoint = process.env.VUTLER_INBOX_PROVIDER_URL;
    if (!endpoint) throw new Error('VUTLER_INBOX_PROVIDER_URL is required when VUTLER_INBOX_PROVIDER=http');
    const payload = await fetchExternalJson(endpoint, { query }, process.env.VUTLER_INBOX_PROVIDER_TOKEN);
    return { threads: payload.threads || [], source: 'provider-http', provider: 'http' };
  }

  // Return empty stub - no MongoDB
  return { threads: [], source: 'stub', provider: 'none' };
}

async function getCalendarEvents(pg, query = {}) {
  const provider = (process.env.VUTLER_CALENDAR_PROVIDER || 'stub').toLowerCase();
  const from = query.from ? new Date(query.from) : new Date(Date.now() - (7 * 24 * 3600 * 1000));
  const to = query.to ? new Date(query.to) : new Date(Date.now() + (30 * 24 * 3600 * 1000));

  if (provider === 'http' || provider === 'real') {
    const endpoint = process.env.VUTLER_CALENDAR_PROVIDER_URL;
    if (!endpoint) throw new Error('VUTLER_CALENDAR_PROVIDER_URL is required when VUTLER_CALENDAR_PROVIDER=http');
    const payload = await fetchExternalJson(endpoint, { from: from.toISOString(), to: to.toISOString() }, process.env.VUTLER_CALENDAR_PROVIDER_TOKEN);
    return { events: payload.events || [], source: 'provider-http', provider: 'http' };
  }

  // Return empty stub - no MongoDB
  return { events: [], source: 'stub', provider: 'none' };
}

function ok(res, payload = {}, status = 200) {
  return res.status(status).json({ success: true, ...payload });
}

function fail(res, status, code, message, details = {}, action = 'Review request and retry') {
  return res.status(status).json({
    success: false,
    error: { code, message, details, action }
  });
}

// Removed toObjectIdOrString - no MongoDB ObjectId needed

async function runDeploymentExecutor(pg, deploymentId) {
  // Stub implementation - no MongoDB
  console.log(`[Deployment] Would run executor for deployment ${deploymentId}`);
  return {
    route: '/workspace',
    workspaceId: 'default',
    deployedTemplateVersion: 'latest',
    executor: 'stub'
  };
}

async function enqueueDeploymentJob(pg, deploymentId) {
  console.log(`[Deployment] Would enqueue job for deployment ${deploymentId}`);
  // No MongoDB - stub only
}

function validateDeployPayload(payload) {
  const errors = [];
  const allowedTopLevel = ['config', 'environment', 'notes', 'requestedBy'];
  const unknownTopLevel = Object.keys(payload || {}).filter((k) => !allowedTopLevel.includes(k));
  if (unknownTopLevel.length > 0) {
    errors.push({ field: 'root', message: 'Unknown fields provided', value: unknownTopLevel });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    errors.push({ field: 'root', message: 'Payload must be an object' });
    return errors;
  }

  if (!payload.environment || typeof payload.environment !== 'string') {
    errors.push({ field: 'environment', message: 'environment is required and must be a string' });
  } else if (!['dev', 'staging', 'prod'].includes(payload.environment)) {
    errors.push({ field: 'environment', message: 'environment must be one of dev|staging|prod', value: payload.environment });
  }

  if (!payload.config || typeof payload.config !== 'object' || Array.isArray(payload.config)) {
    errors.push({ field: 'config', message: 'config is required and must be an object' });
  } else {
    const requiredConfigFields = ['workspaceId', 'name'];
    for (const field of requiredConfigFields) {
      if (!payload.config[field] || typeof payload.config[field] !== 'string') {
        errors.push({ field: `config.${field}`, message: `${field} is required and must be a string` });
      }
    }
  }

  if (payload.notes && typeof payload.notes !== 'string') {
    errors.push({ field: 'notes', message: 'notes must be a string' });
  }

  if (payload.requestedBy && typeof payload.requestedBy !== 'string') {
    errors.push({ field: 'requestedBy', message: 'requestedBy must be a string' });
  }

  return errors;
}

async function withTransactionalDeploymentRecord(pg, recordBase, deployFn) {
  // Simplified stub - no MongoDB transactions
  try {
    const deployResult = await deployFn({ deploymentId: 'stub_' + Date.now() });
    return { deploymentId: 'stub_' + Date.now(), deployResult };
  } catch (error) {
    throw error;
  }
}

router.get('/tasks/kanban', authenticateAgent, requireCorePermission('tasks.read'), async (req, res) => {
  // Return empty kanban - no MongoDB
  const lanes = ['todo', 'in_progress', 'review', 'done'];
  const grouped = lanes.map((lane) => ({
    lane,
    items: []
  }));

  return ok(res, { lanes: grouped, total: 0 });
});

router.get('/tasks/:id', authenticateAgent, requireCorePermission('tasks.read'), async (req, res) => {
  // Stub - no MongoDB
  return fail(res, 404, 'TASK_NOT_FOUND', 'Task not found', { id: req.params.id }, 'Refresh task list and retry');
});

router.post('/marketplace/templates/:templateId/deploy', authenticateAgent, async (req, res) => {
  const templateId = req.params.templateId;
  const payload = req.body;

  const validationErrors = validateDeployPayload(payload);
  if (validationErrors.length > 0) {
    return fail(res, 422, 'VALIDATION_ERROR', 'Template deployment payload is invalid', { fields: validationErrors }, 'Fix fields and retry deployment');
  }

  // Stub deployment - no MongoDB
  const deploymentId = 'deploy_' + Date.now();
  
  return ok(res, {
    deployment: {
      id: deploymentId,
      status: 'deployed',
      route: `/workspace/${payload?.config?.workspaceId || 'default'}`,
      workspaceId: payload?.config?.workspaceId || 'default',
      executor: 'stub'
    }
  }, 201);
});


router.get('/marketplace/deployments/:id', authenticateAgent, async (req, res) => {
  // Stub - no MongoDB
  return ok(res, {
    deployment: {
      id: req.params.id,
      status: 'deployed',
      environment: 'prod',
      result: null,
      failureReason: null,
      updatedAt: new Date().toISOString()
    },
    executor: null
  });
});

router.get('/nexus/status', authenticateAgent, async (req, res) => {
  const inboxReady = !featureFlags.inboxStub;
  const calendarReady = !featureFlags.calendarStub;

  return ok(res, {
    status: inboxReady && calendarReady ? 'ok' : 'partial',
    badge: inboxReady && calendarReady ? 'green' : 'amber',
    setup: {
      complete: inboxReady && calendarReady,
      checkedAt: new Date().toISOString()
    },
    routing: {
      defaultRoute: '/workspace',
      routes: [
        { key: 'kanban', path: '/workspace/tasks', ready: true },
        { key: 'inbox', path: '/workspace/inbox', ready: inboxReady },
        { key: 'calendar', path: '/workspace/calendar', ready: calendarReady },
        { key: 'drive', path: '/workspace/drive', ready: true }
      ]
    },
    providers: {
      inbox: process.env.VUTLER_INBOX_PROVIDER || 'stub',
      calendar: process.env.VUTLER_CALENDAR_PROVIDER || 'stub'
    }
  });
});

router.get('/nexus/setup/status', authenticateAgent, async (req, res) => {
  const blockers = [];
  if (featureFlags.inboxStub) blockers.push('Inbox provider still running in stub mode');
  if (featureFlags.calendarStub) blockers.push('Calendar provider still running in stub mode');

  return ok(res, {
    contractVersion: '2026-03-06',
    setup: {
      phase: blockers.length === 0 ? 'ready' : 'partial',
      badge: blockers.length === 0 ? 'green' : 'amber',
      blockers,
      health: blockers.length === 0 ? 'green' : 'amber'
    },
    routeMetadata: {
      layout: 'workspace',
      primaryNav: ['tasks', 'inbox', 'calendar', 'drive', 'marketplace']
    },
    providerModes: {
      inboxStub: featureFlags.inboxStub,
      calendarStub: featureFlags.calendarStub
    }
  });
});

router.get('/inbox/threads', authenticateAgent, async (req, res) => {
  if (featureFlags.inboxStub) {
    return ok(res, {
      threads: [],
      source: 'stub',
      featureFlag: 'VUTLER_FEATURE_INBOX_STUB',
      todo: 'Set VUTLER_FEATURE_INBOX_STUB=false and configure provider envs'
    });
  }

  try {
    const result = await getInboxThreads(null, req.query);
    return ok(res, result);
  } catch (error) {
    return fail(res, 502, 'INBOX_PROVIDER_ERROR', 'Failed to fetch inbox provider data', { reason: error.message }, 'Check provider connectivity and credentials');
  }
});

router.get('/inbox/approvals', authenticateAgent, async (req, res) => {
  // Return empty approvals - no MongoDB
  return ok(res, {
    approvals: [],
    source: 'stub',
    todo: 'No approvals in data source yet'
  });
});

router.post('/inbox/approvals/:id/decision', authenticateAgent, async (req, res) => {
  const decision = req.body?.decision;

  if (!['approve', 'reject'].includes(decision)) {
    return fail(res, 422, 'VALIDATION_ERROR', 'decision must be approve or reject', { field: 'decision' });
  }

  // Stub - no MongoDB
  return ok(res, { 
    approval: { 
      id: req.params.id, 
      status: decision === 'approve' ? 'approved' : 'rejected',
      decidedBy: req.agent?.id || 'unknown',
      decidedAt: new Date().toISOString()
    } 
  });
});

router.get('/calendar/events', authenticateAgent, requireCorePermission('calendar.read'), async (req, res) => {
  if (featureFlags.calendarStub) {
    return ok(res, {
      events: [],
      source: 'stub',
      featureFlag: 'VUTLER_FEATURE_CALENDAR_STUB',
      todo: 'Set VUTLER_FEATURE_CALENDAR_STUB=false and configure provider envs'
    });
  }

  try {
    const result = await getCalendarEvents(null, req.query);
    return ok(res, result);
  } catch (error) {
    return fail(res, 502, 'CALENDAR_PROVIDER_ERROR', 'Failed to fetch calendar provider data', { reason: error.message }, 'Check provider connectivity and credentials');
  }
});

module.exports = router;
module.exports._test = {
  validateDeployPayload,
  withTransactionalDeploymentRecord,
  getInboxThreads,
  getCalendarEvents,
  runDeploymentExecutor
};
