'use strict';

const express = require('express');
const router = express.Router();
const {
  createApiKey,
  listApiKeys,
  revokeApiKey,
} = require('../services/apiKeys');

const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';

router.get('/', async (req, res) => {
  try {
    const keys = await listApiKeys({ workspaceId: req.workspaceId || DEFAULT_WORKSPACE });
    res.json({ success: true, keys });
  } catch (err) {
    console.error('[API_KEYS] List error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name } = req.body || {};
    const created = await createApiKey({
      workspaceId: req.workspaceId || DEFAULT_WORKSPACE,
      userId: req.userId || req.user?.id || null,
      name,
    });

    res.json({
      success: true,
      key: {
        id: created.id,
        workspace_id: created.workspace_id,
        created_by_user_id: created.created_by_user_id,
        name: created.name,
        key_prefix: created.key_prefix,
        created_at: created.created_at,
      },
      secret: created.secret,
      message: 'Store this secret now. It will not be shown again.',
    });
  } catch (err) {
    console.error('[API_KEYS] Create error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const revoked = await revokeApiKey({
      workspaceId: req.workspaceId || DEFAULT_WORKSPACE,
      id: req.params.id,
    });

    if (!revoked) {
      return res.status(404).json({ success: false, error: 'API key not found or already revoked' });
    }

    res.json({ success: true, revoked });
  } catch (err) {
    console.error('[API_KEYS] Revoke error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
