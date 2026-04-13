'use strict';

const express = require('express');
const router = express.Router();

const pool = require('../lib/vaultbrix');
const {
  appendWorkspaceSniparaProvisioningOperation,
  readExistingProvisioning,
  provisionWorkspaceSnipara,
  getWorkspaceSniparaProvisioningDiagnostics,
  getWorkspaceSniparaProvisioningOperations,
  runWorkspaceSniparaProvisioningProbe,
} = require('../services/sniparaProvisioningService');
const { resolveSniparaConfig, probeSniparaHealth, serializeSniparaError } = require('../services/sniparaResolver');
const { createSniparaGateway } = require('../services/snipara/gateway');
const { getWorkspaceSyncStatus } = require('../services/sniparaSyncStatusService');
const { getWorkspaceSniparaWebhookEvents } = require('../services/sniparaWebhookEventLogService');
const {
  listSharedDocumentUploads,
  recordSharedDocumentUpload,
} = require('../services/sniparaSharedDocumentService');

const SCHEMA = 'tenant_vutler';

function getWorkspaceId(req) {
  return req.workspaceId || req.user?.workspaceId || null;
}

function requireWorkspace(req, res, next) {
  if (!getWorkspaceId(req)) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  return next();
}

function requireAdminRole(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  return next();
}

router.use(requireWorkspace);
router.use(requireAdminRole);

function toNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toTimestampMs(value) {
  if (!value) return null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function pickLatestTimestamp(...values) {
  let winner = null;
  let winnerMs = null;
  for (const value of values) {
    const parsed = toTimestampMs(value);
    if (parsed === null) continue;
    if (winnerMs === null || parsed > winnerMs) {
      winner = value;
      winnerMs = parsed;
    }
  }
  return winner || null;
}

function normalizeToolError(error, fallbackMessage) {
  const serialized = serializeSniparaError(error);
  return {
    supported: false,
    degraded: true,
    message: fallbackMessage,
    error: serialized,
  };
}

function normalizeIndexHealthPayload(payload = {}) {
  const status = String(
    payload.status
    || payload.health
    || payload.state
    || (payload.ok === false ? 'degraded' : 'healthy')
  ).trim();
  const score = toNumber(
    payload.score,
    payload.index_health_score,
    payload.health_score,
    payload.coverage_score,
    payload.quality_score
  );
  const staleDocuments = toNumber(
    payload.stale_documents,
    payload.stale_docs,
    payload.outdated_documents,
    payload.stale_count
  ) || 0;
  const avgLatencyMs = toNumber(
    payload.avg_latency_ms,
    payload.latency_ms,
    payload.search_latency_ms,
    payload.p95_latency_ms
  );
  const errorCount = toNumber(
    payload.errors_last_24h,
    payload.error_count,
    payload.failed_queries,
    payload.zero_result_queries
  ) || 0;
  const degraded = status === 'degraded'
    || status === 'unhealthy'
    || (score !== null && score < 0.7)
    || staleDocuments > 0
    || errorCount > 0;

  return {
    supported: true,
    degraded,
    status,
    score,
    stale_documents: staleDocuments,
    documents_indexed: toNumber(payload.documents_indexed, payload.indexed_documents, payload.doc_count),
    last_indexed_at: payload.last_indexed_at || payload.last_refresh_at || payload.updated_at || null,
    avg_latency_ms: avgLatencyMs,
    errors_last_24h: errorCount,
    raw: payload,
  };
}

function normalizeSearchAnalyticsPayload(payload = {}, days = 30) {
  const totalQueries = toNumber(payload.total_queries, payload.queries, payload.searches) || 0;
  const successRate = toNumber(payload.success_rate, payload.hit_rate, payload.result_rate);
  const zeroResultRate = toNumber(payload.zero_result_rate, payload.no_result_rate, payload.miss_rate);

  return {
    supported: true,
    degraded: zeroResultRate !== null ? zeroResultRate > 0.25 : false,
    days,
    total_queries: totalQueries,
    avg_latency_ms: toNumber(payload.avg_latency_ms, payload.latency_ms, payload.search_latency_ms),
    success_rate: successRate,
    zero_result_rate: zeroResultRate,
    top_queries: Array.isArray(payload.top_queries) ? payload.top_queries.slice(0, 10) : [],
    raw: payload,
  };
}

function normalizeHtaskPolicyPayload(payload = {}) {
  return {
    supported: true,
    degraded: false,
    closure_verification_required: Boolean(
      payload.closure_verification_required
      || payload.verify_closure
      || payload.require_verify_closure
    ),
    block_on_failed_checks: Boolean(
      payload.block_on_failed_checks
      || payload.require_clean_checks
      || payload.strict_closure
    ),
    max_depth: toNumber(payload.max_depth, payload.depth_limit, payload.max_hierarchy_depth),
    default_mode: payload.default_mode || payload.mode || null,
    raw: payload,
  };
}

function normalizeHtaskMetricsPayload(payload = {}) {
  return {
    supported: true,
    degraded: false,
    open_count: toNumber(payload.open_count, payload.open_tasks, payload.open) || 0,
    blocked_count: toNumber(payload.blocked_count, payload.blocked_tasks, payload.blocked) || 0,
    stale_count: toNumber(payload.stale_count, payload.stale_tasks, payload.stale) || 0,
    avg_closure_hours: toNumber(payload.avg_closure_hours, payload.average_closure_hours, payload.avg_resolution_hours),
    raw: payload,
  };
}

function normalizeSharedTemplatesPayload(payload = {}) {
  const templates = Array.isArray(payload.templates) ? payload.templates : [];
  const categories = Array.isArray(payload.categories)
    ? payload.categories.map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];

  return {
    supported: true,
    degraded: false,
    total_count: toNumber(payload.total_count, payload.count, templates.length) || 0,
    categories,
    templates: templates.slice(0, 20).map((template) => ({
      id: template.id || null,
      name: template.name || template.slug || 'Untitled template',
      slug: template.slug || null,
      description: template.description || null,
      category: template.category || null,
      collection_name: template.collection_name || template.collection || null,
    })),
    raw: payload,
  };
}

