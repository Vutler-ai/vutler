'use strict';

/**
 * Sandbox Service
 *
 * `sandbox_jobs` is the source of truth for queueing and runtime state.
 * `sandbox_executions` remains an audit mirror for compatibility and analytics.
 */

const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const pool = require('../lib/vaultbrix');
const { sendPostalMail } = require('./postalMailer');
const {
  createWorkspaceNotification,
  readWorkspaceNotificationProfile,
} = require('./workspaceNotificationService');
const {
  assertColumnsExist,
  assertTableExists,
  runtimeSchemaMutationsAllowed,
} = require('../lib/schemaReadiness');

const SCHEMA = 'tenant_vutler';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_SYNC_WAIT_MS = 20_000;
const DEFAULT_BATCH_SYNC_WAIT_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 250;
const MAX_OUTPUT_BYTES = 512 * 1024;
const MAX_ANALYTICS_WINDOW_DAYS = 90;
const SANDBOX_ALERT_WINDOW_DAYS = 7;
const SANDBOX_ALERT_COOLDOWN_MINUTES = 180;
const DEFAULT_RUNTIME = process.env.NODE_ENV === 'production' ? 'docker' : 'process';
const DEFAULT_MINIMAL_ENV = {
  PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
  HOME: '/tmp',
  LANG: 'en_US.UTF-8',
};
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'timeout', 'skipped']);

let ensureSchemaPromise = null;
let usersAuthHasDeletedAtColumn = null;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeLanguage(language) {
  const normalized = String(language || '').trim().toLowerCase();
  if (normalized === 'javascript' || normalized === 'js' || normalized === 'node') return 'javascript';
  if (normalized === 'python' || normalized === 'py' || normalized === 'python3') return 'python';
  if (normalized === 'shell' || normalized === 'sh') return 'shell';
  return normalized;
}

function resolveSandboxRuntime() {
  const requested = String(process.env.SANDBOX_RUNTIME || DEFAULT_RUNTIME).trim().toLowerCase();
  if (requested === 'docker' || requested === 'process') return requested;
  return DEFAULT_RUNTIME;
}

function shellExecutionAllowed(runtime) {
  if (process.env.SANDBOX_DISABLE_SHELL === 'false') {
    return runtime === 'docker' || process.env.NODE_ENV !== 'production';
  }
  return false;
}

function getSandboxDockerConfig() {
  return {
    binary: process.env.SANDBOX_DOCKER_BINARY || 'docker',
    network: process.env.SANDBOX_DOCKER_NETWORK || 'none',
    nodeImage: process.env.SANDBOX_DOCKER_NODE_IMAGE || 'node:22-alpine',
    pythonImage: process.env.SANDBOX_DOCKER_PYTHON_IMAGE || 'python:3.12-alpine',
    shellImage: process.env.SANDBOX_DOCKER_SHELL_IMAGE || 'alpine:3.20',
    memory: process.env.SANDBOX_DOCKER_MEMORY || '128m',
    cpus: process.env.SANDBOX_DOCKER_CPUS || '0.50',
    pidsLimit: process.env.SANDBOX_DOCKER_PIDS_LIMIT || '64',
    tmpfsSize: process.env.SANDBOX_DOCKER_TMPFS_SIZE || '64m',
    user: process.env.SANDBOX_DOCKER_USER || '65534:65534',
  };
}

function buildLocalCommand(language, code, runtime) {
  switch (normalizeLanguage(language)) {
    case 'javascript':
      return { cmd: 'node', args: ['-e', code], spawnOptions: {} };
    case 'python':
      return { cmd: 'python3', args: ['-c', code], spawnOptions: {} };
    case 'shell':
      if (!shellExecutionAllowed(runtime)) {
        throw new Error('Shell execution is disabled for security. Use JavaScript or Python.');
      }
      return { cmd: 'sh', args: ['-c', code], spawnOptions: {} };
    default:
      throw new Error(`Unsupported language: ${language}`);
  }
}

function buildDockerCommand(language, code) {
  const docker = getSandboxDockerConfig();
  const baseArgs = [
    'run',
    '--rm',
    '--interactive',
    '--network', docker.network,
    '--read-only',
    '--tmpfs', `/tmp:rw,noexec,nosuid,size=${docker.tmpfsSize}`,
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--pids-limit', String(docker.pidsLimit),
    '--memory', String(docker.memory),
    '--memory-swap', String(docker.memory),
    '--cpus', String(docker.cpus),
    '--workdir', '/tmp',
    '--user', docker.user,
    '--label', 'com.vutler.sandbox=true',
  ];

  switch (normalizeLanguage(language)) {
    case 'javascript':
      return {
        cmd: docker.binary,
        args: [
          ...baseArgs,
          '-e', 'HOME=/tmp',
          '-e', 'LANG=en_US.UTF-8',
          '-e', 'NODE_ENV=production',
          docker.nodeImage,
          'node',
          '--input-type=commonjs',
          '-e',
          code,
        ],
        spawnOptions: {},
      };

    case 'python':
      return {
        cmd: docker.binary,
        args: [
          ...baseArgs,
          '-e', 'HOME=/tmp',
          '-e', 'LANG=en_US.UTF-8',
          '-e', 'PYTHONDONTWRITEBYTECODE=1',
          '-e', 'PYTHONUNBUFFERED=1',
          docker.pythonImage,
          'python3',
          '-c',
          code,
        ],
        spawnOptions: {},
      };

    case 'shell':
      if (!shellExecutionAllowed('docker')) {
        throw new Error('Shell execution is disabled for security. Use JavaScript or Python.');
      }
      return {
        cmd: docker.binary,
        args: [
          ...baseArgs,
          '-e', 'HOME=/tmp',
          '-e', 'LANG=en_US.UTF-8',
          docker.shellImage,
          'sh',
          '-c',
          code,
        ],
        spawnOptions: {},
      };

    default:
      throw new Error(`Unsupported language: ${language}`);
  }
}

