'use strict';

const pool = require('../lib/vaultbrix');
const {
  assertColumnsExist,
  assertTableExists,
  runtimeSchemaMutationsAllowed,
} = require('../lib/schemaReadiness');

const SCHEMA = 'tenant_vutler';
const NODE_COMMAND_DEFAULT_TTL_MS = Number.parseInt(process.env.NEXUS_COMMAND_TTL_MS || '600000', 10);
const NODE_COMMAND_DEFAULT_LEASE_MS = Number.parseInt(process.env.NEXUS_COMMAND_LEASE_MS || '45000', 10);
const NODE_COMMAND_DEFAULT_MAX_ATTEMPTS = Number.parseInt(process.env.NEXUS_COMMAND_MAX_ATTEMPTS || '3', 10);
const COMMAND_POLL_INTERVAL_MS = 300;
const DEFAULT_WAIT_TIMEOUT_MS = 30000;

const NEXUS_COMMAND_COLUMNS = [
  'id',
  'workspace_id',
  'node_id',
  'command_type',
  'status',
  'payload',
  'progress',
  'result',
  'error',
  'timeout_ms',
  'lease_ms',
  'expires_at',
  'lease_expires_at',
  'attempt_count',
  'max_attempts',
  'created_by_user_id',
  'created_at',
  'started_at',
  'completed_at',
  'updated_at',
];

let nexusCommandsPromise = null;

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function resolveCommandTiming(options = {}) {
  return {
    timeoutMs: clampInteger(options.timeoutMs ?? options.timeout_ms, NODE_COMMAND_DEFAULT_TTL_MS, 100, 30 * 60 * 1000),
    leaseMs: clampInteger(options.leaseMs ?? options.lease_ms, NODE_COMMAND_DEFAULT_LEASE_MS, 100, 10 * 60 * 1000),
    maxAttempts: clampInteger(options.maxAttempts ?? options.max_attempts, NODE_COMMAND_DEFAULT_MAX_ATTEMPTS, 1, 10),
  };
}

async function ensureNexusCommandsTable(db = pool) {
  if (!nexusCommandsPromise) {
    nexusCommandsPromise = (async () => {
      try {
        if (!runtimeSchemaMutationsAllowed()) {
          await assertTableExists(db, SCHEMA, 'nexus_commands', {
            label: 'Nexus commands table',
          });
          await assertColumnsExist(db, SCHEMA, 'nexus_commands', NEXUS_COMMAND_COLUMNS, {
            label: 'Nexus commands table',
          });
          return;
        }

        const check = await db.query(
          `SELECT 1 FROM information_schema.tables WHERE table_schema='tenant_vutler' AND table_name='nexus_commands'`
        );
        if (check.rows.length === 0) {
          await db.query(`
            CREATE TABLE IF NOT EXISTS ${SCHEMA}.nexus_commands (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              workspace_id UUID NOT NULL,
              node_id UUID NOT NULL,
              command_type TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'in_progress', 'completed', 'failed', 'expired')),
              payload JSONB NOT NULL DEFAULT '{}'::jsonb,
              progress JSONB NULL,
              result JSONB NULL,
              error TEXT NULL,
              timeout_ms INTEGER NOT NULL DEFAULT 600000,
              lease_ms INTEGER NOT NULL DEFAULT 45000,
              expires_at TIMESTAMPTZ NULL,
              lease_expires_at TIMESTAMPTZ NULL,
              attempt_count INTEGER NOT NULL DEFAULT 0,
              max_attempts INTEGER NOT NULL DEFAULT 3,
              created_by_user_id UUID NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              started_at TIMESTAMPTZ NULL,
              completed_at TIMESTAMPTZ NULL,
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
          `);
          await db.query(`CREATE INDEX IF NOT EXISTS idx_nexus_commands_node_status ON ${SCHEMA}.nexus_commands (node_id, status, created_at ASC)`);
          await db.query(`CREATE INDEX IF NOT EXISTS idx_nexus_commands_workspace_created ON ${SCHEMA}.nexus_commands (workspace_id, created_at DESC)`);
          await db.query(`CREATE INDEX IF NOT EXISTS idx_nexus_commands_expiry ON ${SCHEMA}.nexus_commands (workspace_id, node_id, status, expires_at, lease_expires_at)`);
        }
      } catch (err) {
        if (!runtimeSchemaMutationsAllowed()) throw err;
        console.warn('[NEXUS] ensureNexusCommandsTable warning:', err.message);
      }
    })().catch((err) => {
      nexusCommandsPromise = null;
      throw err;
    });
  }

  return nexusCommandsPromise;
}

function buildCommandFilter(workspaceId, { nodeId = null, commandId = null } = {}) {
  const params = [workspaceId];
  const clauses = ['workspace_id = $1'];

  if (nodeId) {
    params.push(nodeId);
    clauses.push(`node_id = $${params.length}::uuid`);
  }
  if (commandId) {
    params.push(commandId);
    clauses.push(`id::text = $${params.length}`);
  }

  return { params, where: clauses.join(' AND ') };
}

