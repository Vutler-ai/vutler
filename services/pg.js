'use strict';

/**
 * services/pg.js — Multi-tenant PostgreSQL helpers
 * Provides workspace-scoped query helpers, transactions, quota checks, and audit logging.
 */

let _pool;
function getPool() {
  if (_pool) return _pool;
  try { _pool = require('../lib/postgres').pool; return _pool; } catch (e) {}
  try { _pool = require('../lib/vaultbrix'); return _pool; } catch (e) {}
  throw new Error('[services/pg] No database pool available. Set DATABASE_URL or VUTLER_DB_URL.');
}

/**
 * Run a callback inside a PostgreSQL transaction.
 * The callback receives the pg client.
 * @param {string} workspaceId
 * @param {function(client): Promise<any>} fn
 * @returns {Promise<any>}
 */
async function transactionWithWorkspace(workspaceId, fn) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Execute a single query scoped to a workspace.
 * @param {string} workspaceId
 * @param {string} text  SQL query text
 * @param {Array}  params  Query parameters
 * @returns {Promise<{rows: any[], rowCount: number}>}
 */
async function queryWithWorkspace(workspaceId, text, params) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('SET search_path TO tenant_vutler, public');
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

/**
 * Check whether a workspace is within its plan limits.
 * Returns an object with { allowed, usage, percentages, error? }
 * @param {string} workspaceId
 * @param {string} plan
 * @returns {Promise<object>}
 */
async function checkWorkspaceLimits(workspaceId, plan) {
  try {
    const pool = getPool();

    // Count agents
    const agentsRes = await pool.query(
      "SELECT COUNT(*) AS cnt FROM agents WHERE workspace_id = $1",
      [workspaceId]
    ).catch(() => ({ rows: [{ cnt: 0 }] }));

    // Token usage for current month
    let tokenCount = 0;
    for (const query of [
      `SELECT COALESCE(SUM(tokens_input + tokens_output), 0) AS cnt
         FROM llm_usage_logs
        WHERE workspace_id = $1
          AND created_at >= date_trunc('month', NOW())`,
      `SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS cnt
         FROM usage_logs
        WHERE workspace_id = $1
          AND created_at >= date_trunc('month', NOW())`,
      `SELECT COALESCE(SUM(tokens_used), 0) AS cnt
         FROM token_usage
        WHERE workspace_id = $1
          AND created_at >= date_trunc('month', NOW())`,
    ]) {
      try {
        const result = await pool.query(query, [workspaceId]);
        tokenCount = parseInt(result.rows[0]?.cnt || 0, 10);
        if (tokenCount > 0) break;
      } catch (_) {
        continue;
      }
    }

    // Storage usage (bytes)
    const storageRes = await pool.query(
      "SELECT COALESCE(SUM(size_bytes), 0) AS cnt FROM drive_files WHERE workspace_id = $1",
      [workspaceId]
    ).catch(() => ({ rows: [{ cnt: 0 }] }));

    // Social posts usage for current month
    const socialPostsRes = await pool.query(
      `SELECT COUNT(*) AS cnt FROM social_posts_usage
       WHERE workspace_id = $1 AND created_at >= date_trunc('month', NOW())`,
      [workspaceId]
    ).catch(() => ({ rows: [{ cnt: 0 }] }));

    const agentCount     = parseInt(agentsRes.rows[0].cnt, 10);
    const storageBytes   = parseInt(storageRes.rows[0].cnt, 10);
    const socialPosts    = parseInt(socialPostsRes.rows[0].cnt, 10);

    // Plan limits — these mirror the values in featureGate.js
    const LIMITS = {
      free:       { agents: 3,   tokens_month: 50000,    storage_gb: 1,    social_posts_month: 0 },
      starter:    { agents: 10,  tokens_month: 500000,   storage_gb: 10,   social_posts_month: 10 },
      pro:        { agents: 50,  tokens_month: 5000000,  storage_gb: 100,  social_posts_month: 50 },
      enterprise: { agents: 500, tokens_month: 50000000, storage_gb: 1000, social_posts_month: 500 },
    };
    const limits = LIMITS[plan] || LIMITS.free;
    const storageGb = storageBytes / (1024 ** 3);

    const usage = {
      agents:       agentCount,
      tokens:       tokenCount,
      storage:      storageGb,
      social_posts: socialPosts,
    };

    const percentages = {
      agents:       limits.agents            ? Math.round((agentCount  / limits.agents) * 100) : 0,
      tokens:       limits.tokens_month      ? Math.round((tokenCount  / limits.tokens_month) * 100) : 0,
      storage:      limits.storage_gb        ? Math.round((storageGb   / limits.storage_gb)   * 100) : 0,
      social_posts: limits.social_posts_month ? Math.round((socialPosts / limits.social_posts_month) * 100) : 0,
    };

    const allowed = {
      agents:       agentCount   < limits.agents,
      tokens:       tokenCount   < limits.tokens_month,
      storage:      storageGb    < limits.storage_gb,
      social_posts: limits.social_posts_month <= 0 ? false : socialPosts < limits.social_posts_month,
    };

    return { allowed, usage, percentages };
  } catch (err) {
    return { allowed: { agents: true, tokens: true, storage: true }, usage: {}, percentages: {}, error: err.message };
  }
}

/**
 * Write an audit log entry.
 * @param {string|null} agentId
 * @param {string} action
 * @param {object} details
 * @param {string} workspaceId
 */
async function auditLog(agentId, action, details, workspaceId) {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO audit_logs (agent_id, action, details, workspace_id, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [agentId || null, action, JSON.stringify(details || {}), workspaceId || null]
    );
  } catch (err) {
    // Audit logging must never crash the caller
    console.error('[services/pg] auditLog error:', err.message);
  }
}

module.exports = { transactionWithWorkspace, queryWithWorkspace, checkWorkspaceLimits, auditLog, getPool };
