'use strict';

const express = require('express');
const router = express.Router();

const pool = require('../lib/vaultbrix');
const { readExistingProvisioning, provisionWorkspaceSnipara } = require('../services/sniparaProvisioningService');
const { resolveSniparaConfig, probeSniparaHealth, serializeSniparaError } = require('../services/sniparaResolver');
const { createSniparaGateway } = require('../services/snipara/gateway');

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

router.get('/index-health', async (req, res) => {
  return callAdminSniparaTool(
    req,
    res,
    (gateway) => gateway.analytics.indexHealth({}),
    (payload) => normalizeIndexHealthPayload(payload),
    'Snipara index health is unavailable for this workspace or plan.'
  );
});

router.get('/search-analytics', async (req, res) => {
  const days = Math.max(1, Math.min(90, Number(req.query.days) || 30));
  return callAdminSniparaTool(
    req,
    res,
    (gateway) => gateway.analytics.searchAnalytics({ days }),
    (payload) => normalizeSearchAnalyticsPayload(payload, days),
    'Snipara search analytics is unavailable for this workspace or plan.'
  );
});

router.get('/htask-policy', async (req, res) => {
  return callAdminSniparaTool(
    req,
    res,
    (gateway) => gateway.coordination.htaskPolicyGet({}),
    (payload) => normalizeHtaskPolicyPayload(payload),
    'Snipara htask policy is unavailable for this workspace or plan.'
  );
});

router.get('/htask-metrics', async (req, res) => {
  return callAdminSniparaTool(
    req,
    res,
    (gateway) => gateway.coordination.htaskMetrics({}),
    (payload) => normalizeHtaskMetricsPayload(payload),
    'Snipara htask metrics are unavailable for this workspace or plan.'
  );
});

router.post('/provision', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);

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

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[SniparaAdmin] provision error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
