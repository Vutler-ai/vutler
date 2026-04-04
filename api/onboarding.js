'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../lib/vaultbrix');
const { normalizeStoredAvatar, buildSpriteAvatar } = require('../lib/avatarPath');
const { resolveProvisionedManagedRuntime } = require('../services/managedProviderService');
const { recommendAgents, getDomainAgents } = require('../services/coordinatorPrompt');
const { ensureWorkspaceDriveSetup } = require('../app/custom/services/provisioning');
const { syncWorkspacePlan } = require('../services/workspacePlanService');
const SCHEMA = 'tenant_vutler';

function getWorkspaceId(req) {
  return req.workspaceId || req.user?.workspaceId || null;
}

function normalizeOnboardingModel(model) {
  const value = String(model || '').trim();
  if (!value) return 'claude-haiku-4-5';
  if (value === 'gpt-4o-mini') return 'gpt-5.4-mini';
  if (value === 'gpt-4o') return 'gpt-5.4';
  if (value === 'claude-3-5-haiku-latest') return 'claude-haiku-4-5';
  if (value === 'claude-3.5-sonnet') return 'claude-sonnet-4-20250514';
  return value;
}

router.get('/status', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const ws = await pool.query(
      `SELECT onboarding_completed FROM ${SCHEMA}.workspaces WHERE id = $1 LIMIT 1`,
      [workspaceId]
    );

    if (!ws.rows.length) return res.status(404).json({ success: false, error: 'Workspace not found' });

    const coordinator = await pool.query(
      `SELECT id FROM ${SCHEMA}.agents WHERE workspace_id = $1 AND agent_type = 'coordinator' ORDER BY created_at ASC LIMIT 1`,
      [workspaceId]
    );

    const channel = await pool.query(
      `SELECT id FROM ${SCHEMA}.chat_channels WHERE workspace_id = $1 AND name = 'DM-jarvis' AND type = 'dm' ORDER BY created_at ASC LIMIT 1`,
      [workspaceId]
    );

    return res.json({
      success: true,
      data: {
        onboarding_completed: !!ws.rows[0].onboarding_completed,
        coordinator_channel_id: channel.rows[0]?.id || null,
        coordinator_agent_id: coordinator.rows[0]?.id || null,
      },
    });
  } catch (err) {
    console.error('[ONBOARDING] status error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/complete', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    await pool.query(
      `UPDATE ${SCHEMA}.workspaces SET onboarding_completed = true, updated_at = NOW() WHERE id = $1`,
      [workspaceId]
    );

    return res.json({ success: true, data: { onboarding_completed: true } });
  } catch (err) {
    console.error('[ONBOARDING] complete error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/recommend-agents', async (req, res) => {
  try {
    const { use_case } = req.body || {};
    if (!use_case || typeof use_case !== 'string') {
      return res.status(400).json({ success: false, error: 'use_case is required' });
    }

    const templates = recommendAgents(use_case);
    return res.json({ success: true, data: { use_case, templates } });
  } catch (err) {
    console.error('[ONBOARDING] recommend-agents error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── Trial token status ──────────────────────────────────────────────────────
router.get('/trial-status', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const rows = await pool.query(
      `SELECT key, value FROM ${SCHEMA}.workspace_settings
       WHERE workspace_id = $1 AND key IN ('trial_tokens_total', 'trial_tokens_used', 'trial_expires_at')`,
      [workspaceId]
    );

    if (!rows.rows.length) {
      return res.json({ success: true, data: { is_trial_active: false } });
    }

    const settings = {};
    for (const r of rows.rows) settings[r.key] = r.value;

    const total = parseInt(settings.trial_tokens_total, 10) || 0;
    const used = parseInt(settings.trial_tokens_used, 10) || 0;
    const expiresAt = settings.trial_expires_at ? new Date(settings.trial_expires_at) : null;
    const expired = expiresAt ? expiresAt < new Date() : false;
    const remaining = Math.max(0, total - used);

    return res.json({
      success: true,
      data: {
        is_trial_active: remaining > 0 && !expired,
        tokens_total: total,
        tokens_used: used,
        tokens_remaining: remaining,
        expires_at: expiresAt ? expiresAt.toISOString() : null,
        expired,
      },
    });
  } catch (err) {
    console.error('[ONBOARDING] trial-status error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── Onboarding setup (domain selection + batch agent creation) ──────────────
router.post('/setup', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const { domains } = req.body || {};
    if (!Array.isArray(domains) || !domains.length) {
      return res.status(400).json({ success: false, error: 'domains array is required (e.g. ["marketing", "support"])' });
    }

    const workspace = await pool.query(
      `SELECT name, slug, plan FROM ${SCHEMA}.workspaces WHERE id = $1 LIMIT 1`,
      [workspaceId]
    );
    const workspaceName = workspace.rows[0]?.name || 'Workspace';
    const workspaceSlug = workspace.rows[0]?.slug || workspaceId;
    const workspacePlan = workspace.rows[0]?.plan || 'free';

    let sniparaProvisioning = { provisioned: false, skipped: true, reason: 'not_attempted' };
    let driveProvisioning = { provisioned: false, skipped: true, reason: 'not_attempted' };
    try {
      const { provisionWorkspaceSnipara } = require('../services/sniparaProvisioningService');
      sniparaProvisioning = await provisionWorkspaceSnipara({
        workspaceId,
        workspaceName,
        workspaceSlug,
        ownerEmail: req.user?.email || null,
      });
    } catch (provisionErr) {
      console.warn('[ONBOARDING] Snipara provisioning warning:', provisionErr.message);
      sniparaProvisioning = {
        provisioned: false,
        skipped: false,
        reason: provisionErr.message,
      };
    }

    try {
      const drive = await ensureWorkspaceDriveSetup(workspaceId);
      await syncWorkspacePlan({
        workspaceId,
        planId: workspacePlan,
        source: 'onboarding.setup',
        status: 'active',
      });
      driveProvisioning = {
        provisioned: true,
        skipped: false,
        bucket: drive.bucketName,
        drive_root: drive.driveRoot,
      };
    } catch (driveErr) {
      console.warn('[ONBOARDING] Drive provisioning warning:', driveErr.message);
      driveProvisioning = {
        provisioned: false,
        skipped: false,
        reason: driveErr.message,
      };
    }

    // Resolve domain cards → agent template slugs
    const templateSlugs = getDomainAgents(domains);

    // Fetch matching templates from marketplace
    const tmplResult = await pool.query(
      `SELECT id, name, description, model, system_prompt, avatar
       FROM ${SCHEMA}.marketplace_templates
       WHERE slug = ANY($1) AND is_active = true`,
      [templateSlugs]
    );

    const createdAgents = [];
    const managedRuntime = await resolveProvisionedManagedRuntime(pool, workspaceId);

    for (const tmpl of tmplResult.rows) {
      try {
        const username = tmpl.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
        const runtimeModel = managedRuntime?.model || normalizeOnboardingModel(tmpl.model);
        const runtimeProvider = managedRuntime?.provider || null;
        const result = await pool.query(
          `INSERT INTO ${SCHEMA}.agents
             (name, username, workspace_id, type, model, provider, system_prompt, avatar, status, description)
           VALUES ($1, $2, $3, 'bot', $4, $5, $6, $7, 'active', $8)
           ON CONFLICT DO NOTHING
           RETURNING id, name, username, description, avatar, provider, model`,
          [
            tmpl.name,
            username,
            workspaceId,
            runtimeModel,
            runtimeProvider,
            tmpl.system_prompt || `You are ${tmpl.name}, an AI agent on Vutler.`,
            normalizeStoredAvatar(tmpl.avatar, { username }) || buildSpriteAvatar(username),
            tmpl.description || '',
          ]
        );
        if (result.rows.length) createdAgents.push(result.rows[0]);
      } catch (agentErr) {
        console.warn(`[ONBOARDING] Agent creation failed for ${tmpl.name}:`, agentErr.message);
      }
    }

    // Mark onboarding as complete
    await pool.query(
      `UPDATE ${SCHEMA}.workspaces SET onboarding_completed = true, updated_at = NOW() WHERE id = $1`,
      [workspaceId]
    );

    // Persist chosen domains in workspace settings
    await pool.query(
      `INSERT INTO ${SCHEMA}.workspace_settings (id, workspace_id, key, value, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'onboarding_domains', $2::jsonb, NOW(), NOW())
       ON CONFLICT (workspace_id, key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
      [workspaceId, JSON.stringify(domains)]
    );

    return res.json({
      success: true,
      data: {
        domains,
        agents_created: createdAgents,
        onboarding_completed: true,
        snipara_provisioning: sniparaProvisioning,
        drive_provisioning: driveProvisioning,
      },
    });
  } catch (err) {
    console.error('[ONBOARDING] setup error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