function normalizeSharedCollectionsPayload(payload = {}) {
  const collections = Array.isArray(payload.collections) ? payload.collections : [];

  return {
    supported: true,
    degraded: false,
    count: toNumber(payload.count, payload.total_count, collections.length) || 0,
    collections: collections.slice(0, 20).map((collection) => ({
      id: collection.id || null,
      name: collection.name || collection.slug || 'Untitled collection',
      slug: collection.slug || null,
      description: collection.description || null,
      scope: collection.scope || null,
      access_type: collection.access_type || null,
      document_count: toNumber(
        collection?._count?.documents,
        collection.document_count,
        collection.documents
      ) || 0,
      template_count: toNumber(
        collection?._count?.templates,
        collection.template_count,
        collection.templates
      ) || 0,
    })),
    raw: payload,
  };
}

function normalizeSharedUploadsPayload(rows = []) {
  const uploads = Array.isArray(rows) ? rows : [];
  return {
    count: uploads.length,
    uploads: uploads.map((row) => ({
      id: row.id,
      collection_id: row.collection_id,
      collection_name: row.collection_name || null,
      remote_document_id: row.remote_document_id || null,
      title: row.title,
      category: row.category || null,
      priority: toNumber(row.priority) || 0,
      tags: Array.isArray(row.tags) ? row.tags : [],
      action: row.action || null,
      content_length: toNumber(row.content_length) || 0,
      content_preview: row.content_preview || null,
      created_by_user_id: row.created_by_user_id || null,
      created_by_email: row.created_by_email || null,
      created_at: row.created_at || null,
    })),
  };
}

