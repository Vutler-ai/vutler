'use strict';

const { randomUUID } = require('crypto');

const pool = require('../lib/vaultbrix');
const {
  readWorkspaceSettingValue,
  writeWorkspaceSetting,
} = require('./sniparaProvisioningService');

const WEBHOOK_EVENTS_KEY = 'snipara_integrator:webhook_events';
const MAX_WEBHOOK_EVENTS = 40;
const LOGGED_EVENT_TYPES = new Set([
  'test.ping',
  'client.created',
  'client.updated',
  'client.deleted',
  'api_key.created',
  'api_key.revoked',
  'task.failed',
  'task.timeout',
  'task.blocked',
  'htask.blocked',
  'htask.closure_ready',
  'htask.closed',
]);

function shouldRecordSniparaWebhookEvent(eventType) {
  return LOGGED_EVENT_TYPES.has(String(eventType || '').trim());
}

function buildWebhookEventSummary(eventType, payload = {}) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
  const clientId = data.client_id || null;
  const taskId = data.task_id || null;
  const agentId = data.agent_id || null;

  if (clientId) {
    return `${eventType} for client ${clientId}`;
  }
  if (taskId) {
    return `${eventType} for task ${taskId}${agentId ? ` by ${agentId}` : ''}`;
  }
  return `${eventType} received`;
}

async function recordWorkspaceSniparaWebhookEvent({
  db = pool,
  workspaceId,
  eventType,
  deliveryId = null,
  status = 'processed',
  payload = {},
  error = null,
  maxEntries = MAX_WEBHOOK_EVENTS,
}) {
  if (!workspaceId) return null;
  if (!shouldRecordSniparaWebhookEvent(eventType)) return null;

  const current = await readWorkspaceSettingValue(db, workspaceId, WEBHOOK_EVENTS_KEY);
  const entries = Array.isArray(current) ? current : [];
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};

  const entry = {
    id: randomUUID(),
    event_type: String(eventType || 'unknown'),
    delivery_id: deliveryId ? String(deliveryId) : null,
    status,
    created_at: new Date().toISOString(),
    summary: buildWebhookEventSummary(eventType, payload),
    client_id: data.client_id || null,
    task_id: data.task_id || null,
    htask_id: data.htask_id || null,
    swarm_id: data.swarm_id || null,
    agent_id: data.agent_id || null,
    project_id: data.project_id || null,
    error: error ? String(error) : null,
  };

  await writeWorkspaceSetting(
    db,
    workspaceId,
    WEBHOOK_EVENTS_KEY,
    [entry, ...entries].slice(0, Math.max(1, maxEntries))
  );

  return entry;
}

async function getWorkspaceSniparaWebhookEvents({
  db = pool,
  workspaceId,
  limit = 10,
  eventType = null,
  status = null,
}) {
  if (!workspaceId) throw new Error('workspaceId is required');

  const current = await readWorkspaceSettingValue(db, workspaceId, WEBHOOK_EVENTS_KEY);
  const entries = Array.isArray(current) ? current : [];
  const filtered = entries.filter((entry) => {
    if (eventType && String(entry?.event_type || '') !== String(eventType)) return false;
    if (status && String(entry?.status || '') !== String(status)) return false;
    return true;
  });

  return {
    events: filtered.slice(0, Math.max(1, limit)),
    count: filtered.length,
  };
}

module.exports = {
  WEBHOOK_EVENTS_KEY,
  buildWebhookEventSummary,
  getWorkspaceSniparaWebhookEvents,
  recordWorkspaceSniparaWebhookEvent,
  shouldRecordSniparaWebhookEvent,
};
