/**
 * Vaultbrix PostgreSQL Service Layer
 * Shared pool accessor, AES-256-GCM field encryption, and audit logging.
 * S8.3 — Added workspace context for RLS multi-tenant isolation.
 *
 * Encryption format stored as a single string: "ivHex:authTagHex:ciphertextHex"
 */
'use strict';

const crypto = require('crypto');
const { getPool } = require('../lib/postgres');

// ─── Encryption ─────────────────────────────────────────────────────────────
const ALGORITHM = 'aes-256-gcm';
const _rawKey =
  process.env.ENCRYPTION_KEY ||
  process.env.LLM_ENCRYPTION_KEY ||
  process.env.JWT_SECRET ||
  'vutler-default-key-change-me-32b';
// AES-256-GCM needs exactly 32 bytes
const ENC_KEY = Buffer.from(_rawKey.padEnd(32, '0').slice(0, 32), 'utf8');

/**
 * Encrypt plaintext → "ivHex:authTagHex:ciphertextHex"
 * Returns null for falsy input.
 */
function encryptField(plain) {
  if (!plain) return null;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENC_KEY, iv);
  let enc = cipher.update(plain, 'utf8', 'hex');
  enc += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${enc}`;
}

/**
 * Decrypt a value produced by encryptField().
 * Returns null on failure or falsy input.
 */
function decryptField(stored) {
  if (!stored) return null;
  try {
    const [ivHex, tagHex, ciphertext] = stored.split(':');
    const decipher = crypto.createDecipheriv(ALGORITHM, ENC_KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let out = decipher.update(ciphertext, 'hex', 'utf8');
    out += decipher.final('utf8');
    return out;
  } catch (err) {
    console.error('[pg] decryptField error:', err.message);
    return null;
  }
}

// ─── Workspace Context for RLS (S8.3) ────────────────────────────────────────

/**
 * Set workspace context for RLS policies.
 * This must be called at the beginning of each transaction that accesses workspace-isolated data.
 * @param {Object} client - PostgreSQL client (from pool or transaction)
 * @param {string} workspaceId - Workspace ID to set in context
 */
async function setWorkspaceContext(client, workspaceId) {
  try {
    await client.query('SELECT set_workspace_context($1)', [workspaceId || 'default']);
  } catch (err) {
    console.error('[pg] setWorkspaceContext error:', err.message);
    // Non-fatal — continue with query but log the issue
  }
}

/**
 * Execute a query with workspace context.
 * Automatically sets the workspace_id in the session before executing the query.
 * @param {string} workspaceId - Workspace ID for RLS filtering
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<QueryResult>}
 */
async function queryWithWorkspace(workspaceId, query, params = []) {
  const client = await getPool().connect();
  try {
    await setWorkspaceContext(client, workspaceId);
    const result = await client.query(query, params);
    return result;
  } finally {
    client.release();
  }
}

/**
 * Execute multiple queries in a transaction with workspace context.
 * @param {string} workspaceId - Workspace ID for RLS filtering  
 * @param {Function} callback - Function that receives the client and executes queries
 * @returns {Promise<any>} - Returns the callback result
 */
async function transactionWithWorkspace(workspaceId, callback) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setWorkspaceContext(client, workspaceId);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Audit Log ───────────────────────────────────────────────────────────────

/**
 * Write one row to audit_logs.  Non-blocking — errors are swallowed.
 * S8.2: now includes workspace_id for multi-tenant isolation.
 *
 * @param {string|null} agentId
 * @param {string}      action      e.g. 'llm_config.update'
 * @param {object}      details     JSON-serialisable payload
 * @param {string}      workspaceId defaults to 'default'
 */
async function auditLog(agentId, action, details = {}, workspaceId = 'default') {
  try {
    const p = getPool();
    await p.query(
      `INSERT INTO audit_logs (agent_id, action, details, workspace_id)
       VALUES ($1, $2, $3, $4)`,
      [agentId || null, action, JSON.stringify(details), workspaceId || 'default']
    );
  } catch (err) {
    console.error('[audit] write failed:', err.message);
  }
}

// ─── Quota Helpers (S8.7) ────────────────────────────────────────────────────

/**
 * Get total tokens used this month for a workspace.
 * @param {string} workspaceId
 * @returns {Promise<number>}
 */
async function getWorkspaceMonthlyTokens(workspaceId) {
  try {
    const p = getPool();
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { rows } = await p.query(
      `SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
         FROM token_usage
        WHERE workspace_id = $1 AND timestamp >= $2`,
      [workspaceId, monthStart]
    );
    return parseInt(rows[0]?.total || 0, 10);
  } catch (err) {
    console.error('[quota] getWorkspaceMonthlyTokens error:', err.message);
    return 0;
  }
}

/**
 * Check if a workspace is over its monthly token quota.
 * Returns { allowed, used, limit, pct } or { allowed: true } if no limit set.
 * @param {string} workspaceId
 * @returns {Promise<{allowed: boolean, used: number, limit: number|null, pct: number}>}
 */
async function checkWorkspaceQuota(workspaceId) {
  try {
    const p = getPool();
    // Get the workspace's max monthly_token_limit across active providers
    const { rows } = await p.query(
      `SELECT MAX(monthly_token_limit) AS token_limit
         FROM workspace_llm_providers
        WHERE workspace_id = $1 AND is_active = true AND monthly_token_limit IS NOT NULL`,
      [workspaceId]
    );

    const limit = rows[0]?.token_limit ? parseInt(rows[0].token_limit, 10) : null;

    // No limit configured → always allowed
    if (!limit) return { allowed: true, used: 0, limit: null, pct: 0 };

    const used = await getWorkspaceMonthlyTokens(workspaceId);
    const pct  = Math.round((used / limit) * 100);

    // Log 80% alert (once per month per workspace)
    if (pct >= 80 && pct < 100) {
      // Check if we already logged this alert
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const { rows: alertRows } = await p.query(
        `SELECT 1 FROM audit_logs
          WHERE workspace_id = $1 AND action = 'quota.alert_80pct' AND timestamp >= $2
          LIMIT 1`,
        [workspaceId, monthStart]
      );

      if (!alertRows.length) {
        await auditLog(null, 'quota.alert_80pct', { used, limit, pct }, workspaceId);
        console.warn(`⚠️  [quota] Workspace ${workspaceId} at ${pct}% of monthly token quota (${used}/${limit})`);
      }
    }

    return { allowed: used < limit, used, limit, pct };

  } catch (err) {
    console.error('[quota] checkWorkspaceQuota error:', err.message);
    // On error, allow the request (fail open — availability > strict quota)
    return { allowed: true, used: 0, limit: null, pct: 0, error: err.message };
  }
}

// ─── Quota Limits by Plan (S8.3) ─────────────────────────────────────────────

const PLAN_LIMITS = {
  free: {
    maxAgents: 3,
    monthlyMessages: 1000,
    storageMB: 100,
    monthlyTokens: 50000  // ~25 conversations
  },
  starter: {
    maxAgents: 5, 
    monthlyMessages: 5000,
    storageMB: 1024,
    monthlyTokens: 250000  // ~125 conversations
  },
  pro: {
    maxAgents: 15,
    monthlyMessages: 25000, 
    storageMB: 10240,
    monthlyTokens: 1000000  // ~500 conversations
  },
  business: {
    maxAgents: 50,
    monthlyMessages: 100000,
    storageMB: 102400,
    monthlyTokens: 5000000  // ~2500 conversations
  }
};

/**
 * Get plan limits for a workspace.
 * @param {string} plan - Plan type (free, starter, pro, business)
 * @returns {Object} Plan limits
 */
function getPlanLimits(plan = 'free') {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

/**
 * Check all quota limits for a workspace against its plan.
 * @param {string} workspaceId
 * @param {string} plan - Plan type
 * @returns {Promise<Object>} Quota status with details
 */
async function checkWorkspaceLimits(workspaceId, plan = 'free') {
  const limits = getPlanLimits(plan);
  const p = getPool();
  
  try {
    // Count agents
    const { rows: agentRows } = await p.query(
      'SELECT COUNT(*) as count FROM agents WHERE workspace_id = $1 AND status != $2',
      [workspaceId, 'inactive']
    );
    const agentCount = parseInt(agentRows[0]?.count || 0);
    
    // Get token usage (already have function for this)
    const tokenUsage = await getWorkspaceMonthlyTokens(workspaceId);
    
    // Get storage usage
    const { rows: storageRows } = await p.query(
      'SELECT COALESCE(SUM(size_bytes), 0) as total_bytes FROM drive_files WHERE workspace_id = $1',
      [workspaceId]
    );
    const storageMB = Math.round(parseInt(storageRows[0]?.total_bytes || 0) / 1024 / 1024);
    
    // TODO: Messages count - would need to add message tracking to token_usage or separate table
    
    return {
      plan,
      limits,
      usage: {
        agents: agentCount,
        tokens: tokenUsage,
        storageMB,
        // messages: 0  // TODO: implement message tracking
      },
      allowed: {
        agents: agentCount < limits.maxAgents,
        tokens: tokenUsage < limits.monthlyTokens,
        storage: storageMB < limits.storageMB,
        // messages: true  // TODO: implement
      },
      percentages: {
        agents: Math.round((agentCount / limits.maxAgents) * 100),
        tokens: Math.round((tokenUsage / limits.monthlyTokens) * 100),
        storage: Math.round((storageMB / limits.storageMB) * 100),
      }
    };
  } catch (err) {
    console.error('[quota] checkWorkspaceLimits error:', err.message);
    return {
      plan,
      limits,
      error: err.message,
      allowed: { agents: true, tokens: true, storage: true }
    };
  }
}

// ─── Pool shortcut ───────────────────────────────────────────────────────────

/** Returns the shared pg Pool (lazy-init). */
const pool = () => getPool();

module.exports = {
  pool,
  encryptField,
  decryptField,
  auditLog,
  getWorkspaceMonthlyTokens,
  checkWorkspaceQuota,
  // S8.3 — Multi-tenant context
  setWorkspaceContext,
  queryWithWorkspace,
  transactionWithWorkspace,
  // S8.3 — Plan limits
  getPlanLimits,
  checkWorkspaceLimits,
  PLAN_LIMITS,
};