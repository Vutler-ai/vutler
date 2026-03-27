'use strict';

/**
 * Email Groups API — Distribution lists for Vutler workspaces.
 * A group has a shared email address (e.g. info@vutler.ai) and routes
 * incoming mail to multiple agents and/or human members.
 *
 * Routes (mounted at /api/v1/email/groups):
 *   GET    /                    — list groups for workspace
 *   POST   /                    — create group
 *   GET    /:id                 — get group with members
 *   PUT    /:id                 — update group
 *   DELETE /:id                 — delete group
 *   POST   /:id/members         — add member
 *   DELETE /:id/members/:memberId — remove member
 */

const express = require('express');
const router = express.Router();

const SCHEMA = 'tenant_vutler';
const FALLBACK_DOMAIN_SUFFIX = process.env.VUTLER_FALLBACK_DOMAIN_SUFFIX || 'vutler.ai';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getWorkspaceDomain(pg, workspaceId) {
  try {
    const verified = await pg.query(
      `SELECT domain FROM ${SCHEMA}.workspace_domains
       WHERE workspace_id = $1 AND mx_verified = true AND spf_verified = true
       ORDER BY verified_at DESC LIMIT 1`,
      [workspaceId]
    );
    if (verified.rows[0]) return verified.rows[0].domain;
  } catch (_) {}

  try {
    const ws = await pg.query(
      `SELECT slug FROM ${SCHEMA}.workspaces WHERE id = $1 LIMIT 1`,
      [workspaceId]
    );
    if (ws.rows[0]?.slug) return `${ws.rows[0].slug}.${FALLBACK_DOMAIN_SUFFIX}`;
  } catch (_) {}

  return `workspace.${FALLBACK_DOMAIN_SUFFIX}`;
}

