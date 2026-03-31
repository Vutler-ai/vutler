const pool = require('../lib/vaultbrix');

const SCHEMA = 'tenant_vutler';

let ensurePromise = null;

function normalizeStatus(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function mapApproval(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    nodeId: row.node_id,
    commandId: row.command_id,
    executionCommandId: row.execution_command_id,
    status: row.status,
    requestType: row.request_type,
    title: row.title,
    summary: row.summary,
    profileKey: row.profile_key,
    agentId: row.agent_id,
    governance: row.governance || {},
    requestPayload: row.request_payload || {},
    scopeKey: row.scope_key || null,
    scopeMode: row.scope_mode || null,
    scopeExpiresAt: row.scope_expires_at || null,
    resolutionComment: row.resolution_comment || null,
    resolvedByUserId: row.resolved_by_user_id || null,
    resolvedByName: row.resolved_by_name || null,
    requestedAt: row.requested_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAudit(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    nodeId: row.node_id,
    commandId: row.command_id,
    approvalId: row.approval_id,
    agentId: row.agent_id,
    profileKey: row.profile_key,
    requestType: row.request_type,
    eventType: row.event_type,
    decision: row.decision,
    outcomeStatus: row.outcome_status,
    message: row.message,
    payload: row.payload || {},
    createdAt: row.created_at,
  };
}

async function ensureGovernanceTables() {
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.nexus_enterprise_approval_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL,
        node_id UUID NOT NULL,
        command_id UUID NULL,
        execution_command_id UUID NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        request_type TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NULL,
        profile_key TEXT NULL,
        agent_id TEXT NULL,
        governance JSONB NOT NULL DEFAULT '{}'::jsonb,
        request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        scope_key TEXT NULL,
        scope_mode TEXT NULL,
        scope_expires_at TIMESTAMPTZ NULL,
        resolution_comment TEXT NULL,
        resolved_by_user_id UUID NULL,
        resolved_by_name TEXT NULL,
        requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_nexus_ent_approvals_node_status ON ${SCHEMA}.nexus_enterprise_approval_requests (workspace_id, node_id, status, requested_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_nexus_ent_approvals_command ON ${SCHEMA}.nexus_enterprise_approval_requests (workspace_id, command_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_nexus_ent_approvals_scope ON ${SCHEMA}.nexus_enterprise_approval_requests (workspace_id, node_id, scope_key, status, scope_expires_at)`);
    await pool.query(`ALTER TABLE ${SCHEMA}.nexus_enterprise_approval_requests ADD COLUMN IF NOT EXISTS scope_key TEXT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE ${SCHEMA}.nexus_enterprise_approval_requests ADD COLUMN IF NOT EXISTS scope_mode TEXT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE ${SCHEMA}.nexus_enterprise_approval_requests ADD COLUMN IF NOT EXISTS scope_expires_at TIMESTAMPTZ NULL`).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.nexus_enterprise_audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL,
        node_id UUID NOT NULL,
        command_id UUID NULL,
        approval_id UUID NULL,
        agent_id TEXT NULL,
        profile_key TEXT NULL,
        request_type TEXT NULL,
        event_type TEXT NOT NULL,
        decision TEXT NULL,
        outcome_status TEXT NULL,
        message TEXT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_nexus_ent_audit_node_created ON ${SCHEMA}.nexus_enterprise_audit_log (workspace_id, node_id, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_nexus_ent_audit_command ON ${SCHEMA}.nexus_enterprise_audit_log (workspace_id, command_id, created_at DESC)`);
  })().catch((error) => {
    ensurePromise = null;
    throw error;
  });

  return ensurePromise;
}

async function createApprovalRequest(input = {}) {
  await ensureGovernanceTables();
  const result = await pool.query(
    `INSERT INTO ${SCHEMA}.nexus_enterprise_approval_requests (
       workspace_id, node_id, command_id, status, request_type, title, summary,
       profile_key, agent_id, governance, request_payload, scope_key, scope_mode, scope_expires_at
     )
     VALUES ($1, $2::uuid, $3::uuid, 'pending', $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13::timestamptz)
     RETURNING *`,
    [
      input.workspaceId,
      input.nodeId,
      input.commandId || null,
      input.requestType,
      input.title,
      input.summary || null,
      input.profileKey || null,
      input.agentId || null,
      JSON.stringify(input.governance || {}),
      JSON.stringify(input.requestPayload || {}),
      input.scopeKey || null,
      input.scopeMode || null,
      input.scopeExpiresAt || null,
    ]
  );
  return mapApproval(result.rows[0]);
}

async function listApprovalRequests(workspaceId, nodeId, options = {}) {
  await ensureGovernanceTables();
  const params = [workspaceId, nodeId];
  let sql = `SELECT *
               FROM ${SCHEMA}.nexus_enterprise_approval_requests
              WHERE workspace_id = $1
                AND node_id = $2::uuid`;

  if (options.status) {
    params.push(options.status);
    sql += ` AND status = $${params.length}`;
  }

  params.push(Math.max(1, Math.min(100, Number.parseInt(String(options.limit || '25'), 10) || 25)));
  sql += ` ORDER BY requested_at DESC LIMIT $${params.length}`;

  const result = await pool.query(sql, params);
  return result.rows.map(mapApproval);
}

