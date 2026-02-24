// ─── Channel Assignment Routes (S9.4) ──────────────────────────────────────

// GET /agents/:id/channels — list assigned channels
router.get('/:id/channels', requireAuth, param('id').isString(), validateRequest, async (req, res) => {
  try {
    const { id: agentId } = req.params;
    const db = req.app.locals.db;
    const pgPool = req.app.locals.pool;

    // Verify agent exists
    const agent = await db.collection('users').findOne({ _id: agentId, type: 'agent' });
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    // Get assigned channels
    const pg = pgPool();
    const { rows } = await pg.query(
      `SELECT rc_channel_id, rc_channel_name, workspace_id, created_at, is_active
       FROM agent_rc_channels 
       WHERE agent_id = $1 
       ORDER BY created_at DESC`,
      [agentId]
    );

    res.json({ 
      success: true, 
      channels: rows.map(row => ({
        channelId: row.rc_channel_id,
        channelName: row.rc_channel_name,
        workspaceId: row.workspace_id,
        createdAt: row.created_at,
        isActive: row.is_active
      }))
    });
  } catch (error) {
    console.error('Get agent channels error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /agents/:id/channels — assign agent to channel
router.post('/:id/channels', requireAuth, param('id').isString(), validateRequest, async (req, res) => {
  try {
    const { id: agentId } = req.params;
    const { rc_channel_id, rc_channel_name, workspace_id } = req.body;
    const db = req.app.locals.db;
    const pgPool = req.app.locals.pool;

    // Validate input
    if (!rc_channel_id || !rc_channel_name) {
      return res.status(400).json({ 
        success: false, 
        error: 'rc_channel_id and rc_channel_name are required' 
      });
    }

    // Verify agent exists
    const agent = await db.collection('users').findOne({ _id: agentId, type: 'agent' });
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    // Insert channel assignment
    const pg = pgPool();
    await pg.query(
      `INSERT INTO agent_rc_channels (agent_id, rc_channel_id, rc_channel_name, workspace_id, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (agent_id, rc_channel_id) 
       DO UPDATE SET rc_channel_name = EXCLUDED.rc_channel_name, 
                     workspace_id = EXCLUDED.workspace_id,
                     is_active = TRUE,
                     updated_at = NOW()`,
      [agentId, rc_channel_id, rc_channel_name, workspace_id || 'default']
    );

    // Reload runtime assignments
    if (req.app.locals.runtime) {
      await req.app.locals.runtime.reload();
    }

    res.json({ 
      success: true, 
      message: `Agent assigned to channel: ${rc_channel_name}`,
      channel: {
        channelId: rc_channel_id,
        channelName: rc_channel_name,
        workspaceId: workspace_id || 'default'
      }
    });
  } catch (error) {
    console.error('Assign agent channel error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /agents/:id/channels/:channelId — unassign agent from channel
router.delete('/:id/channels/:channelId', requireAuth, 
  param('id').isString(), param('channelId').isString(), validateRequest, 
  async (req, res) => {
  try {
    const { id: agentId, channelId } = req.params;
    const db = req.app.locals.db;
    const pgPool = req.app.locals.pool;

    // Verify agent exists
    const agent = await db.collection('users').findOne({ _id: agentId, type: 'agent' });
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    // Remove channel assignment
    const pg = pgPool();
    const { rowCount } = await pg.query(
      `DELETE FROM agent_rc_channels 
       WHERE agent_id = $1 AND rc_channel_id = $2`,
      [agentId, channelId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Channel assignment not found' 
      });
    }

    // Reload runtime assignments
    if (req.app.locals.runtime) {
      await req.app.locals.runtime.reload();
    }

    res.json({ 
      success: true, 
      message: 'Agent unassigned from channel' 
    });
  } catch (error) {
    console.error('Unassign agent channel error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});