function buildExecutionTarget(language, code) {
  const runtime = resolveSandboxRuntime();
  const target = runtime === 'docker'
    ? buildDockerCommand(language, code)
    : buildLocalCommand(language, code, runtime);

  return {
    runtime,
    ...target,
  };
}

async function ensureSandboxSchema(db = pool) {
  if (!ensureSchemaPromise) {
    ensureSchemaPromise = (async () => {
      if (!runtimeSchemaMutationsAllowed()) {
        await assertTableExists(db, SCHEMA, 'sandbox_jobs', { label: 'Sandbox jobs table' });
        await assertTableExists(db, SCHEMA, 'sandbox_executions', { label: 'Sandbox executions table' });
        await assertColumnsExist(
          db,
          SCHEMA,
          'sandbox_executions',
          ['workspace_id', 'duration_ms', 'batch_id', 'batch_index', 'status'],
          { label: 'Sandbox executions table' }
        );
        return;
      }

      await db.query(`
        CREATE TABLE IF NOT EXISTS ${SCHEMA}.sandbox_jobs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          workspace_id UUID NOT NULL,
          agent_id TEXT NULL,
          language TEXT NOT NULL,
          code TEXT NOT NULL,
          timeout_ms INTEGER NOT NULL DEFAULT 30000,
          status TEXT NOT NULL DEFAULT 'pending',
          stdout TEXT NULL,
          stderr TEXT NULL,
          exit_code INTEGER NULL,
          duration_ms INTEGER NULL,
          batch_id UUID NULL,
          batch_index INTEGER NULL,
          stop_on_error BOOLEAN NOT NULL DEFAULT FALSE,
          source TEXT NOT NULL DEFAULT 'api',
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          locked_by TEXT NULL,
          locked_at TIMESTAMPTZ NULL,
          started_at TIMESTAMPTZ NULL,
          finished_at TIMESTAMPTZ NULL,
          error TEXT NULL,
          attempt_count INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.query(`CREATE INDEX IF NOT EXISTS sandbox_jobs_workspace_created_idx ON ${SCHEMA}.sandbox_jobs (workspace_id, created_at DESC)`).catch(() => {});
      await db.query(`CREATE INDEX IF NOT EXISTS sandbox_jobs_status_created_idx ON ${SCHEMA}.sandbox_jobs (status, created_at ASC)`).catch(() => {});
      await db.query(`CREATE INDEX IF NOT EXISTS sandbox_jobs_batch_idx ON ${SCHEMA}.sandbox_jobs (batch_id, batch_index)`).catch(() => {});

      await db.query(`
        CREATE TABLE IF NOT EXISTS ${SCHEMA}.sandbox_executions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          workspace_id UUID,
          agent_id TEXT,
          language TEXT NOT NULL,
          code TEXT NOT NULL,
          stdout TEXT,
          stderr TEXT,
          exit_code INTEGER,
          status TEXT DEFAULT 'pending',
          duration_ms INTEGER,
          batch_id UUID,
          batch_index INTEGER,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      const executionAlterations = [
        `ALTER TABLE ${SCHEMA}.sandbox_executions ADD COLUMN IF NOT EXISTS workspace_id UUID`,
        `ALTER TABLE ${SCHEMA}.sandbox_executions ADD COLUMN IF NOT EXISTS duration_ms INTEGER`,
        `ALTER TABLE ${SCHEMA}.sandbox_executions ADD COLUMN IF NOT EXISTS batch_id UUID`,
        `ALTER TABLE ${SCHEMA}.sandbox_executions ADD COLUMN IF NOT EXISTS batch_index INTEGER`,
        `ALTER TABLE ${SCHEMA}.sandbox_executions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'`,
      ];
      for (const sql of executionAlterations) {
        await db.query(sql).catch(() => {});
      }
    })().catch((err) => {
      ensureSchemaPromise = null;
      throw err;
    });
  }
  return ensureSchemaPromise;
}

function mapSandboxJobRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    execution_id: row.id,
    job_id: row.id,
    workspace_id: row.workspace_id || null,
    agent_id: row.agent_id || null,
    language: row.language,
    code: row.code,
    stdout: row.stdout || null,
    stderr: row.stderr || null,
    exit_code: row.exit_code ?? null,
    status: row.status,
    duration_ms: row.duration_ms ?? null,
    batch_id: row.batch_id || null,
    batch_index: row.batch_index ?? null,
    stop_on_error: Boolean(row.stop_on_error),
    timeout_ms: row.timeout_ms ?? null,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    started_at: row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at || null,
    finished_at: row.finished_at instanceof Date ? row.finished_at.toISOString() : row.finished_at || null,
    error: row.error || null,
    locked_by: row.locked_by || null,
    source: row.source || null,
    metadata: row.metadata || null,
  };
}