async function getApprovalRequest(workspaceId, nodeId, approvalId) {
  await ensureGovernanceTables();
  const result = await pool.query(
    `SELECT *
       FROM ${SCHEMA}.nexus_enterprise_approval_requests
      WHERE workspace_id = $1
        AND node_id = $2::uuid
        AND id = $3::uuid
      LIMIT 1`,
    [workspaceId, nodeId, approvalId]
  );
  return mapApproval(result.rows[0]);
}

async function resolveApprovalRequest(input = {}) {
  await ensureGovernanceTables();
  const status = normalizeStatus(input.status, ['approved', 'rejected'], 'rejected');
  const result = await pool.query(
    `UPDATE ${SCHEMA}.nexus_enterprise_approval_requests
        SET status = $4,
            resolution_comment = $5,
            resolved_by_user_id = $6,
            resolved_by_name = $7,
            scope_key = COALESCE($8, scope_key),
            scope_mode = COALESCE($9, scope_mode),
            scope_expires_at = COALESCE($10::timestamptz, scope_expires_at),
            resolved_at = NOW(),
            updated_at = NOW()
      WHERE workspace_id = $1
        AND node_id = $2::uuid
        AND id = $3::uuid
        AND status = 'pending'
      RETURNING *`,
    [
      input.workspaceId,
      input.nodeId,
      input.approvalId,
      status,
      input.resolutionComment || null,
      input.resolvedByUserId || null,
      input.resolvedByName || null,
      input.scopeKey || null,
      input.scopeMode || null,
      input.scopeExpiresAt || null,
    ]
  );
  return mapApproval(result.rows[0]);
}

async function markApprovalExecution(input = {}) {
  await ensureGovernanceTables();
  const status = normalizeStatus(input.status, ['approved', 'executed', 'failed'], 'approved');
  const result = await pool.query(
    `UPDATE ${SCHEMA}.nexus_enterprise_approval_requests
        SET status = $4,
            execution_command_id = COALESCE($5::uuid, execution_command_id),
            updated_at = NOW()
      WHERE workspace_id = $1
        AND node_id = $2::uuid
        AND id = $3::uuid
      RETURNING *`,
    [
      input.workspaceId,
      input.nodeId,
      input.approvalId,
      status,
      input.executionCommandId || null,
    ]
  );
  return mapApproval(result.rows[0]);
}

async function findActiveApprovalScope(workspaceId, nodeId, scopeKey) {
  await ensureGovernanceTables();
  if (!scopeKey) return null;
  const result = await pool.query(
    `SELECT *
       FROM ${SCHEMA}.nexus_enterprise_approval_requests
      WHERE workspace_id = $1
        AND node_id = $2::uuid
        AND scope_key = $3
        AND scope_mode = 'process'
        AND status IN ('approved', 'executed')
        AND (scope_expires_at IS NULL OR scope_expires_at > NOW())
      ORDER BY resolved_at DESC NULLS LAST, requested_at DESC
      LIMIT 1`,
    [workspaceId, nodeId, scopeKey]
  );
  return mapApproval(result.rows[0]);
}

async function revokeApprovalScope(input = {}) {
  await ensureGovernanceTables();
  const result = await pool.query(
    `UPDATE ${SCHEMA}.nexus_enterprise_approval_requests
        SET scope_expires_at = NOW(),
            updated_at = NOW()
      WHERE workspace_id = $1
        AND node_id = $2::uuid
        AND id = $3::uuid
      RETURNING *`,
    [input.workspaceId, input.nodeId, input.approvalId]
  );
  return mapApproval(result.rows[0]);
}

async function createAuditEvent(input = {}) {
  await ensureGovernanceTables();
  const result = await pool.query(
    `INSERT INTO ${SCHEMA}.nexus_enterprise_audit_log (
       workspace_id, node_id, command_id, approval_id, agent_id, profile_key,
       request_type, event_type, decision, outcome_status, message, payload
     )
     VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
     RETURNING *`,
    [
      input.workspaceId,
      input.nodeId,
      input.commandId || null,
      input.approvalId || null,
      input.agentId || null,
      input.profileKey || null,
      input.requestType || null,
      input.eventType,
      input.decision || null,
      input.outcomeStatus || null,
      input.message || null,
      JSON.stringify(input.payload || {}),
    ]
  );
  return mapAudit(result.rows[0]);
}

async function listAuditEvents(workspaceId, nodeId, options = {}) {
  await ensureGovernanceTables();
  const params = [workspaceId, nodeId];
  let sql = `SELECT *
               FROM ${SCHEMA}.nexus_enterprise_audit_log
              WHERE workspace_id = $1
                AND node_id = $2::uuid`;

  if (options.requestType) {
    params.push(options.requestType);
    sql += ` AND request_type = $${params.length}`;
  }

  params.push(Math.max(1, Math.min(200, Number.parseInt(String(options.limit || '50'), 10) || 50)));
  sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;

  const result = await pool.query(sql, params);
  return result.rows.map(mapAudit);
}

module.exports = {
  ensureGovernanceTables,
  createApprovalRequest,
  listApprovalRequests,
  getApprovalRequest,
  resolveApprovalRequest,
  markApprovalExecution,
  findActiveApprovalScope,
  revokeApprovalScope,
  createAuditEvent,
  listAuditEvents,
};
