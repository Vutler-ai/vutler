'use strict';

const { PLANS, getPlan, hasSniparaCapability } = require('../packages/core/middleware/featureGate');

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
const DEFAULT_PLAN = 'free';
const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';

function normalizePlanId(planId) {
  const candidate = String(planId || DEFAULT_PLAN).toLowerCase();
  return PLANS[candidate] ? candidate : DEFAULT_PLAN;
}

function buildPlanSnapshot(planId, metadata = {}) {
  const normalizedPlanId = normalizePlanId(planId);
  const plan = getPlan(normalizedPlanId);
  return {
    plan: normalizedPlanId,
    label: plan.label,
    products: plan.products,
    features: plan.features,
    limits: plan.limits,
    snipara: plan.snipara,
    source: metadata.source || 'system',
    status: metadata.status || 'active',
    interval: metadata.interval || null,
    stripe_customer_id: metadata.stripeCustomerId || null,
    stripe_subscription_id: metadata.stripeSubscriptionId || null,
    updated_at: new Date().toISOString(),
  };
}

async function getWorkspacePlanId(db = pool, workspaceId = DEFAULT_WORKSPACE) {
  if (!db || !workspaceId) return DEFAULT_PLAN;

  try {
    const settings = await db.query(
      `SELECT value
         FROM ${SCHEMA}.workspace_settings
        WHERE workspace_id = $1
          AND key = 'billing_plan'
        LIMIT 1`,
      [workspaceId]
    );
    const raw = settings.rows[0]?.value;
    const planFromSettings = raw && typeof raw === 'object' ? raw.plan : raw;
    if (planFromSettings) return normalizePlanId(planFromSettings);
  } catch (_) {
    void 0;
  }

  try {
    const workspaces = await db.query(
      `SELECT plan
         FROM ${SCHEMA}.workspaces
        WHERE id = $1
        LIMIT 1`,
      [workspaceId]
    );
    return normalizePlanId(workspaces.rows[0]?.plan || DEFAULT_PLAN);
  } catch (_) {
    return DEFAULT_PLAN;
  }
}

async function upsertWorkspaceSetting(db, workspaceId, key, value) {
  const serialized = JSON.stringify(value);
  const updated = await db.query(
    `UPDATE ${SCHEMA}.workspace_settings
     SET value = $3::jsonb,
         updated_at = NOW()
     WHERE workspace_id = $1
       AND key = $2`,
    [workspaceId, key, serialized]
  );

  if (updated.rowCount > 0) return;

  await db.query(
    `INSERT INTO ${SCHEMA}.workspace_settings (id, workspace_id, key, value, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3::jsonb, NOW(), NOW())`,
    [workspaceId, key, serialized]
  );
}

async function syncWorkspacePlan({
  workspaceId,
  planId,
  source = 'system',
  status = 'active',
  interval = null,
  stripeCustomerId = null,
  stripeSubscriptionId = null,
} = {}) {
  if (!pool) throw new Error('No database pool available for workspace plan sync');
  if (!workspaceId) throw new Error('workspaceId is required');

  const normalizedPlanId = normalizePlanId(planId);
  const snapshot = buildPlanSnapshot(normalizedPlanId, {
    source,
    status,
    interval,
    stripeCustomerId,
    stripeSubscriptionId,
  });

  await pool.query(
    `UPDATE ${SCHEMA}.workspaces
     SET plan = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [normalizedPlanId, workspaceId]
  );

  await upsertWorkspaceSetting(pool, workspaceId, 'billing_plan', snapshot);

  const memoryMode = hasSniparaCapability(normalizedPlanId, 'memory') ? 'active' : 'disabled';
  await upsertWorkspaceSetting(pool, workspaceId, 'memory_mode', memoryMode);
  await upsertWorkspaceSetting(pool, workspaceId, 'snipara_memory_mode', memoryMode);

  return snapshot;
}

module.exports = {
  DEFAULT_WORKSPACE,
  DEFAULT_PLAN,
  buildPlanSnapshot,
  getWorkspacePlanId,
  normalizePlanId,
  syncWorkspacePlan,
};