function clampAnalyticsDays(days) {
  const parsed = Number(days);
  if (!Number.isFinite(parsed)) return 7;
  return Math.min(Math.max(Math.round(parsed), 1), MAX_ANALYTICS_WINDOW_DAYS);
}

function toIsoOrNull(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function buildSandboxAnalyticsSummary(summary = {}, fallbackReasons = [], days = 7) {
  const total = Number(summary.total || 0);
  const running = Number(summary.running_count || 0);
  const terminal = Number(summary.terminal_total || 0);
  const rlmAttempts = Number(summary.rlm_attempt_count || 0);
  const rlmEffective = Number(summary.rlm_effective_count || 0);
  const nativeEffective = Number(summary.native_effective_count || 0);
  const fallbackCount = Number(summary.fallback_count || 0);
  const failedCount = Number(summary.failed_count || 0);
  const timeoutCount = Number(summary.timeout_count || 0);
  const fallbackRate = rlmAttempts > 0 ? Number((fallbackCount / rlmAttempts).toFixed(4)) : 0;

  let status = 'healthy';
  if ((rlmAttempts >= 3 && fallbackRate >= 0.5) || timeoutCount >= 3) {
    status = 'critical';
  } else if (fallbackCount > 0 || failedCount > 0 || timeoutCount > 0) {
    status = 'degraded';
  }

  const recommendation = status === 'critical'
    ? 'RLM Runtime is falling back too often. Keep the native sandbox as default until the runtime is stabilized.'
    : status === 'degraded'
      ? 'Fallbacks or execution errors were detected. Review the top fallback reasons and recent sandbox runs.'
      : 'Sandbox backend telemetry is healthy for this workspace.';

  return {
    supported: true,
    degraded: status !== 'healthy',
    status,
    days,
    totals: {
      all: total,
      terminal,
      running,
      rlm_attempts: rlmAttempts,
      rlm_effective: rlmEffective,
      native_effective: nativeEffective,
      fallbacks: fallbackCount,
      failed: failedCount,
      timeout: timeoutCount,
    },
    rates: {
      fallback_rate: fallbackRate,
    },
    timestamps: {
      last_fallback_at: toIsoOrNull(summary.last_fallback_at),
      last_rlm_at: toIsoOrNull(summary.last_rlm_at),
      last_execution_at: toIsoOrNull(summary.last_execution_at),
    },
    top_fallback_reasons: fallbackReasons.map((row) => ({
      reason: row.reason || 'unknown',
      count: Number(row.count || 0),
    })),
    recommendation,
  };
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function buildSandboxCriticalAlertPayload(analytics) {
  const fallbackSummary = analytics?.totals?.rlm_attempts
    ? `${analytics.totals.fallbacks} fallback(s) across `
      + `${analytics.totals.rlm_attempts} RLM attempt(s) `
      + `(${formatPercent(analytics.rates?.fallback_rate)})`
    : `${analytics?.totals?.failed || 0} failed and `
      + `${analytics?.totals?.timeout || 0} timeout execution(s)`;
  const topReasons = Array.isArray(analytics?.top_fallback_reasons)
    && analytics.top_fallback_reasons.length > 0
    ? analytics.top_fallback_reasons
      .slice(0, 2)
      .map((entry) => `${entry.reason} (${entry.count})`)
      .join(', ')
    : 'No dominant fallback reason was recorded.';
  const recommendation = analytics?.recommendation
    ? ` ${analytics.recommendation}`
    : '';

  return {
    title: 'Sandbox runtime health is critical',
    message: 'Sandbox telemetry over the last '
      + `${analytics?.days || SANDBOX_ALERT_WINDOW_DAYS} days is critical: `
      + `${fallbackSummary}. Top reasons: ${topReasons}.${recommendation}`,
  };
}

function buildSandboxCriticalPushPayload(analytics) {
  const payload = buildSandboxCriticalAlertPayload(analytics);
  return {
    title: payload.title,
    body: payload.message,
    url: '/sandbox',
    tag: 'sandbox-runtime-critical',
  };
}

async function hasUsersAuthDeletedAtColumn(db = pool) {
  if (typeof usersAuthHasDeletedAtColumn === 'boolean') {
    return usersAuthHasDeletedAtColumn;
  }

  try {
    const result = await db.query(
      `SELECT EXISTS (
         SELECT 1
           FROM information_schema.columns
          WHERE table_schema = $1
            AND table_name = $2
            AND column_name = $3
       ) AS exists`,
      [SCHEMA, 'users_auth', 'deleted_at']
    );
    usersAuthHasDeletedAtColumn = result.rows[0]?.exists === true;
  } catch (_) {
    usersAuthHasDeletedAtColumn = false;
  }

  return usersAuthHasDeletedAtColumn;
}

async function listWorkspaceAdminUserIds(workspaceId, db = pool) {
  if (!workspaceId) return [];

  const activeFilter = (await hasUsersAuthDeletedAtColumn(db))
    ? 'AND deleted_at IS NULL'
    : '';
  const result = await db.query(
    `SELECT id
       FROM ${SCHEMA}.users_auth
      WHERE workspace_id = $1
        AND role = 'admin'
        ${activeFilter}`,
    [workspaceId]
  );

  return result.rows
    .map((row) => String(row.id || '').trim())
    .filter(Boolean);
}

async function sendSandboxHealthPushAlert(workspaceId, analytics, db = pool) {
  const adminUserIds = await listWorkspaceAdminUserIds(workspaceId, db);
  if (adminUserIds.length === 0) {
    return {
      attempted: false,
      reason: 'no_admin_users',
      recipients: 0,
      sent: 0,
      failed: 0,
    };
  }

  let sendPushToUsers;
  try {
    ({ sendPushToUsers } = require('./pushService'));
  } catch (err) {
    return {
      attempted: false,
      reason: 'push_service_unavailable',
      recipients: adminUserIds.length,
      sent: 0,
      failed: adminUserIds.length,
      error: err.message,
    };
  }

  if (typeof sendPushToUsers !== 'function') {
    return {
      attempted: false,
      reason: 'push_service_unavailable',
      recipients: adminUserIds.length,
      sent: 0,
      failed: adminUserIds.length,
    };
  }

  const results = await sendPushToUsers(
    adminUserIds,
    buildSandboxCriticalPushPayload(analytics)
  );

  return results.reduce((acc, result) => {
    if (result.status === 'fulfilled') {
      acc.sent += Number(result.value?.sent || 0);
      acc.failed += Number(result.value?.failed || 0);
      return acc;
    }

    acc.failed += 1;
    return acc;
  }, {
    attempted: true,
    reason: null,
    recipients: adminUserIds.length,
    sent: 0,
    failed: 0,
  });
}

async function createSandboxJob({
  language,
  code,
  agentId = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  workspaceId,
  batchId = null,
  batchIndex = null,
  stopOnError = false,
  source = 'api',
  metadata = null,
}, db = pool) {
  await ensureSandboxSchema(db);
  const result = await db.query(
    `INSERT INTO ${SCHEMA}.sandbox_jobs
       (workspace_id, agent_id, language, code, timeout_ms, status, batch_id, batch_index, stop_on_error, source, metadata)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, COALESCE($10::jsonb, '{}'::jsonb))
     RETURNING *`,
    [
      workspaceId,
      agentId,
      normalizeLanguage(language),
      code,
      timeoutMs,
      batchId,
      batchIndex,
      Boolean(stopOnError),
      source,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );
  return mapSandboxJobRow(result.rows[0]);
}

async function createSandboxBatchJobs(scripts, {
  agentId = null,
  workspaceId,
  stopOnError = true,
  source = 'api',
  metadata = null,
} = {}, db = pool) {
  await ensureSandboxSchema(db);
  const batchId = randomUUID();
  const jobs = [];

  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i];
    jobs.push(await createSandboxJob({
      language: script.language,
      code: script.code,
      agentId,
      timeoutMs: Number.isFinite(script.timeout_ms) ? Number(script.timeout_ms) : DEFAULT_TIMEOUT_MS,
      workspaceId,
      batchId,
      batchIndex: i,
      stopOnError,
      source,
      metadata,
    }, db));
  }

  return jobs;
}

async function getSandboxJob(id, workspaceId, db = pool) {
  await ensureSandboxSchema(db);
  const params = [id];
  const where = ['id = $1'];
  if (workspaceId) {
    params.push(workspaceId);
    where.push(`workspace_id = $${params.length}`);
  }
  const result = await db.query(
    `SELECT *
       FROM ${SCHEMA}.sandbox_jobs
      WHERE ${where.join(' AND ')}
      LIMIT 1`,
    params
  );
  return mapSandboxJobRow(result.rows[0] || null);
}

async function listSandboxJobs({
  workspaceId,
  agentId = null,
  language = null,
  status = null,
  limit = 20,
  offset = 0,
  topLevelOnly = true,
} = {}, db = pool) {
  await ensureSandboxSchema(db);
  const params = [];
  const conditions = [];

  if (workspaceId) {
    params.push(workspaceId);
    conditions.push(`workspace_id = $${params.length}`);
  }
  if (topLevelOnly) {
    conditions.push('batch_id IS NULL');
  }
  if (agentId) {
    params.push(agentId);
    conditions.push(`agent_id = $${params.length}`);
  }
  if (language) {
    params.push(normalizeLanguage(language));
    conditions.push(`language = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const countResult = await db.query(
    `SELECT COUNT(*)::int AS total
       FROM ${SCHEMA}.sandbox_jobs
       ${where}`,
    params
  );

  params.push(limit, offset);
  const result = await db.query(
    `SELECT *
       FROM ${SCHEMA}.sandbox_jobs
       ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    executions: result.rows.map(mapSandboxJobRow),
    total: countResult.rows[0]?.total || 0,
  };
}

async function listSandboxBatchJobs(batchId, workspaceId, db = pool) {
  await ensureSandboxSchema(db);
  const params = [batchId];
  const where = ['batch_id = $1'];
  if (workspaceId) {
    params.push(workspaceId);
    where.push(`workspace_id = $${params.length}`);
  }
  const result = await db.query(
    `SELECT *
       FROM ${SCHEMA}.sandbox_jobs
      WHERE ${where.join(' AND ')}
      ORDER BY batch_index ASC, created_at ASC`,
    params
  );
  return result.rows.map(mapSandboxJobRow);
}

async function querySandboxAnalytics({
  workspaceId,
  days = 7,
} = {}, db = pool) {
  await ensureSandboxSchema(db);
  const windowDays = clampAnalyticsDays(days);
  const summaryResult = await db.query(
    `WITH scoped AS (
       SELECT
         status,
         created_at,
         COALESCE(NULLIF(metadata->>'backend_selected', ''), 'native_sandbox') AS backend_selected,
         COALESCE(NULLIF(metadata->>'backend_effective', ''), 'native_sandbox') AS backend_effective,
         COALESCE((metadata->>'used_fallback')::boolean, FALSE) AS used_fallback
       FROM ${SCHEMA}.sandbox_jobs
       WHERE workspace_id = $1
         AND created_at >= NOW() - ($2::int * INTERVAL '1 day')
     )
     SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status IN ('completed', 'failed', 'timeout', 'skipped'))::int AS terminal_total,
       COUNT(*) FILTER (WHERE status IN ('pending', 'running'))::int AS running_count,
       COUNT(*) FILTER (WHERE backend_selected = 'rlm_runtime')::int AS rlm_attempt_count,
       COUNT(*) FILTER (WHERE backend_effective = 'rlm_runtime')::int AS rlm_effective_count,
       COUNT(*) FILTER (WHERE backend_effective = 'native_sandbox')::int AS native_effective_count,
       COUNT(*) FILTER (WHERE used_fallback = TRUE)::int AS fallback_count,
       COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count,
       COUNT(*) FILTER (WHERE status = 'timeout')::int AS timeout_count,
       MAX(created_at) FILTER (WHERE used_fallback = TRUE) AS last_fallback_at,
       MAX(created_at) FILTER (WHERE backend_effective = 'rlm_runtime') AS last_rlm_at,
       MAX(created_at) AS last_execution_at
     FROM scoped`,
    [workspaceId, windowDays]
  );

  const fallbackReasonResult = await db.query(
    `WITH scoped AS (
       SELECT
         COALESCE(NULLIF(metadata->>'fallback_reason', ''), 'unknown') AS fallback_reason
       FROM ${SCHEMA}.sandbox_jobs
       WHERE workspace_id = $1
         AND created_at >= NOW() - ($2::int * INTERVAL '1 day')
         AND COALESCE((metadata->>'used_fallback')::boolean, FALSE) = TRUE
     )
     SELECT fallback_reason AS reason, COUNT(*)::int AS count
       FROM scoped
      GROUP BY fallback_reason
      ORDER BY count DESC, fallback_reason ASC
      LIMIT 5`,
    [workspaceId, windowDays]
  );

  return buildSandboxAnalyticsSummary(
    summaryResult.rows[0] || {},
    fallbackReasonResult.rows || [],
    windowDays
  );
}

async function emitSandboxHealthNotification(workspaceId, db = pool) {
  if (!workspaceId) return null;

  const notificationProfile = await readWorkspaceNotificationProfile(workspaceId, '', db).catch(() => null);
  if (!notificationProfile?.settings?.sandbox_alert) return null;

  const analytics = await querySandboxAnalytics({
    workspaceId,
    days: SANDBOX_ALERT_WINDOW_DAYS,
  }, db);

  if (analytics.status !== 'critical') return null;

  const payload = buildSandboxCriticalAlertPayload(analytics);
  const notification = await createWorkspaceNotification({
    workspaceId,
    type: 'error',
    title: payload.title,
    message: payload.message,
    cooldownMinutes: SANDBOX_ALERT_COOLDOWN_MINUTES,
  }, db);

  if (!notification) return null;

  const delivery = {
    email: {
      attempted: false,
      success: false,
      skipped: false,
      error: null,
    },
    push: {
      attempted: false,
      reason: 'not_attempted',
      recipients: 0,
      sent: 0,
      failed: 0,
    },
  };

  const notificationEmail = String(notificationProfile.email || '').trim();
  if (notificationEmail) {
    delivery.email.attempted = true;
    const emailDelivery = await sendPostalMail({
      to: notificationEmail,
      subject: payload.title,
      plain_body: payload.message,
    }).catch((err) => ({
      success: false,
      error: err.message,
    }));

    if (emailDelivery?.success) {
      delivery.email.success = true;
    } else {
      delivery.email.skipped = Boolean(emailDelivery?.skipped);
      delivery.email.error = emailDelivery?.error || emailDelivery?.reason || 'unknown email delivery failure';
    }

    if (emailDelivery?.success === false || emailDelivery?.skipped) {
      console.warn(
        '[sandbox] critical alert email skipped:',
        emailDelivery.error || emailDelivery.reason || 'unknown email delivery failure'
      );
    }
  }

  delivery.push = await sendSandboxHealthPushAlert(workspaceId, analytics, db).catch((err) => ({
    attempted: false,
    reason: 'push_delivery_error',
    recipients: 0,
    sent: 0,
    failed: 0,
    error: err.message,
  }));

  if (delivery.push.reason && delivery.push.reason !== 'no_admin_users' && delivery.push.reason !== 'not_attempted') {
    console.warn('[sandbox] critical alert push skipped:', delivery.push.error || delivery.push.reason);
  }

  return {
    ...notification,
    delivery,
  };
}

async function awaitSandboxJob(id, {
  workspaceId,
  maxWaitMs = DEFAULT_SYNC_WAIT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
} = {}, db = pool) {
  const deadline = Date.now() + Math.max(0, maxWaitMs || 0);
  let latest = await getSandboxJob(id, workspaceId, db);
  while (latest && !TERMINAL_STATUSES.has(latest.status) && Date.now() < deadline) {
    await sleep(pollIntervalMs);
    latest = await getSandboxJob(id, workspaceId, db);
  }
  return latest;
}

async function awaitSandboxBatch(batchId, {
  workspaceId,
  maxWaitMs = DEFAULT_BATCH_SYNC_WAIT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
} = {}, db = pool) {
  const deadline = Date.now() + Math.max(0, maxWaitMs || 0);
  let jobs = await listSandboxBatchJobs(batchId, workspaceId, db);
  while (jobs.length > 0 && jobs.some((job) => !TERMINAL_STATUSES.has(job.status)) && Date.now() < deadline) {
    await sleep(pollIntervalMs);
    jobs = await listSandboxBatchJobs(batchId, workspaceId, db);
  }
  return jobs;
}

async function upsertSandboxExecutionMirror(job, db = pool) {
  if (!job?.id) return;
  await ensureSandboxSchema(db);
  await db.query(
    `INSERT INTO ${SCHEMA}.sandbox_executions
       (id, workspace_id, agent_id, language, code, stdout, stderr, exit_code, status, duration_ms, batch_id, batch_index, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13::timestamptz, NOW()))
     ON CONFLICT (id) DO UPDATE SET
       workspace_id = EXCLUDED.workspace_id,
       agent_id = EXCLUDED.agent_id,
       language = EXCLUDED.language,
       code = EXCLUDED.code,
       stdout = EXCLUDED.stdout,
       stderr = EXCLUDED.stderr,
       exit_code = EXCLUDED.exit_code,
       status = EXCLUDED.status,
       duration_ms = EXCLUDED.duration_ms,
       batch_id = EXCLUDED.batch_id,
       batch_index = EXCLUDED.batch_index`,
    [
      job.id,
      job.workspace_id || null,
      job.agent_id || null,
      job.language,
      job.code,
      job.stdout || null,
      job.stderr || null,
      job.exit_code ?? null,
      job.status,
      job.duration_ms ?? null,
      job.batch_id || null,
      job.batch_index ?? null,
      job.created_at || null,
    ]
  );
}

async function claimPendingSandboxJobs({
  workerId,
  limit = 1,
} = {}, db = pool) {
  await ensureSandboxSchema(db);
  const result = await db.query(
    `WITH candidate AS (
       SELECT job.id
         FROM ${SCHEMA}.sandbox_jobs job
        WHERE job.status = 'pending'
          AND (
            job.batch_id IS NULL
            OR (
              NOT EXISTS (
                SELECT 1
                  FROM ${SCHEMA}.sandbox_jobs prev
                 WHERE prev.batch_id = job.batch_id
                   AND COALESCE(prev.batch_index, -1) < COALESCE(job.batch_index, -1)
                   AND prev.status IN ('pending', 'running')
              )
              AND NOT (
                job.stop_on_error = TRUE
                AND EXISTS (
                  SELECT 1
                    FROM ${SCHEMA}.sandbox_jobs prev
                   WHERE prev.batch_id = job.batch_id
                     AND COALESCE(prev.batch_index, -1) < COALESCE(job.batch_index, -1)
                     AND prev.status IN ('failed', 'timeout')
                )
              )
            )
          )
        ORDER BY job.created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE ${SCHEMA}.sandbox_jobs job
        SET status = 'running',
            started_at = COALESCE(job.started_at, NOW()),
            locked_at = NOW(),
            locked_by = $2,
            attempt_count = COALESCE(job.attempt_count, 0) + 1
       FROM candidate
      WHERE job.id = candidate.id
      RETURNING job.*`,
    [Math.max(1, limit), workerId || `sandbox-worker:${process.pid}`]
  );

  const jobs = result.rows;
  for (const job of jobs) {
    await upsertSandboxExecutionMirror(job, db).catch(() => {});
  }
  return jobs.map(mapSandboxJobRow);
}

async function updateSandboxJob(jobId, updates = {}, db = pool) {
  await ensureSandboxSchema(db);
  const fields = [];
  const params = [jobId];

  const assign = (column, value) => {
    params.push(value);
    fields.push(`${column} = $${params.length}`);
  };

  if (updates.stdout !== undefined) assign('stdout', updates.stdout);
  if (updates.stderr !== undefined) assign('stderr', updates.stderr);
  if (updates.exit_code !== undefined) assign('exit_code', updates.exit_code);
  if (updates.status !== undefined) assign('status', updates.status);
  if (updates.duration_ms !== undefined) assign('duration_ms', updates.duration_ms);
  if (updates.error !== undefined) assign('error', updates.error);
  if (updates.locked_by !== undefined) assign('locked_by', updates.locked_by);
  if (updates.locked_at !== undefined) assign('locked_at', updates.locked_at);
  if (updates.started_at !== undefined) assign('started_at', updates.started_at);
  if (updates.finished_at !== undefined) assign('finished_at', updates.finished_at);
  if (updates.metadata !== undefined) {
    params.push(JSON.stringify(updates.metadata || {}));
    fields.push(`metadata = COALESCE(metadata, '{}'::jsonb) || $${params.length}::jsonb`);
  }

  if (fields.length === 0) {
    return getSandboxJob(jobId, null, db);
  }

  const result = await db.query(
    `UPDATE ${SCHEMA}.sandbox_jobs
        SET ${fields.join(', ')}
      WHERE id = $1
      RETURNING *`,
    params
  );
  const mapped = mapSandboxJobRow(result.rows[0] || null);
  if (mapped) {
    await upsertSandboxExecutionMirror(result.rows[0], db).catch(() => {});
    if (mapped.workspace_id && TERMINAL_STATUSES.has(mapped.status)) {
      await emitSandboxHealthNotification(mapped.workspace_id, db).catch((err) => {
        console.warn('[sandbox] critical alert skipped:', err.message);
      });
    }
  }
  return mapped;
}

async function skipPendingBatchJobs(batchId, failedIndex, db = pool) {
  if (!batchId) return [];
  await ensureSandboxSchema(db);
  const result = await db.query(
    `UPDATE ${SCHEMA}.sandbox_jobs
        SET status = 'skipped',
            finished_at = NOW(),
            duration_ms = 0,
            stderr = COALESCE(stderr, 'Skipped because an earlier batch step failed.'),
            error = COALESCE(error, 'Skipped because an earlier batch step failed.'),
            locked_at = NULL,
            locked_by = NULL
      WHERE batch_id = $1
        AND COALESCE(batch_index, -1) > $2
        AND status = 'pending'
      RETURNING *`,
    [batchId, failedIndex]
  );
  for (const row of result.rows) {
    await upsertSandboxExecutionMirror(row, db).catch(() => {});
  }
  return result.rows.map(mapSandboxJobRow);
}

function buildExecutionResultRecord(job, directResult, durationMs) {
  const stderr = directResult.stderr || '';
  const status = directResult.timedOut
    ? 'timeout'
    : directResult.exitCode === 0
      ? 'completed'
      : 'failed';

  return {
    id: job.id,
    workspace_id: job.workspace_id || null,
    agent_id: job.agent_id || null,
    language: job.language,
    code: job.code,
    stdout: directResult.stdout || null,
    stderr: stderr || null,
    exit_code: directResult.exitCode,
    status,
    duration_ms: durationMs,
    batch_id: job.batch_id || null,
    batch_index: job.batch_index ?? null,
    created_at: job.created_at || new Date().toISOString(),
    started_at: job.started_at || new Date().toISOString(),
    finished_at: new Date().toISOString(),
    error: status === 'failed' || status === 'timeout'
      ? (stderr || `Sandbox execution ${status}.`)
      : null,
  };
}

async function runCommand(cmd, args, timeoutMs, spawnOptions = {}) {
  return new Promise((resolve, reject) => {
    let stdoutBuf = '';
    let stderrBuf = '';
    let timedOut = false;
    let settled = false;

    const child = spawn(cmd, args, {
      shell: false,
      env: spawnOptions.env || DEFAULT_MINIMAL_ENV,
      cwd: spawnOptions.cwd || '/tmp',
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch (_) {
          // Process may have exited cleanly before the hard kill.
        }
      }, 2000);
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      if (stdoutBuf.length < MAX_OUTPUT_BYTES) {
        stdoutBuf += chunk.toString('utf8');
        if (stdoutBuf.length > MAX_OUTPUT_BYTES) {
          stdoutBuf = `${stdoutBuf.slice(0, MAX_OUTPUT_BYTES)}\n[output truncated]`;
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      if (stderrBuf.length < MAX_OUTPUT_BYTES) {
        stderrBuf += chunk.toString('utf8');
        if (stderrBuf.length > MAX_OUTPUT_BYTES) {
          stderrBuf = `${stderrBuf.slice(0, MAX_OUTPUT_BYTES)}\n[output truncated]`;
        }
      }
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: stdoutBuf,
        stderr: stderrBuf,
        exitCode: code ?? (timedOut ? 124 : -1),
        timedOut,
      });
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (resolveSandboxRuntime() === 'docker' && err.code === 'ENOENT') {
        reject(new Error('Sandbox Docker runtime is unavailable. Install docker CLI and expose the Docker socket to the sandbox worker runtime.'));
        return;
      }
      reject(err);
    });
  });
}

