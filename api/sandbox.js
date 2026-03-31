'use strict';

/**
 * Sandbox API — Code Execution Environment
 *
 * Provides real code execution for agents (JS, Python, Shell)
 * via child_process with timeout enforcement and DB persistence.
 *
 * Routes:
 *   POST /api/v1/sandbox/execute      — Execute a single code snippet
 *   GET  /api/v1/sandbox/executions   — List executions (paginated + filtered)
 *   GET  /api/v1/sandbox/executions/:id — Get single execution with full output
 *   POST /api/v1/sandbox/batch        — Run multiple scripts in sequence
 */

const express = require('express');
const router = express.Router();
const { executeInSandbox, executeBatch } = require('../services/sandbox');
const pool = require('../lib/vaultbrix');

const SCHEMA = 'tenant_vutler';
const MAX_TIMEOUT_MS = 60_000;

// ── DB setup ──────────────────────────────────────────────────────────────────

async function ensureSandboxTable() {
  try {
    await pool.query(`
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
    // Add any columns that may be missing from older table versions
    const alterations = [
      `ALTER TABLE ${SCHEMA}.sandbox_executions ADD COLUMN IF NOT EXISTS workspace_id UUID`,
      `ALTER TABLE ${SCHEMA}.sandbox_executions ADD COLUMN IF NOT EXISTS duration_ms INTEGER`,
      `ALTER TABLE ${SCHEMA}.sandbox_executions ADD COLUMN IF NOT EXISTS batch_id UUID`,
      `ALTER TABLE ${SCHEMA}.sandbox_executions ADD COLUMN IF NOT EXISTS batch_index INTEGER`,
      `ALTER TABLE ${SCHEMA}.sandbox_executions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'`,
    ];
    for (const sql of alterations) {
      await pool.query(sql).catch(() => {});
    }
  } catch (err) {
    console.warn('[Sandbox] ensureSandboxTable warning:', err.message);
  }
}

// Run once on module load
ensureSandboxTable().catch(() => {});

// SECURITY: require authentication for all sandbox routes (audit 2026-03-28)
router.use((req, res, next) => {
  if (!req.user || !req.userId) {
    return res.status(401).json({ success: false, error: 'Authentication required for sandbox execution' });
  }
  next();
});

// ── POST /execute ─────────────────────────────────────────────────────────────

router.post('/execute', async (req, res) => {
  const { language, code, timeout_ms, agent_id } = req.body || {};

  if (!language || !code) {
    return res.status(400).json({ success: false, error: 'language and code are required' });
  }

  const supported = ['javascript', 'python', 'shell'];
  if (!supported.includes(language)) {
    return res.status(400).json({ success: false, error: `language must be one of: ${supported.join(', ')}` });
  }

  const timeoutMs = Math.min(
    Number.isFinite(timeout_ms) ? Number(timeout_ms) : 30_000,
    MAX_TIMEOUT_MS
  );

  try {
    const result = await executeInSandbox(language, code, agent_id || null, timeoutMs, {
      workspaceId: req.workspaceId || null,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[Sandbox] Execute error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /executions ───────────────────────────────────────────────────────────

router.get('/executions', async (req, res) => {
  const { agent_id, language, status, limit = '20', offset = '0' } = req.query;

  const limitN = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const offsetN = Math.max(parseInt(offset, 10) || 0, 0);

  const conditions = ['batch_id IS NULL']; // top-level only (not batch sub-items)
  const params = [];

  // SECURITY: scope to workspace (audit 2026-03-29)
  if (req.workspaceId) {
    params.push(req.workspaceId);
    conditions.push(`workspace_id = $${params.length}`);
  }

  if (agent_id) {
    params.push(agent_id);
    conditions.push(`agent_id = $${params.length}`);
  }
  if (language) {
    params.push(language);
    conditions.push(`language = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM ${SCHEMA}.sandbox_executions ${where}`,
      params
    );
    const total = countResult.rows[0]?.total || 0;

    params.push(limitN, offsetN);
    const result = await pool.query(
      `SELECT id, agent_id, language, code, stdout, stderr, exit_code, status, duration_ms, batch_id, batch_index, created_at
       FROM ${SCHEMA}.sandbox_executions
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ success: true, data: { executions: result.rows, total } });
  } catch (err) {
    console.error('[Sandbox] List executions error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /executions/:id ───────────────────────────────────────────────────────

router.get('/executions/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT id, agent_id, language, code, stdout, stderr, exit_code, status, duration_ms, batch_id, batch_index, created_at
       FROM ${SCHEMA}.sandbox_executions
       WHERE id = $1 AND workspace_id = $2`,
      [id, req.workspaceId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Execution not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[Sandbox] Get execution error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /batch ───────────────────────────────────────────────────────────────

router.post('/batch', async (req, res) => {
  const { scripts, stop_on_error = true, agent_id } = req.body || {};

  if (!Array.isArray(scripts) || scripts.length === 0) {
    return res.status(400).json({ success: false, error: 'scripts must be a non-empty array' });
  }

  if (scripts.length > 20) {
    return res.status(400).json({ success: false, error: 'Maximum 20 scripts per batch' });
  }

  const supported = ['javascript', 'python', 'shell'];
  for (const [i, s] of scripts.entries()) {
    if (!s.language || !s.code) {
      return res.status(400).json({ success: false, error: `scripts[${i}]: language and code are required` });
    }
    if (!supported.includes(s.language)) {
      return res.status(400).json({ success: false, error: `scripts[${i}]: invalid language "${s.language}"` });
    }
  }

  try {
    const results = await executeBatch(scripts, {
      stopOnError: stop_on_error,
      agentId: agent_id || null,
      workspaceId: req.workspaceId || null,
    });
    res.json({ success: true, data: results });
  } catch (err) {
    console.error('[Sandbox] Batch error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
