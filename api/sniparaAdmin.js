'use strict';

const express = require('express');
const router = express.Router();

const pool = require('../lib/vaultbrix');
const { readExistingProvisioning, provisionWorkspaceSnipara } = require('../services/sniparaProvisioningService');
const { resolveSniparaConfig } = require('../services/sniparaResolver');

const SCHEMA = 'tenant_vutler';

function getWorkspaceId(req) {
  return req.workspaceId || req.user?.workspaceId || null;
}

function requireWorkspace(req, res, next) {
  if (!getWorkspaceId(req)) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  return next();
}

function requireAdminRole(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  return next();
}

router.use(requireWorkspace);
router.use(requireAdminRole);

router.get('/status', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);

    const [existing, resolved] = await Promise.all([
      readExistingProvisioning(pool, workspaceId),
      resolveSniparaConfig(pool, workspaceId),
    ]);

    res.json({
      success: true,
      data: {
        workspace_id: workspaceId,
        configured: Boolean(existing.apiKey && existing.apiUrl && existing.swarmId),
        integration_key_present: Boolean(process.env.SNIPARA_INTEGRATION_KEY),
        settings: {
          api_url: existing.apiUrl || null,
          project_id: existing.projectId || null,
          project_slug: existing.projectSlug || null,
          swarm_id: existing.swarmId || null,
          api_key_present: Boolean(existing.apiKey),
        },
        resolved: {
          source: resolved.source,
          api_url: resolved.apiUrl || null,
          project_id: resolved.projectId || null,
          project_slug: resolved.projectSlug || null,
          swarm_id: resolved.swarmId || null,
          api_key_present: Boolean(resolved.apiKey),
        },
      },
    });
  } catch (error) {
    console.error('[SniparaAdmin] status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/provision', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);

    const workspaceResult = await pool.query(
      `SELECT name, slug FROM ${SCHEMA}.workspaces WHERE id = $1 LIMIT 1`,
      [workspaceId]
    );
    const workspace = workspaceResult.rows[0];
    if (!workspace) return res.status(404).json({ success: false, error: 'Workspace not found' });

    const result = await provisionWorkspaceSnipara({
      db: pool,
      workspaceId,
      workspaceName: workspace.name,
      workspaceSlug: workspace.slug,
      ownerEmail: req.user?.email || null,
      force: Boolean(req.body?.force),
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[SniparaAdmin] provision error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