async function runSandboxDirect(language, code, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const { runtime, cmd, args, spawnOptions } = buildExecutionTarget(language, code);
  const result = await runCommand(cmd, args, timeoutMs, spawnOptions);
  if (runtime === 'docker' && result.exitCode === -1 && !result.stderr) {
    result.stderr = 'Sandbox container execution failed';
  }
  return result;
}

async function executeSandboxJob(job, { workerId: _workerId = null } = {}, db = pool) {
  if (!job?.id) throw new Error('Sandbox job requires an id.');
  const rawJob = await getSandboxJob(job.id, job.workspace_id || null, db);
  const startedAt = Date.now();

  try {
    const directResult = await runSandboxDirect(rawJob.language, rawJob.code, rawJob.timeout_ms || DEFAULT_TIMEOUT_MS);
    const update = buildExecutionResultRecord(rawJob, directResult, Date.now() - startedAt);
    const finalized = await updateSandboxJob(rawJob.id, {
      stdout: update.stdout,
      stderr: update.stderr,
      exit_code: update.exit_code,
      status: update.status,
      duration_ms: update.duration_ms,
      error: update.error,
      locked_at: null,
      locked_by: null,
      finished_at: update.finished_at,
    }, db);

    if (rawJob.batch_id && rawJob.stop_on_error && (finalized.status === 'failed' || finalized.status === 'timeout')) {
      await skipPendingBatchJobs(rawJob.batch_id, rawJob.batch_index ?? -1, db);
    }

    return finalized;
  } catch (err) {
    const finalized = await updateSandboxJob(rawJob.id, {
      stderr: err.message || 'Sandbox execution failed.',
      exit_code: -1,
      status: 'failed',
      duration_ms: Date.now() - startedAt,
      error: err.message || 'Sandbox execution failed.',
      locked_at: null,
      locked_by: null,
      finished_at: new Date().toISOString(),
    }, db);

    if (rawJob.batch_id && rawJob.stop_on_error) {
      await skipPendingBatchJobs(rawJob.batch_id, rawJob.batch_index ?? -1, db);
    }

    return finalized;
  }
}

