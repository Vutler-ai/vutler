/**
 * Vutler Nexus API
 * Manage Nexus nodes (paired devices/servers)
 */

const express = require('express');
const { authenticateAgent } = require('../lib/auth');
const router = express.Router();

const SCHEMA = 'tenant_vutler';

function normalizeWorkspaceId(value) {
  if (typeof value !== 'string') return value || null;
  const normalized = value.trim();
  return normalized || null;
}

function getWorkspaceId(req) {
  const candidates = [
    req.workspaceId,
    req.user?.workspaceId,
    req.user?.workspace_id,
    req.agent?.workspaceId,
    req.agent?.workspace_id,
  ];
  for (const candidate of candidates) {
    const value = normalizeWorkspaceId(candidate);
    if (value) return value;
  }
  return null;
}

function ensureWorkspaceContext(req, res, next) {
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({
      success: false,
      error: 'workspace context is required',
    });
  }
  req.workspaceId = workspaceId;
  return next();
}

router.use(authenticateAgent, ensureWorkspaceContext);

function mapNode(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type || 'local',
    status: row.status || 'offline',
    host: row.host || null,
    port: row.port || null,
    config: row.config || {},
    agentsDeployed: row.agents_deployed || [],
    lastHeartbeat: row.last_heartbeat || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * GET /api/v1/nexus
 * List Nexus nodes for workspace
 */
router.get('/nexus', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    if (!pg) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const workspaceId = getWorkspaceId(req);
    const result = await pg.query(
      `SELECT * FROM ${SCHEMA}.nexus_nodes WHERE workspace_id = $1 ORDER BY created_at DESC`,
      [workspaceId]
    );

    res.json({
      success: true,
      data: result.rows.map(mapNode),
      meta: { total: result.rows.length }
    });
  } catch (error) {
    console.error('[Nexus API] Error fetching nodes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Nexus nodes',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/nexus
 * Register a new Nexus node
 */
router.post('/nexus', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    if (!pg) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const { name, type = 'local', host = null, port = null, config = {} } = req.body || {};

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name'
      });
    }

    const workspaceId = getWorkspaceId(req);
    const insert = await pg.query(
      `INSERT INTO ${SCHEMA}.nexus_nodes (workspace_id, name, type, status, host, port, config, agents_deployed)
       VALUES ($1, $2, $3, 'offline', $4, $5, $6::jsonb, '[]'::jsonb)
       RETURNING *`,
      [workspaceId, name, type, host, port, JSON.stringify(config)]
    );

    res.status(201).json({
      success: true,
      data: mapNode(insert.rows[0])
    });
  } catch (error) {
    console.error('[Nexus API] Error registering node:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register node',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/nexus/:id
 * Get node details
 */
router.get('/nexus/:id', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    if (!pg) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const { id } = req.params;
    const workspaceId = getWorkspaceId(req);

    const result = await pg.query(
      `SELECT * FROM ${SCHEMA}.nexus_nodes WHERE id = $1 AND workspace_id = $2`,
      [id, workspaceId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Node not found'
      });
    }

    res.json({
      success: true,
      data: mapNode(result.rows[0])
    });
  } catch (error) {
    console.error('[Nexus API] Error fetching node:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch node',
      message: error.message
    });
  }
});

/**
 * PATCH /api/v1/nexus/:id
 * Update node configuration
 */
router.patch('/nexus/:id', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    if (!pg) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const { id } = req.params;
    const workspaceId = getWorkspaceId(req);

    // Check node exists and belongs to workspace
    const existing = await pg.query(
      `SELECT id FROM ${SCHEMA}.nexus_nodes WHERE id = $1 AND workspace_id = $2`,
      [id, workspaceId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Node not found'
      });
    }

    // Build partial update — only allowed fields
    const allowed = ['name', 'status', 'host', 'port', 'config'];
    const setClauses = [];
    const values = [];
    let paramIdx = 1;

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        if (field === 'config') {
          setClauses.push(`config = $${paramIdx}::jsonb`);
          values.push(JSON.stringify(req.body.config));
        } else {
          setClauses.push(`${field} = $${paramIdx}`);
          values.push(req.body[field]);
        }
        paramIdx++;
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No updatable fields provided. Allowed: name, status, host, port, config'
      });
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(id, workspaceId);

    const update = await pg.query(
      `UPDATE ${SCHEMA}.nexus_nodes
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIdx} AND workspace_id = $${paramIdx + 1}
       RETURNING *`,
      values
    );

    res.json({
      success: true,
      data: mapNode(update.rows[0])
    });
  } catch (error) {
    console.error('[Nexus API] Error updating node:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update node',
      message: error.message
    });
  }
});

/**
 * DELETE /api/v1/nexus/:id
 * Remove a Nexus node
 */
router.delete('/nexus/:id', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    if (!pg) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const { id } = req.params;
    const workspaceId = getWorkspaceId(req);

    const result = await pg.query(
      `DELETE FROM ${SCHEMA}.nexus_nodes WHERE id = $1 AND workspace_id = $2 RETURNING id`,
      [id, workspaceId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Node not found'
      });
    }

    res.json({
      success: true,
      data: { id: result.rows[0].id, deleted: true }
    });
  } catch (error) {
    console.error('[Nexus API] Error deleting node:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete node',
      message: error.message
    });
  }
});

module.exports = router;
module.exports._private = {
  getWorkspaceId,
  ensureWorkspaceContext,
};