async function refreshCommandState(db = pool, workspaceId, filters = {}) {
  await ensureNexusCommandsTable(db);
  const { params, where } = buildCommandFilter(workspaceId, filters);

  await db.query(
    `UPDATE ${SCHEMA}.nexus_commands
        SET status = 'expired',
            error = COALESCE(error, 'Command expired before completion'),
            completed_at = COALESCE(completed_at, NOW()),
            lease_expires_at = NULL,
            updated_at = NOW()
      WHERE ${where}
        AND status IN ('queued', 'in_progress')
        AND expires_at IS NOT NULL
        AND expires_at <= NOW()`,
    params
  );

  await db.query(
    `UPDATE ${SCHEMA}.nexus_commands
        SET status = 'expired',
            error = COALESCE(error, 'Command lease expired after maximum retry attempts'),
            completed_at = COALESCE(completed_at, NOW()),
            lease_expires_at = NULL,
            updated_at = NOW()
      WHERE ${where}
        AND status = 'in_progress'
        AND lease_expires_at IS NOT NULL
        AND lease_expires_at <= NOW()
        AND attempt_count >= max_attempts
        AND (expires_at IS NULL OR expires_at > NOW())`,
    params
  );

  await db.query(
    `UPDATE ${SCHEMA}.nexus_commands
        SET status = 'queued',
            progress = jsonb_build_object(
              'stage', 'requeued',
              'message', 'Previous execution lease expired, command requeued',
              'updatedAt', NOW()
            ),
            lease_expires_at = NULL,
            updated_at = NOW()
      WHERE ${where}
        AND status = 'in_progress'
        AND lease_expires_at IS NOT NULL
        AND lease_expires_at <= NOW()
        AND attempt_count < max_attempts
        AND (expires_at IS NULL OR expires_at > NOW())`,
    params
  );
}

async function enqueueNodeCommand({
  db = pool,
  workspaceId,
  nodeId,
  commandType,
  payload = {},
  userId = null,
  timing = {},
}) {
  await ensureNexusCommandsTable(db);
  const commandTiming = resolveCommandTiming(timing);
  const safeUserId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(userId || ''))
    ? userId
    : null;
  const expiresAt = new Date(Date.now() + commandTiming.timeoutMs).toISOString();
  const inserted = await db.query(
    `INSERT INTO ${SCHEMA}.nexus_commands (
       workspace_id, node_id, command_type, payload, created_by_user_id,
       timeout_ms, lease_ms, expires_at, max_attempts
     )
     VALUES ($1, $2::uuid, $3, $4::jsonb, $5, $6, $7, $8::timestamptz, $9)
     RETURNING id, command_type, status, payload, progress, result, error,
               timeout_ms, lease_ms, expires_at, lease_expires_at, attempt_count, max_attempts,
               created_at, started_at, completed_at, updated_at`,
    [
      workspaceId,
      nodeId,
      commandType,
      JSON.stringify(payload || {}),
      safeUserId,
      commandTiming.timeoutMs,
      commandTiming.leaseMs,
      expiresAt,
      commandTiming.maxAttempts,
    ]
  );
  return inserted.rows[0];
}

async function waitForNodeCommand(db = pool, workspaceId, commandId, timeoutMs = DEFAULT_WAIT_TIMEOUT_MS) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    await refreshCommandState(db, workspaceId, { commandId });
    const result = await db.query(
      `SELECT id, command_type, status, payload, progress, result, error,
              timeout_ms, lease_ms, expires_at, lease_expires_at, attempt_count, max_attempts,
              created_at, started_at, completed_at, updated_at
         FROM ${SCHEMA}.nexus_commands
        WHERE id::text = $1
          AND workspace_id = $2
        LIMIT 1`,
      [commandId, workspaceId]
    );

    const row = result.rows[0];
    if (!row) return null;
    if (row.status === 'completed' || row.status === 'failed' || row.status === 'expired') return row;

    await new Promise((resolve) => setTimeout(resolve, COMMAND_POLL_INTERVAL_MS));
  }

  return null;
}

function mapNodeCommand(row) {
  const payload = row.payload || {};
  const result = row.result || null;
  const progress = row.progress || result?.progress || null;
  const startedAt = row.started_at ? new Date(row.started_at).getTime() : null;
  const completedAt = row.completed_at ? new Date(row.completed_at).getTime() : null;
  const durationMs = startedAt && completedAt ? Math.max(0, completedAt - startedAt) : (progress?.elapsedMs ?? undefined);

  return {
    id: row.id,
    type: row.command_type,
    status: row.status,
    payload,
    progress,
    result: row.status === 'completed' || row.status === 'failed' ? result : undefined,
    error: row.error || undefined,
    attempts: Number(row.attempt_count || 0),
    maxAttempts: Number(row.max_attempts || 0),
    timeoutMs: Number(row.timeout_ms || 0),
    leaseMs: Number(row.lease_ms || 0),
    durationMs,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    leaseExpiresAt: row.lease_expires_at,
    expiresAt: row.expires_at,
    updatedAt: row.updated_at,
  };
}

async function dispatchNodeAction({
  db = pool,
  workspaceId,
  nodeId,
  action,
  args = {},
  userId = null,
  timing = {},
  wait = true,
  waitTimeoutMs = DEFAULT_WAIT_TIMEOUT_MS,
}) {
  const command = await enqueueNodeCommand({
    db,
    workspaceId,
    nodeId,
    commandType: 'dispatch_action',
    payload: { action, args },
    userId,
    timing,
  });

  if (!wait) {
    return { queued: true, command, done: null };
  }

  const done = await waitForNodeCommand(db, workspaceId, command.id, waitTimeoutMs);
  if (!done) {
    return { queued: true, command, done: null };
  }

  return { queued: false, command, done };
}

module.exports = {
  ensureNexusCommandsTable,
  refreshCommandState,
  enqueueNodeCommand,
  waitForNodeCommand,
  mapNodeCommand,
  dispatchNodeAction,
};
