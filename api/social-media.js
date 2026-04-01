'use strict';

/**
 * Social Media API — Post for Me integration
 * Allows users to connect social accounts and post via Post for Me API.
 */

const express = require('express');
const router = express.Router();
const { getPlan, normalizePlanId } = require('../packages/core/middleware/featureGate');
const {
  createSocialAccountAuthUrl,
  createSocialPost,
  disconnectSocialAccount,
  listSocialAccounts,
  toInternalPlatform,
} = require('../services/postForMeClient');

let pool;
try { pool = require('../lib/vaultbrix'); } catch (e) {
  try { pool = require('../lib/postgres').pool; } catch (e2) { console.error('[SocialMedia] No DB pool found'); }
}

const SCHEMA = 'tenant_vutler';
const SOCIAL_PROVIDERS = ['linkedin', 'twitter', 'instagram', 'facebook', 'tiktok', 'youtube', 'threads', 'bluesky', 'pinterest'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function getExternalId(workspaceId) {
  return `ws_${workspaceId}`;
}

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /auth-url/:platform — Generate OAuth URL for connecting a social account
 */
router.get('/auth-url/:platform', async (req, res) => {
  try {
    const { platform } = req.params;
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ success: false, error: 'workspaceId required' });

    if (!SOCIAL_PROVIDERS.includes(platform)) {
      return res.status(400).json({ success: false, error: `Invalid platform. Must be one of: ${SOCIAL_PROVIDERS.join(', ')}` });
    }

    const data = await createSocialAccountAuthUrl({
      platform,
      externalId: getExternalId(workspaceId),
      permissions: ['posts'],
    });

    res.json({ success: true, data: { url: data.url || data.auth_url } });
  } catch (err) {
    console.error('[SocialMedia] auth-url error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /callback — OAuth callback handler (called after Post for Me OAuth redirect)
 */
router.get('/callback', async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    // After OAuth, sync accounts from Post for Me
    if (workspaceId) {
      await syncAccounts(workspaceId);
    }
    // Redirect to the social media settings page
    res.redirect('/settings/integrations/social-media?connected=true');
  } catch (err) {
    console.error('[SocialMedia] callback error:', err.message);
    res.redirect('/settings/integrations/social-media?error=callback_failed');
  }
});

/**
 * GET /accounts — List connected social accounts for workspace
 */
router.get('/accounts', async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ success: false, error: 'workspaceId required' });

    // Sync from Post for Me first
    await syncAccounts(workspaceId);

    // Return from DB
    const { rows } = await pool.query(
      `SELECT *
       FROM (
         SELECT DISTINCT ON (COALESCE(platform_account_id, id::text))
            id, platform, account_name, account_type, platform_account_id, connected_at, updated_at, created_at
         FROM ${SCHEMA}.social_accounts
         WHERE workspace_id = $1
         ORDER BY COALESCE(platform_account_id, id::text), connected_at DESC, updated_at DESC, created_at DESC
       ) accounts
       ORDER BY connected_at DESC NULLS LAST, updated_at DESC NULLS LAST, created_at DESC NULLS LAST`,
      [workspaceId]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[SocialMedia] list accounts error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /accounts/:id — Disconnect a social account
 */
router.delete('/accounts/:id', async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    const { id } = req.params;
    if (!workspaceId) return res.status(400).json({ success: false, error: 'workspaceId required' });

    const existing = await pool.query(
      `SELECT platform_account_id FROM ${SCHEMA}.social_accounts WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [id, workspaceId]
    );

    const remoteAccountId = existing.rows[0]?.platform_account_id;
    if (remoteAccountId) {
      await disconnectSocialAccount(remoteAccountId).catch((err) => {
        console.warn('[SocialMedia] remote disconnect error:', err.message);
      });
    }

    await pool.query(
      remoteAccountId
        ? `DELETE FROM ${SCHEMA}.social_accounts WHERE workspace_id = $1 AND platform_account_id = $2`
        : `DELETE FROM ${SCHEMA}.social_accounts WHERE id = $2 AND workspace_id = $1`,
      [workspaceId, remoteAccountId || id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[SocialMedia] disconnect error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /accounts/platform/:platform — Disconnect all accounts for a specific platform
 */
router.delete('/accounts/platform/:platform', async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    const { platform } = req.params;
    if (!workspaceId) return res.status(400).json({ success: false, error: 'workspaceId required' });

    const { rowCount } = await pool.query(
      `DELETE FROM ${SCHEMA}.social_accounts WHERE workspace_id = $1 AND platform = $2`,
      [workspaceId, platform]
    );

    res.json({ success: true, deleted: rowCount });
  } catch (err) {
    console.error('[SocialMedia] disconnect platform error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /post — Create a social media post
 */
router.post('/post', async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ success: false, error: 'workspaceId required' });

    const { caption, social_account_ids, scheduled_at } = req.body;
    if (!caption) return res.status(400).json({ success: false, error: 'caption is required' });

    // Check quota
    const quotaCheck = await checkSocialPostsQuota(workspaceId);
    if (!quotaCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: 'Social posts quota exceeded',
        quota: quotaCheck,
        upgrade_url: '/billing',
      });
    }

    // Get accounts to post to
    let accounts;
    if (social_account_ids && social_account_ids.length > 0) {
      const { rows } = await pool.query(
        `SELECT platform_account_id FROM ${SCHEMA}.social_accounts
         WHERE workspace_id = $1 AND id = ANY($2)`,
        [workspaceId, social_account_ids]
      );
      accounts = rows.map(r => r.platform_account_id);
    } else {
      // Post to all connected accounts
      const { rows } = await pool.query(
        `SELECT platform_account_id FROM ${SCHEMA}.social_accounts WHERE workspace_id = $1`,
        [workspaceId]
      );
      accounts = rows.map(r => r.platform_account_id);
    }

    if (!accounts.length) {
      return res.status(400).json({ success: false, error: 'No social accounts connected. Connect accounts first.' });
    }

    // Call Post for Me API
    const data = await createSocialPost({
      caption,
      socialAccounts: accounts,
      scheduledAt: scheduled_at,
      externalId: getExternalId(workspaceId),
    });

    // Track usage
    for (const acctId of accounts) {
      await pool.query(
        `INSERT INTO ${SCHEMA}.social_posts_usage (workspace_id, platform, post_id, caption, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [workspaceId, 'multi', data.id || data.post_id || null, caption.slice(0, 500), 'processing']
      ).catch(() => {});
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error('[SocialMedia] post error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /posts — List recent posts for workspace
 */
router.get('/posts', async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ success: false, error: 'workspaceId required' });

    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const { rows } = await pool.query(
      `SELECT id, platform, post_id, caption, status, created_at
       FROM ${SCHEMA}.social_posts_usage
       WHERE workspace_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [workspaceId, limit]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[SocialMedia] list posts error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /usage — Get social posts usage stats for current period
 */
router.get('/usage', async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ success: false, error: 'workspaceId required' });

    const quota = await checkSocialPostsQuota(workspaceId);
    res.json({ success: true, data: quota });
  } catch (err) {
    console.error('[SocialMedia] usage error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Sync social accounts from Post for Me to local DB
 */
async function syncAccounts(workspaceId) {
  try {
    const externalId = getExternalId(workspaceId);
    const accounts = await listSocialAccounts({ externalId, status: 'connected' });

    if (!Array.isArray(accounts)) return;

    const connectedPlatforms = new Set();
    for (const acct of accounts) {
      const platform = toInternalPlatform(acct.platform || acct.type || 'unknown');
      connectedPlatforms.add(platform);
      const remoteAccountId = acct.id || acct.social_account_id;
      const accountName = acct.name || acct.username || acct.display_name || '';
      const accountType = acct.account_type || 'personal';
      const metadata = JSON.stringify(acct);

      const updateResult = await pool.query(
        `UPDATE ${SCHEMA}.social_accounts
            SET platform = $3,
                account_name = $4,
                account_type = $5,
                external_id = $6,
                metadata = $7,
                updated_at = NOW()
          WHERE workspace_id = $1
            AND platform_account_id = $2`,
        [workspaceId, remoteAccountId, platform, accountName, accountType, externalId, metadata]
      );

      if (updateResult.rowCount === 0) {
        await pool.query(
          `INSERT INTO ${SCHEMA}.social_accounts
            (workspace_id, platform, platform_account_id, account_name, account_type, external_id, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [workspaceId, platform, remoteAccountId, accountName, accountType, externalId, metadata]
        ).catch(() => {});
      }
    }

    // Keep only the most recent local row per remote account id.
    await pool.query(
      `DELETE FROM ${SCHEMA}.social_accounts a
       USING ${SCHEMA}.social_accounts b
       WHERE a.workspace_id = $1
         AND b.workspace_id = $1
         AND a.platform_account_id IS NOT NULL
         AND a.platform_account_id = b.platform_account_id
         AND a.id <> b.id
         AND COALESCE(a.updated_at, a.connected_at, a.created_at) < COALESCE(b.updated_at, b.connected_at, b.created_at)`,
      [workspaceId]
    ).catch(() => {});

    for (const provider of connectedPlatforms) {
      if (!SOCIAL_PROVIDERS.includes(provider)) continue;
      await pool.query(
        `INSERT INTO ${SCHEMA}.workspace_integrations
          (workspace_id, provider, connected, status, connected_at, updated_at)
         VALUES ($1, $2, TRUE, 'connected', NOW(), NOW())
         ON CONFLICT (workspace_id, provider) DO UPDATE SET
           connected = TRUE,
           status = 'connected',
           connected_at = COALESCE(${SCHEMA}.workspace_integrations.connected_at, NOW()),
           updated_at = NOW()`,
        [workspaceId, provider]
      ).catch(() => {});
    }

    if (connectedPlatforms.size > 0) {
      await pool.query(
        `INSERT INTO ${SCHEMA}.workspace_integrations
          (workspace_id, provider, connected, status, connected_at, updated_at)
         VALUES ($1, 'social_media', TRUE, 'connected', NOW(), NOW())
         ON CONFLICT (workspace_id, provider) DO UPDATE SET
           connected = TRUE,
           status = 'connected',
           connected_at = COALESCE(${SCHEMA}.workspace_integrations.connected_at, NOW()),
           updated_at = NOW()`,
        [workspaceId]
      ).catch(() => {});
    }
  } catch (err) {
    console.warn('[SocialMedia] syncAccounts error:', err.message);
  }
}

