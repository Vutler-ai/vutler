'use strict';

/**
 * SandboxWorkspace Service
 *
 * Manages persistent multi-file sandbox environments with git integration.
 * Cloud-side component of the Mobile Dispatch architecture.
 */

const pool = require('../lib/vaultbrix');
const { executeInSandbox } = require('../services/sandbox');

const SCHEMA = 'tenant_vutler';
const LOG = '[SandboxWorkspace]';

// ── Table bootstrap ──────────────────────────────────────────────────────────

async function ensureWorkspaceTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.sandbox_workspaces (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id        UUID NOT NULL,
      repo_url            TEXT NOT NULL,
      branch              TEXT NOT NULL,
      base_branch         TEXT DEFAULT 'main',
      status              VARCHAR(20) DEFAULT 'active',
      agent_id            TEXT,
      task_title          TEXT,
      files_snapshot      JSONB DEFAULT '[]',
      dispatch_target     VARCHAR(20),
      dispatch_target_id  TEXT,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW(),
      closed_at           TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_sw_workspace_id ON ${SCHEMA}.sandbox_workspaces (workspace_id);
    CREATE INDEX IF NOT EXISTS idx_sw_status       ON ${SCHEMA}.sandbox_workspaces (status);
    CREATE INDEX IF NOT EXISTS idx_sw_agent_id     ON ${SCHEMA}.sandbox_workspaces (agent_id);
  `);
  console.log(`${LOG} Table ready`);
}

ensureWorkspaceTable().catch(() => {});

// ── CRUD ─────────────────────────────────────────────────────────────────────

async function createWorkspace({ workspaceId, repoUrl, branch, baseBranch, agentId, taskTitle, dispatchTarget, dispatchTargetId }) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO ${SCHEMA}.sandbox_workspaces
         (workspace_id, repo_url, branch, base_branch, agent_id, task_title, dispatch_target, dispatch_target_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [workspaceId, repoUrl, branch, baseBranch || 'main', agentId || null, taskTitle || null, dispatchTarget || null, dispatchTargetId || null]
    );
    return rows[0];
  } catch (err) {
    console.error(`${LOG} createWorkspace error:`, err.message);
    return null;
  }
}

async function getWorkspace(id) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM ${SCHEMA}.sandbox_workspaces WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  } catch (err) {
    console.error(`${LOG} getWorkspace error:`, err.message);
    return null;
  }
}

async function listWorkspaces(workspaceId, { status, limit = 20, offset = 0 } = {}) {
  try {
    const params = [workspaceId, limit, offset];
    let where = 'WHERE workspace_id = $1';
    if (status) {
      params.push(status);
      where += ` AND status = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT * FROM ${SCHEMA}.sandbox_workspaces ${where}
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      params
    );
    return rows;
  } catch (err) {
    console.error(`${LOG} listWorkspaces error:`, err.message);
    return [];
  }
}

async function updateWorkspaceFiles(id, files) {
  try {
    const { rows } = await pool.query(
      `UPDATE ${SCHEMA}.sandbox_workspaces
       SET files_snapshot = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, JSON.stringify(files)]
    );
    return rows[0] || null;
  } catch (err) {
    console.error(`${LOG} updateWorkspaceFiles error:`, err.message);
    return null;
  }
}

async function updateWorkspaceStatus(id, status) {
  try {
    const { rows } = await pool.query(
      `UPDATE ${SCHEMA}.sandbox_workspaces
       SET status = $2,
           updated_at = NOW(),
           closed_at = CASE WHEN $2 = 'closed' THEN NOW() ELSE closed_at END
       WHERE id = $1
       RETURNING *`,
      [id, status]
    );
    return rows[0] || null;
  } catch (err) {
    console.error(`${LOG} updateWorkspaceStatus error:`, err.message);
    return null;
  }
}

async function deleteWorkspace(id) {
  try {
    await pool.query(`DELETE FROM ${SCHEMA}.sandbox_workspaces WHERE id = $1`, [id]);
    return true;
  } catch (err) {
    console.error(`${LOG} deleteWorkspace error:`, err.message);
    return false;
  }
}

// ── Execution ────────────────────────────────────────────────────────────────

async function execInWorkspace(id, language, code, timeoutMs) {
  try {
    const workspace = await getWorkspace(id);
    if (!workspace) throw new Error(`Workspace ${id} not found`);

    const files = Array.isArray(workspace.files_snapshot) ? workspace.files_snapshot : [];

    // Prepend workspace file contents as comments/context for the execution
    let preamble = '';
    if (files.length > 0) {
      const fileBlock = files.map(f => `// --- ${f.path} ---\n${f.content}`).join('\n\n');
      preamble = `// === Workspace Files ===\n${fileBlock}\n\n// === Execution ===\n`;
    }

    const fullCode = preamble + code;
    return await executeInSandbox(language, fullCode, workspace.agent_id || null, timeoutMs);
  } catch (err) {
    console.error(`${LOG} execInWorkspace error:`, err.message);
    return { success: false, error: err.message, stdout: '', stderr: err.message };
  }
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  ensureWorkspaceTable,
  createWorkspace,
  getWorkspace,
  listWorkspaces,
  updateWorkspaceFiles,
  updateWorkspaceStatus,
  deleteWorkspace,
  execInWorkspace,
};