function normalizeSharedUploadResultPayload(payload = {}, audit = null) {
  return {
    success: payload.success !== false,
    document_id: payload.document_id || payload.id || null,
    collection_id: payload.collection_id || null,
    title: payload.title || null,
    category: payload.category || null,
    action: payload.action || null,
    audit: audit ? {
      id: audit.id,
      collection_id: audit.collection_id,
      collection_name: audit.collection_name || null,
      title: audit.title,
      category: audit.category || null,
      priority: toNumber(audit.priority) || 0,
      tags: Array.isArray(audit.tags) ? audit.tags : [],
      created_by_email: audit.created_by_email || null,
      created_at: audit.created_at || null,
    } : null,
    raw: payload,
  };
}

function normalizeSharedDocumentInput(body = {}) {
  const tags = Array.isArray(body.tags)
    ? body.tags
    : String(body.tags || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

  return {
    collection_id: String(body.collection_id || '').trim(),
    title: String(body.title || '').trim(),
    content: String(body.content || '').trim(),
    category: String(body.category || 'BEST_PRACTICES').trim().toUpperCase() || 'BEST_PRACTICES',
    priority: Math.max(0, Math.min(100, Number(body.priority) || 0)),
    tags: tags.slice(0, 20),
  };
}

function normalizeSyncStatusPayload(payload = {}, now = Date.now()) {
  const staleAfterMs = Math.max(
    5 * 60_000,
    Number(process.env.SNIPARA_SOURCE_FRESHNESS_STALE_MS || 15 * 60_000)
  );
  const taskFailures = toNumber(payload.task_consecutive_failures) || 0;
  const eventFailures = toNumber(payload.event_consecutive_failures) || 0;
  const lastTaskSyncAt = payload.last_task_sync_at || null;
  const lastEventSyncAt = payload.last_event_sync_at || null;
  const latestSyncAt = pickLatestTimestamp(lastTaskSyncAt, lastEventSyncAt);
  const latestSyncMs = toTimestampMs(latestSyncAt);
  const latestSuccessAt = pickLatestTimestamp(payload.last_task_success_at, payload.last_event_success_at);
  const latestFailureAt = pickLatestTimestamp(payload.last_task_failure_at, payload.last_event_failure_at);
  const hasRecentIssue = payload.last_task_result === 'partial'
    || payload.last_task_result === 'failed'
    || payload.last_event_result === 'failed'
    || taskFailures > 0
    || eventFailures > 0;

  let status = 'unknown';
  let degraded = false;
  let message = 'No Snipara sync has been recorded yet for this workspace.';

  if (latestSyncMs !== null) {
    const isStale = (now - latestSyncMs) > staleAfterMs;
    const isFailed = taskFailures >= 3 || eventFailures >= 3;
    degraded = isStale || hasRecentIssue;

    if (isFailed) {
      status = 'failed';
      message = 'Repeated Snipara sync failures are blocking freshness updates for this workspace.';
    } else if (isStale || hasRecentIssue) {
      status = 'stale';
      message = isStale
        ? 'Snipara sync telemetry is stale and should be refreshed before trusting autonomous runs.'
        : 'Snipara reported recent sync issues; operator review is recommended.';
    } else {
      status = 'healthy';
      message = 'Snipara sync telemetry is fresh for this workspace.';
    }
  }

  return {
    supported: true,
    degraded,
    status,
    stale_after_minutes: Math.round(staleAfterMs / 60_000),
    last_task_sync_at: lastTaskSyncAt,
    last_task_success_at: payload.last_task_success_at || null,
    last_task_failure_at: payload.last_task_failure_at || null,
    last_task_result: payload.last_task_result || null,
    last_task_synced: toNumber(payload.last_task_synced) || 0,
    last_task_errors: toNumber(payload.last_task_errors) || 0,
    last_task_error: payload.last_task_error || null,
    task_consecutive_failures: taskFailures,
    last_event_sync_at: lastEventSyncAt,
    last_event_success_at: payload.last_event_success_at || null,
    last_event_failure_at: payload.last_event_failure_at || null,
    last_event_result: payload.last_event_result || null,
    last_event_count: toNumber(payload.last_event_count) || 0,
    last_event_error: payload.last_event_error || null,
    event_consecutive_failures: eventFailures,
    last_success_at: latestSuccessAt,
    last_failure_at: latestFailureAt,
    message,
    raw: payload || {},
  };
}

function normalizeProvisioningOperationsPayload(payload = {}) {
  return {
    operations: Array.isArray(payload.operations) ? payload.operations : [],
    count: Number.isFinite(Number(payload.count)) ? Number(payload.count) : 0,
  };
}

function normalizeWebhookEventsPayload(payload = {}) {
  return {
    events: Array.isArray(payload.events) ? payload.events : [],
    count: Number.isFinite(Number(payload.count)) ? Number(payload.count) : 0,
  };
}

async function callAdminSniparaTool(req, res, toolCall, normalizer, fallbackMessage) {
  try {
    const workspaceId = getWorkspaceId(req);
    const gateway = createSniparaGateway({ db: pool, workspaceId });
    const payload = await toolCall(gateway);
    return res.json({ success: true, data: normalizer(payload) });
  } catch (error) {
    return res.json({
      success: true,
      data: normalizeToolError(error, fallbackMessage),
    });
  }
}

router.get('/status', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);

    const [existing, resolved] = await Promise.all([
      readExistingProvisioning(pool, workspaceId),
      resolveSniparaConfig(pool, workspaceId),
    ]);

    res.json({
      success: true,
      data: {
        workspace_id: workspaceId,
        configured: Boolean(existing.apiKey && existing.apiUrl && existing.swarmId),
        integration_key_present: Boolean(process.env.SNIPARA_INTEGRATION_KEY),
        settings: {
          api_url: existing.apiUrl || null,
          project_id: existing.projectId || null,
          project_slug: existing.projectSlug || null,
          swarm_id: existing.swarmId || null,
          api_key_present: Boolean(existing.apiKey),
        },
        resolved: {
          source: resolved.source,
          api_url: resolved.apiUrl || null,
          project_id: resolved.projectId || null,
          project_slug: resolved.projectSlug || null,
          swarm_id: resolved.swarmId || null,
          api_key_present: Boolean(resolved.apiKey),
        },
      },
    });
  } catch (error) {
    console.error('[SniparaAdmin] status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/health', async (req, res) => {
  try {
    const workspaceId = String(req.query.workspace_id || getWorkspaceId(req) || '').trim();
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'workspace_id is required' });
    }

    const data = await probeSniparaHealth({ db: pool, workspaceId });
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[SniparaAdmin] health error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/index-health', (req, res) => {
  return callAdminSniparaTool(
    req,
    res,
    (gateway) => gateway.analytics.indexHealth({}),
    (payload) => normalizeIndexHealthPayload(payload),
    'Snipara index health is unavailable for this workspace or plan.'
  );
});