function computeSyncWaitWindow(timeoutMs, maxWaitMs, fallback) {
  if (Number.isFinite(maxWaitMs)) return Math.max(1_000, Number(maxWaitMs));
  return Math.min((Number(timeoutMs) || fallback) + 5_000, fallback);
}

async function executeInSandbox(language, code, agentId = null, timeoutMs = DEFAULT_TIMEOUT_MS, opts = {}) {
  const {
    workspaceId = null,
    batchId = null,
    batchIndex = null,
    stopOnError = false,
    source = 'api',
    metadata = null,
    waitForCompletion = true,
    maxWaitMs = null,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    throwOnWaitTimeout = true,
  } = opts;

  const job = await createSandboxJob({
    language,
    code,
    agentId,
    timeoutMs,
    workspaceId,
    batchId,
    batchIndex,
    stopOnError,
    source,
    metadata,
  });

  if (!waitForCompletion) return job;

  const settled = await awaitSandboxJob(job.id, {
    workspaceId,
    maxWaitMs: computeSyncWaitWindow(timeoutMs, maxWaitMs, DEFAULT_SYNC_WAIT_MS),
    pollIntervalMs,
  });

  if (settled && TERMINAL_STATUSES.has(settled.status)) return settled;
  if (throwOnWaitTimeout) {
    throw new Error('Sandbox job did not complete within the synchronous wait window.');
  }
  return settled || job;
}