function formatGroup(row, members = []) {
  return {
    id: row.id,
    name: row.name,
    emailAddress: row.email_address,
    description: row.description,
    autoReply: row.auto_reply,
    approvalRequired: row.approval_required,
    memberCount: row.member_count ? Number(row.member_count) : members.length,
    members: members.map(formatMember),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatMember(m) {
  return {
    id: m.id,
    memberType: m.member_type,
    agentId: m.agent_id,
    agentName: m.agent_name || null,
    agentUsername: m.agent_username || null,
    agentAvatar: m.agent_avatar || null,
    humanEmail: m.human_email,
    humanName: m.human_name,
    role: m.role,
    notify: m.notify,
    canReply: m.can_reply,
    createdAt: m.created_at,
  };
}

// ─── GET / — list groups ────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    if (!pg) return res.json({ success: true, groups: [] });

    const ws = req.workspaceId || '00000000-0000-0000-0000-000000000001';
    const result = await pg.query(
      `SELECT g.*,
              COUNT(m.id) AS member_count
       FROM ${SCHEMA}.email_groups g
       LEFT JOIN ${SCHEMA}.email_group_members m ON m.group_id = g.id
       WHERE g.workspace_id = $1
       GROUP BY g.id
       ORDER BY g.created_at DESC`,
      [ws]
    );

    res.json({
      success: true,
      groups: result.rows.map(r => formatGroup(r)),
      count: result.rows.length,
    });
  } catch (err) {
    console.error('[EMAIL-GROUPS] List error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST / — create group ──────────────────────────────────────────────────

router.post('/', async (req, res) => {
  try {
    const { name, email_prefix, domain, description, auto_reply, approval_required } = req.body;

    if (!name || !email_prefix) {
      return res.status(400).json({ success: false, error: 'name and email_prefix are required' });
    }

    const cleanPrefix = email_prefix.toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (!cleanPrefix) {
      return res.status(400).json({ success: false, error: 'Invalid email_prefix' });
    }

    const pg = req.app.locals.pg;
    if (!pg) return res.status(503).json({ success: false, error: 'Database not available' });

    const ws = req.workspaceId || '00000000-0000-0000-0000-000000000001';
    const resolvedDomain = domain || await getWorkspaceDomain(pg, ws);
    const emailAddress = `${cleanPrefix}@${resolvedDomain}`;

    const result = await pg.query(
      `INSERT INTO ${SCHEMA}.email_groups (workspace_id, name, email_address, description, auto_reply, approval_required)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [ws, name, emailAddress, description || null, auto_reply ?? true, approval_required ?? true]
    );

    res.status(201).json({
      success: true,
      group: formatGroup(result.rows[0]),
    });
  } catch (err) {
    console.error('[EMAIL-GROUPS] Create error:', err.message);
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'Email address already in use' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /:id — get group with members ──────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    if (!pg) return res.status(503).json({ success: false, error: 'Database not available' });

    const ws = req.workspaceId || '00000000-0000-0000-0000-000000000001';

    const groupResult = await pg.query(
      `SELECT * FROM ${SCHEMA}.email_groups WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [req.params.id, ws]
    );

    if (!groupResult.rows[0]) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }

    const membersResult = await pg.query(
      `SELECT m.*, a.name AS agent_name, a.username AS agent_username, a.avatar AS agent_avatar
       FROM ${SCHEMA}.email_group_members m
       LEFT JOIN ${SCHEMA}.agents a ON a.id = m.agent_id
       WHERE m.group_id = $1
       ORDER BY m.role DESC, m.created_at ASC`,
      [req.params.id]
    );

    res.json({
      success: true,
      group: formatGroup(groupResult.rows[0], membersResult.rows),
    });
  } catch (err) {
    console.error('[EMAIL-GROUPS] Get error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PUT /:id — update group ────────────────────────────────────────────────

router.put('/:id', async (req, res) => {
  try {
    const { name, description, auto_reply, approval_required } = req.body;

    const pg = req.app.locals.pg;
    if (!pg) return res.status(503).json({ success: false, error: 'Database not available' });

    const ws = req.workspaceId || '00000000-0000-0000-0000-000000000001';

    const result = await pg.query(
      `UPDATE ${SCHEMA}.email_groups
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           auto_reply = COALESCE($3, auto_reply),
           approval_required = COALESCE($4, approval_required),
           updated_at = NOW()
       WHERE id = $5 AND workspace_id = $6
       RETURNING *`,
      [name, description, auto_reply, approval_required, req.params.id, ws]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }

    res.json({ success: true, group: formatGroup(result.rows[0]) });
  } catch (err) {
    console.error('[EMAIL-GROUPS] Update error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /:id — delete group ─────────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    if (!pg) return res.status(503).json({ success: false, error: 'Database not available' });

    const ws = req.workspaceId || '00000000-0000-0000-0000-000000000001';
    const result = await pg.query(
      `DELETE FROM ${SCHEMA}.email_groups WHERE id = $1 AND workspace_id = $2 RETURNING id, name, email_address`,
      [req.params.id, ws]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }

    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    console.error('[EMAIL-GROUPS] Delete error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /:id/members — add member ────────────────────────────────────────

router.post('/:id/members', async (req, res) => {
  try {
    const { agent_id, human_email, human_name, role, notify, can_reply } = req.body;

    if (!agent_id && !human_email) {
      return res.status(400).json({ success: false, error: 'Provide agent_id (for AI agent) or human_email (for human member)' });
    }

    const pg = req.app.locals.pg;
    if (!pg) return res.status(503).json({ success: false, error: 'Database not available' });

    const ws = req.workspaceId || '00000000-0000-0000-0000-000000000001';

    // Verify group belongs to workspace
    const groupCheck = await pg.query(
      `SELECT id FROM ${SCHEMA}.email_groups WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [req.params.id, ws]
    );
    if (!groupCheck.rows[0]) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }

    // If agent, verify it belongs to workspace
    if (agent_id) {
      const agentCheck = await pg.query(
        `SELECT id, name FROM ${SCHEMA}.agents WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
        [agent_id, ws]
      );
      if (!agentCheck.rows[0]) {
        return res.status(404).json({ success: false, error: 'Agent not found in this workspace' });
      }
    }

    const memberType = agent_id ? 'agent' : 'human';
    const result = await pg.query(
      `INSERT INTO ${SCHEMA}.email_group_members
         (group_id, member_type, agent_id, human_email, human_name, role, notify, can_reply)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.params.id,
        memberType,
        agent_id || null,
        human_email || null,
        human_name || null,
        role || 'member',
        notify ?? true,
        can_reply ?? true,
      ]
    );

    res.status(201).json({
      success: true,
      member: formatMember(result.rows[0]),
    });
  } catch (err) {
    console.error('[EMAIL-GROUPS] Add member error:', err.message);
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'Member already in this group' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /:id/members/:memberId — remove member ──────────────────────────

router.delete('/:id/members/:memberId', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    if (!pg) return res.status(503).json({ success: false, error: 'Database not available' });

    const result = await pg.query(
      `DELETE FROM ${SCHEMA}.email_group_members
       WHERE id = $1 AND group_id = $2
       RETURNING id, member_type, agent_id, human_email`,
      [req.params.memberId, req.params.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }

    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    console.error('[EMAIL-GROUPS] Remove member error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
