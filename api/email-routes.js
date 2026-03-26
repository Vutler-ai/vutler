'use strict';

/**
 * Email Routes API
 * Assigns email addresses to agents and manages incoming email routing.
 *
 * Routes (mounted at /api/v1/email/routes):
 *   GET    /    — list agent email routes for workspace
 *   POST   /    — assign an email address to an agent
 *   DELETE /:id — remove an email route
 */

const express = require('express');
const router = express.Router();

const SCHEMA = 'tenant_vutler';
const FALLBACK_DOMAIN_SUFFIX = process.env.VUTLER_FALLBACK_DOMAIN_SUFFIX || 'vutler.ai';

/**
 * Get the default email domain for a workspace.
 * Prefers a fully-verified custom domain; falls back to {slug}.vutler.ai.
 */
async function getWorkspaceDomain(pg, workspaceId) {
  // Try to find a fully verified custom domain
  try {
    const verified = await pg.query(
      `SELECT domain FROM ${SCHEMA}.workspace_domains
       WHERE workspace_id = $1 AND mx_verified = true AND spf_verified = true
       ORDER BY verified_at DESC LIMIT 1`,
      [workspaceId]
    );
    if (verified.rows[0]) return verified.rows[0].domain;
  } catch (_) {}

  // Fallback: {workspace_slug}.vutler.ai
  try {
    const ws = await pg.query(
      `SELECT slug FROM ${SCHEMA}.workspaces WHERE id = $1 LIMIT 1`,
      [workspaceId]
    );
    if (ws.rows[0]?.slug) return `${ws.rows[0].slug}.${FALLBACK_DOMAIN_SUFFIX}`;
  } catch (_) {}

  return `workspace.${FALLBACK_DOMAIN_SUFFIX}`;
}

// ---------------------------------------------------------------------------
// GET / — list email routes for workspace
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    if (!pg) return res.json({ success: true, routes: [] });

    const ws = req.workspaceId || '00000000-0000-0000-0000-000000000001';
    const result = await pg.query(
      `SELECT er.*, a.name AS agent_name, a.username AS agent_username, a.avatar AS agent_avatar
       FROM ${SCHEMA}.email_routes er
       LEFT JOIN ${SCHEMA}.agents a ON a.id = er.agent_id
       WHERE er.workspace_id = $1
       ORDER BY er.created_at DESC`,
      [ws]
    );

    const routes = result.rows.map(r => ({
      id: r.id,
      emailAddress: r.email_address,
      agentId: r.agent_id,
      agentName: r.agent_name,
      agentUsername: r.agent_username,
      agentAvatar: r.agent_avatar,
      autoReply: r.auto_reply,
      approvalRequired: r.approval_required,
      createdAt: r.created_at,
    }));

    res.json({ success: true, routes, count: routes.length });
  } catch (err) {
    console.error('[EMAIL-ROUTES] List error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST / — assign email to agent
// Body: { agent_id, email_prefix, domain?, auto_reply?, approval_required? }
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const { agent_id, email_prefix, domain, auto_reply, approval_required } = req.body;

    if (!agent_id || !email_prefix) {
      return res.status(400).json({ success: false, error: 'agent_id and email_prefix are required' });
    }

    // Sanitise prefix: lowercase, alphanumeric + hyphens/dots only
    const cleanPrefix = email_prefix.toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (!cleanPrefix || cleanPrefix.length < 1) {
      return res.status(400).json({ success: false, error: 'Invalid email_prefix' });
    }

    const pg = req.app.locals.pg;
    if (!pg) return res.status(503).json({ success: false, error: 'Database not available' });

    const ws = req.workspaceId || '00000000-0000-0000-0000-000000000001';

    // Verify the agent belongs to this workspace
    const agentCheck = await pg.query(
      `SELECT id, username FROM ${SCHEMA}.agents WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [agent_id, ws]
    );
    if (!agentCheck.rows[0]) {
      return res.status(404).json({ success: false, error: 'Agent not found in this workspace' });
    }

    // Resolve domain
    let resolvedDomain = domain;
    if (!resolvedDomain) {
      resolvedDomain = await getWorkspaceDomain(pg, ws);
    }

    const emailAddress = `${cleanPrefix}@${resolvedDomain}`;

    // Insert route
    const result = await pg.query(
      `INSERT INTO ${SCHEMA}.email_routes (workspace_id, email_address, agent_id, auto_reply, approval_required)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email_address) DO UPDATE
         SET agent_id = EXCLUDED.agent_id,
             auto_reply = EXCLUDED.auto_reply,
             approval_required = EXCLUDED.approval_required
       RETURNING *`,
      [ws, emailAddress, agent_id, auto_reply ?? true, approval_required ?? true]
    );

    // Also update the agent's email column
    await pg.query(
      `UPDATE ${SCHEMA}.agents SET email = $1, updated_at = NOW() WHERE id = $2`,
      [emailAddress, agent_id]
    );

    const r = result.rows[0];
    res.status(201).json({
      success: true,
      route: {
        id: r.id,
        emailAddress: r.email_address,
        agentId: r.agent_id,
        autoReply: r.auto_reply,
        approvalRequired: r.approval_required,
        createdAt: r.created_at,
      },
    });
  } catch (err) {
    console.error('[EMAIL-ROUTES] Create error:', err.message);
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'Email address already assigned' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /:id — remove email route
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    if (!pg) return res.status(503).json({ success: false, error: 'Database not available' });

    const ws = req.workspaceId || '00000000-0000-0000-0000-000000000001';
    const result = await pg.query(
      `DELETE FROM ${SCHEMA}.email_routes WHERE id = $1 AND workspace_id = $2 RETURNING id, email_address, agent_id`,
      [req.params.id, ws]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Route not found' });
    }

    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    console.error('[EMAIL-ROUTES] Delete error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