async function executeBatch(scripts, {
  stopOnError = true,
  agentId = null,
  workspaceId = null,
  waitForCompletion = true,
  maxWaitMs = null,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  source = 'api',
  metadata = null,
} = {}) {
  const jobs = await createSandboxBatchJobs(scripts, {
    agentId,
    workspaceId,
    stopOnError,
    source,
    metadata,
  });

  if (!waitForCompletion || jobs.length === 0) return jobs;

  const batchId = jobs[0].batch_id;
  const totalTimeout = scripts.reduce((sum, script) => {
    const timeout = Number.isFinite(script.timeout_ms) ? Number(script.timeout_ms) : DEFAULT_TIMEOUT_MS;
    return sum + timeout;
  }, 0);
  const settled = await awaitSandboxBatch(batchId, {
    workspaceId,
    maxWaitMs: computeSyncWaitWindow(totalTimeout, maxWaitMs, DEFAULT_BATCH_SYNC_WAIT_MS),
    pollIntervalMs,
  });
  return settled.length > 0 ? settled : jobs;
}

module.exports = {
  ensureSandboxSchema,
  createSandboxJob,
  createSandboxBatchJobs,
  getSandboxJob,
  listSandboxJobs,
  querySandboxAnalytics,
  listSandboxBatchJobs,
  awaitSandboxJob,
  awaitSandboxBatch,
  claimPendingSandboxJobs,
  updateSandboxJob,
  executeSandboxJob,
  executeInSandbox,
  executeBatch,
  __private: {
    TERMINAL_STATUSES,
    normalizeLanguage,
    resolveSandboxRuntime,
    shellExecutionAllowed,
    getSandboxDockerConfig,
    buildExecutionTarget,
    buildDockerCommand,
    buildLocalCommand,
    runCommand,
    runSandboxDirect,
    mapSandboxJobRow,
    upsertSandboxExecutionMirror,
    updateSandboxJob,
    skipPendingBatchJobs,
    computeSyncWaitWindow,
    buildSandboxCriticalAlertPayload,
    buildSandboxCriticalPushPayload,
    emitSandboxHealthNotification,
    hasUsersAuthDeletedAtColumn,
    listWorkspaceAdminUserIds,
    sendSandboxHealthPushAlert,
  },
};