router.get('/search-analytics', (req, res) => {
  const days = Math.max(1, Math.min(90, Number(req.query.days) || 30));
  return callAdminSniparaTool(
    req,
    res,
    (gateway) => gateway.analytics.searchAnalytics({ days }),
    (payload) => normalizeSearchAnalyticsPayload(payload, days),
    'Snipara search analytics is unavailable for this workspace or plan.'
  );
});

router.get('/htask-policy', (req, res) => {
  return callAdminSniparaTool(
    req,
    res,
    (gateway) => gateway.coordination.htaskPolicyGet({}),
    (payload) => normalizeHtaskPolicyPayload(payload),
    'Snipara htask policy is unavailable for this workspace or plan.'
  );
});

router.get('/htask-metrics', (req, res) => {
  return callAdminSniparaTool(
    req,
    res,
    (gateway) => gateway.coordination.htaskMetrics({}),
    (payload) => normalizeHtaskMetricsPayload(payload),
    'Snipara htask metrics are unavailable for this workspace or plan.'
  );
});

router.get('/shared/templates', (req, res) => {
  const category = String(req.query.category || '').trim();
  return callAdminSniparaTool(
    req,
    res,
    (gateway) => gateway.shared.listTemplates(category ? { category } : {}),
    (payload) => normalizeSharedTemplatesPayload(payload),
    'Snipara shared templates are unavailable for this workspace or plan.'
  );
});

