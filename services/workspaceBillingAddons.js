'use strict';

let pool;
try {
  pool = require('../lib/vaultbrix');
} catch (_) {
  try {
    pool = require('../lib/postgres').pool;
  } catch (_) {
    pool = null;
  }
}

const SCHEMA = 'tenant_vutler';

let ensurePromise = null;

async function ensureWorkspaceBillingAddonTable(db = pool) {
  if (!db) return;
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.workspace_billing_addons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL,
        addon_id TEXT NOT NULL,
        addon_type TEXT NOT NULL DEFAULT 'generic',
        quantity INTEGER NOT NULL DEFAULT 1,
        config JSONB NOT NULL DEFAULT '{}'::jsonb,
        stripe_subscription_id TEXT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        current_period_start TIMESTAMPTZ NULL,
        current_period_end TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_workspace_billing_addons_workspace_status
      ON ${SCHEMA}.workspace_billing_addons (workspace_id, status, addon_id)
    `);

    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_billing_addons_subscription
      ON ${SCHEMA}.workspace_billing_addons (stripe_subscription_id)
      WHERE stripe_subscription_id IS NOT NULL
    `);
  })().catch((error) => {
    ensurePromise = null;
    throw error;
  });

  return ensurePromise;
}

function mapAddon(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    addonId: row.addon_id,
    addonType: row.addon_type,
    quantity: Number(row.quantity || 0),
    config: row.config || {},
    stripeSubscriptionId: row.stripe_subscription_id || null,
    status: row.status,
    currentPeriodStart: row.current_period_start || null,
    currentPeriodEnd: row.current_period_end || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function upsertWorkspaceBillingAddon(input = {}, db = pool) {
  if (!db) return null;
  await ensureWorkspaceBillingAddonTable(db);

  const result = await db.query(
    `INSERT INTO ${SCHEMA}.workspace_billing_addons (
       workspace_id,
       addon_id,
       addon_type,
       quantity,
       config,
       stripe_subscription_id,
       status,
       current_period_start,
       current_period_end
     )
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
     ON CONFLICT (stripe_subscription_id)
     WHERE stripe_subscription_id IS NOT NULL
     DO UPDATE SET
       addon_id = EXCLUDED.addon_id,
       addon_type = EXCLUDED.addon_type,
       quantity = EXCLUDED.quantity,
       config = EXCLUDED.config,
       status = EXCLUDED.status,
       current_period_start = EXCLUDED.current_period_start,
       current_period_end = EXCLUDED.current_period_end,
       updated_at = NOW()
     RETURNING *`,
    [
      input.workspaceId,
      input.addonId,
      input.addonType || 'generic',
      Math.max(1, Number(input.quantity || 1)),
      JSON.stringify(input.config || {}),
      input.stripeSubscriptionId || null,
      input.status || 'active',
      input.currentPeriodStart || null,
      input.currentPeriodEnd || null,
    ]
  );

  return mapAddon(result.rows[0]);
}

async function updateWorkspaceBillingAddonStatusByStripeSubscription(
  stripeSubscriptionId,
  input = {},
  db = pool
) {
  if (!db || !stripeSubscriptionId) return null;
  await ensureWorkspaceBillingAddonTable(db);

  const result = await db.query(
    `UPDATE ${SCHEMA}.workspace_billing_addons
        SET status = COALESCE($2, status),
            current_period_start = COALESCE($3, current_period_start),
            current_period_end = COALESCE($4, current_period_end),
            updated_at = NOW()
      WHERE stripe_subscription_id = $1
      RETURNING *`,
    [
      stripeSubscriptionId,
      input.status || null,
      input.currentPeriodStart || null,
      input.currentPeriodEnd || null,
    ]
  );

  return result.rows.map(mapAddon);
}

async function listWorkspaceBillingAddons(workspaceId, db = pool) {
  if (!db || !workspaceId) return [];
  await ensureWorkspaceBillingAddonTable(db);

  const result = await db.query(
    `SELECT *
       FROM ${SCHEMA}.workspace_billing_addons
      WHERE workspace_id = $1
      ORDER BY created_at DESC`,
    [workspaceId]
  );

  return result.rows.map(mapAddon);
}

async function getWorkspaceBillingAddonSummary(workspaceId, db = pool) {
  const addons = await listWorkspaceBillingAddons(workspaceId, db);
  const activeAddons = addons.filter((addon) => addon.status === 'active');

  const summary = {
    enterpriseSeats: 0,
    enterpriseNodes: 0,
    socialPosts: 0,
    active: activeAddons,
  };

  for (const addon of activeAddons) {
    if (addon.addonType === 'nexus_enterprise_seats') {
      summary.enterpriseSeats += Number(addon.config?.enterpriseSeats || addon.quantity || 0);
    }
    if (addon.addonType === 'nexus_enterprise_node') {
      summary.enterpriseNodes += Number(addon.config?.enterpriseNodes || addon.quantity || 0);
    }
    if (addon.addonType === 'social_posts') {
      summary.socialPosts += Number(addon.config?.postsIncluded || 0);
    }
  }

  return summary;
}

module.exports = {
  ensureWorkspaceBillingAddonTable,
  upsertWorkspaceBillingAddon,
  updateWorkspaceBillingAddonStatusByStripeSubscription,
  listWorkspaceBillingAddons,
  getWorkspaceBillingAddonSummary,
};
