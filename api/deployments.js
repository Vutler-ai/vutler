/**
 * Deployments API (PostgreSQL-backed)
 */
const express = require('express');
const pool = require('../lib/vaultbrix');

const router = express.Router();
const SCHEMA = 'tenant_vutler';
const HEARTBEAT_ONLINE_SECONDS = 90;

async function ensureNexusTables() {
  try {
    const check = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='tenant_vutler' AND table_name='nexus_deployments'`
    );
    if (check.rows.length === 0) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${SCHEMA}.nexus_deployments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          workspace_id UUID NOT NULL,
          created_by_user_id UUID NULL,
          agent_id TEXT NOT NULL,
          mode TEXT NOT NULL CHECK (mode IN ('local', 'docker')),
          status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'online', 'offline', 'error')),
          api_key_id UUID NULL,
          client_company TEXT NULL,
          command_context JSONB NOT NULL DEFAULT '{}'::jsonb,
          last_heartbeat_at TIMESTAMPTZ NULL,
          last_heartbeat_payload JSONB NULL,
          runtime_version TEXT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    }
  } catch (err) {
    console.warn('[DEPLOYMENTS] ensureNexusTables warning (table may already exist):', err.message);
  }
}

function mapDeployment(row) {
  return {
    id: row.id,
    agentId: row.agent_id,
    agentName: row.agent_name || row.agent_id,
    mode: row.mode,
    status: row.computed_status,
    rawStatus: row.status,
    clientCompany: row.client_company,
    apiKeyId: row.api_key_id,
    commandContext: row.command_context || {},
    lastHeartbeat: row.last_heartbeat_at,
    runtimeVersion: row.runtime_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/v1/deployments
router.get('/', async (req, res) => {
  try {
    await ensureNexusTables();

    const result = await pool.query(
      `SELECT
        d.*,
        COALESCE(a.name, d.agent_id) AS agent_name,
        CASE
          WHEN d.last_heartbeat_at IS NULL THEN CASE WHEN d.status = 'planned' THEN 'planned' ELSE 'offline' END
          WHEN d.last_heartbeat_at >= NOW() - ($2::int * INTERVAL '1 second') THEN 'online'
          ELSE 'offline'
        END AS computed_status
      FROM ${SCHEMA}.nexus_deployments d
      LEFT JOIN ${SCHEMA}.agents a ON a.id::text = d.agent_id
      WHERE d.workspace_id = $1
      ORDER BY d.created_at DESC`,
      [req.workspaceId, HEARTBEAT_ONLINE_SECONDS]
    );

    res.json({
      success: true,
      deployments: result.rows.map(mapDeployment),
    });
  } catch (err) {
    console.error('[DEPLOYMENTS] List error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/deployments
router.post('/', async (req, res) => {
  try {
    await ensureNexusTables();

    const { agentId, mode, apiKeyId, clientCompany, commandContext } = req.body || {};
    if (!agentId) {
      return res.status(400).json({ success: false, error: 'agentId is required' });
    }

    const selectedMode = mode === 'local' ? 'local' : 'docker';
    const result = await pool.query(
      `INSERT INTO ${SCHEMA}.nexus_deployments (
        workspace_id,
        created_by_user_id,
        agent_id,
        mode,
        status,
        api_key_id,
        client_company,
        command_context
      ) VALUES ($1, $2, $3, $4, 'planned', $5, $6, $7::jsonb)
      RETURNING *`,
      [
        req.workspaceId,
        req.userId || null,
        String(agentId),
        selectedMode,
        apiKeyId || null,
        clientCompany || null,
        JSON.stringify(commandContext || {}),
      ]
    );

    const row = result.rows[0];
    res.json({
      success: true,
      deployment: {
        id: row.id,
        agentId: row.agent_id,
        mode: row.mode,
        status: row.status,
        clientCompany: row.client_company,
        commandContext: row.command_context || {},
        createdAt: row.created_at,
      },
    });
  } catch (err) {
    console.error('[DEPLOYMENTS] Create error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/deployments/:id/status
router.get('/:id/status', async (req, res) => {
  try {
    await ensureNexusTables();

    const result = await pool.query(
      `SELECT
        id,
        status,
        last_heartbeat_at,
        updated_at,
        CASE
          WHEN last_heartbeat_at IS NULL THEN CASE WHEN status = 'planned' THEN 'planned' ELSE 'offline' END
          WHEN last_heartbeat_at >= NOW() - ($3::int * INTERVAL '1 second') THEN 'online'
          ELSE 'offline'
        END AS computed_status
      FROM ${SCHEMA}.nexus_deployments
      WHERE id::text = $1 AND workspace_id = $2
      LIMIT 1`,
      [req.params.id, req.workspaceId, HEARTBEAT_ONLINE_SECONDS]
    );

    const deployment = result.rows[0];
    if (!deployment) {
      return res.status(404).json({ success: false, error: 'Deployment not found' });
    }

    res.json({
      success: true,
      status: deployment.computed_status,
      rawStatus: deployment.status,
      lastHeartbeat: deployment.last_heartbeat_at,
      updatedAt: deployment.updated_at,
    });
  } catch (err) {
    console.error('[DEPLOYMENTS] Status error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/deployments/:id
router.delete('/:id', async (req, res) => {
  try {
    await ensureNexusTables();

    const result = await pool.query(
      `DELETE FROM ${SCHEMA}.nexus_deployments
       WHERE id::text = $1 AND workspace_id = $2
       RETURNING id`,
      [req.params.id, req.workspaceId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Deployment not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[DEPLOYMENTS] Delete error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