router.get('/shared/collections', (req, res) => {
  const includePublic = String(req.query.include_public || 'true').trim().toLowerCase() !== 'false';
  return callAdminSniparaTool(
    req,
    res,
    (gateway) => gateway.shared.listCollections({ include_public: includePublic }),
    (payload) => normalizeSharedCollectionsPayload(payload),
    'Snipara shared collections are unavailable for this workspace or plan.'
  );
});

router.get('/shared/uploads', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));
    const rows = await listSharedDocumentUploads(workspaceId, { limit, db: pool });
    return res.json({
      success: true,
      data: normalizeSharedUploadsPayload(rows),
    });
  } catch (error) {
    console.error('[SniparaAdmin] shared uploads error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/shared/documents', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const input = normalizeSharedDocumentInput(req.body || {});
    if (!input.collection_id) {
      return res.status(400).json({ success: false, error: 'collection_id is required' });
    }
    if (!input.title) {
      return res.status(400).json({ success: false, error: 'title is required' });
    }
    if (!input.content) {
      return res.status(400).json({ success: false, error: 'content is required' });
    }

    const gateway = createSniparaGateway({ db: pool, workspaceId });
    const collectionsPayload = await gateway.shared.listCollections({ include_public: true });
    const collections = Array.isArray(collectionsPayload?.collections) ? collectionsPayload.collections : [];
    const targetCollection = collections.find((entry) => String(entry?.id || '').trim() === input.collection_id);
    if (!targetCollection) {
      return res.status(400).json({ success: false, error: 'Shared collection is not accessible for this workspace' });
    }
    if (String(targetCollection.access_type || '').trim().toLowerCase() === 'public'
      || String(targetCollection.scope || '').trim().toLowerCase() === 'public') {
      return res.status(403).json({ success: false, error: 'Public shared collections are read-only in Vutler' });
    }

    const payload = await gateway.shared.uploadDocument(input);
    const audit = await recordSharedDocumentUpload({
      workspaceId,
      collectionId: targetCollection.id,
      collectionName: targetCollection.name || null,
      remoteDocumentId: payload?.document_id || payload?.id || null,
      title: input.title,
      category: input.category,
      priority: input.priority,
      tags: input.tags,
      action: payload?.action || null,
      content: input.content,
      createdByUserId: req.user?.id || null,
      createdByEmail: req.user?.email || null,
      db: pool,
    });

    return res.json({
      success: true,
      data: normalizeSharedUploadResultPayload(payload, audit),
    });
  } catch (error) {
    console.error('[SniparaAdmin] shared document upload error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/sync-status', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const payload = await getWorkspaceSyncStatus(workspaceId, pool);
    return res.json({
      success: true,
      data: normalizeSyncStatusPayload(payload || {}),
    });
  } catch (error) {
    console.error('[SniparaAdmin] sync status error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/provisioning', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const data = await getWorkspaceSniparaProvisioningDiagnostics({
      db: pool,
      workspaceId,
    });
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[SniparaAdmin] provisioning diagnostics error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/provisioning/operations', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const data = await getWorkspaceSniparaProvisioningOperations({
      db: pool,
      workspaceId,
      limit: Math.min(25, Math.max(1, Number(req.query?.limit) || 10)),
    });
    return res.json({ success: true, data: normalizeProvisioningOperationsPayload(data) });
  } catch (error) {
    console.error('[SniparaAdmin] provisioning operations error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/provisioning/probe', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const data = await runWorkspaceSniparaProvisioningProbe({
      db: pool,
      workspaceId,
      user: req.user || null,
    });
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[SniparaAdmin] provisioning probe error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/webhook-events', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const data = await getWorkspaceSniparaWebhookEvents({
      db: pool,
      workspaceId,
      limit: Math.min(25, Math.max(1, Number(req.query?.limit) || 10)),
      eventType: typeof req.query?.event_type === 'string' ? req.query.event_type : null,
      status: typeof req.query?.status === 'string' ? req.query.status : null,
    });
    return res.json({ success: true, data: normalizeWebhookEventsPayload(data) });
  } catch (error) {
    console.error('[SniparaAdmin] webhook events error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/provision', async (req, res) => {
  const workspaceId = getWorkspaceId(req);
  try {
    const workspaceResult = await pool.query(
      `SELECT name, slug FROM ${SCHEMA}.workspaces WHERE id = $1 LIMIT 1`,
      [workspaceId]
    );
    const workspace = workspaceResult.rows[0];
    if (!workspace) return res.status(404).json({ success: false, error: 'Workspace not found' });

    const result = await provisionWorkspaceSnipara({
      db: pool,
      workspaceId,
      workspaceName: workspace.name,
      workspaceSlug: workspace.slug,
      ownerEmail: req.user?.email || null,
      force: Boolean(req.body?.force),
    });

    await appendWorkspaceSniparaProvisioningOperation({
      db: pool,
      workspaceId,
      operation: {
        kind: result.skipped ? 'reconcile_skipped' : 'reconcile',
        status: 'ok',
        summary: result.skipped
          ? 'Snipara provisioning was already healthy.'
          : result.recoveredApiKey
            ? 'Workspace API key was reissued from the existing integrator client binding.'
            : result.createdProject
              ? 'Workspace was provisioned through the Snipara Integrator flow.'
              : result.createdSwarm
                ? 'Missing Snipara swarm binding was recreated.'
                : 'Snipara provisioning was reconciled successfully.',
        actor_user_id: req.user?.id || null,
        actor_email: req.user?.email || null,
        recommended_action: result.recoveredApiKey
          ? 'repair_api_key'
          : result.createdSwarm
            ? 'create_swarm'
            : result.createdProject
              ? 'provision'
              : 'repair',
        provisioning_mode: result.createdProject ? 'integrator' : 'partial',
        details: {
          skipped: Boolean(result.skipped),
          reason: result.reason || null,
          created_project: Boolean(result.createdProject),
          created_swarm: Boolean(result.createdSwarm),
          recovered_api_key: Boolean(result.recoveredApiKey),
          client_id: result.clientId || null,
          project_id: result.projectId || null,
          project_slug: result.projectSlug || null,
          swarm_id: result.swarmId || null,
          swarm_creation_mode: result.swarmCreationMode || null,
        },
      },
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[SniparaAdmin] provision error:', error);
    try {
      await appendWorkspaceSniparaProvisioningOperation({
        db: pool,
        workspaceId,
        operation: {
          kind: 'reconcile',
          status: 'error',
          summary: error.message || 'Snipara provisioning failed.',
          actor_user_id: req.user?.id || null,
          actor_email: req.user?.email || null,
          details: {
            error: error.message || 'Unknown error',
          },
        },
      });
    } catch (logError) {
      console.warn('[SniparaAdmin] failed to log provisioning error:', logError.message);
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
module.exports.__private = {
  normalizeToolError,
  normalizeIndexHealthPayload,
  normalizeSearchAnalyticsPayload,
  normalizeHtaskPolicyPayload,
  normalizeHtaskMetricsPayload,
  normalizeSharedTemplatesPayload,
  normalizeSharedCollectionsPayload,
  normalizeSharedUploadsPayload,
  normalizeSharedUploadResultPayload,
  normalizeSharedDocumentInput,
  normalizeProvisioningOperationsPayload,
  normalizeSyncStatusPayload,
  normalizeWebhookEventsPayload,
};