/**
 * Check social posts quota for a workspace
 * Returns { allowed, used, limit, percentage, addon_posts }
 */
async function checkSocialPostsQuota(workspaceId) {
  try {
    // Count posts this month
    const { rows: usageRows } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM ${SCHEMA}.social_posts_usage
       WHERE workspace_id = $1 AND created_at >= date_trunc('month', NOW())`,
      [workspaceId]
    );
    const used = parseInt(usageRows[0]?.cnt || 0, 10);

    // Get plan limit from workspace_settings
    let planLimit = 0; // Free plan = 0 social posts
    try {
      const { rows: settingsRows } = await pool.query(
        `SELECT value FROM ${SCHEMA}.workspace_settings WHERE workspace_id = $1 AND key = 'billing_plan'`,
        [workspaceId]
      );
      const plan = normalizePlanId(settingsRows[0]?.value?.plan || settingsRows[0]?.value || 'free');
      planLimit = getPlan(plan).limits.social_posts_month || 0;
    } catch (_) {}

    // Check for addon packs
    let addonPosts = 0;
    try {
      const { rows: addonRows } = await pool.query(
        `SELECT COALESCE(SUM(posts_included), 0) AS total FROM ${SCHEMA}.social_media_addons
         WHERE workspace_id = $1 AND status = 'active'`,
        [workspaceId]
      );
      addonPosts = parseInt(addonRows[0]?.total || 0, 10);
    } catch (_) {}

    const totalLimit = planLimit + addonPosts;
    const percentage = totalLimit > 0 ? Math.round((used / totalLimit) * 100) : (used > 0 ? 100 : 0);

    return {
      allowed: used < totalLimit,
      used,
      limit: totalLimit,
      plan_limit: planLimit,
      addon_posts: addonPosts,
      percentage,
    };
  } catch (err) {
    console.error('[SocialMedia] quota check error:', err.message);
    return { allowed: false, used: 0, limit: 0, percentage: 0, error: err.message };
  }
}

module.exports = router;
module.exports.checkSocialPostsQuota = checkSocialPostsQuota;
