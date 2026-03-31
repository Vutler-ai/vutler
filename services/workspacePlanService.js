'use strict';

const { PLANS, getPlan } = require('../packages/core/middleware/featureGate');

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

  await pool.query(
    `INSERT INTO ${SCHEMA}.workspace_settings (id, workspace_id, key, value, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'billing_plan', $2::jsonb, NOW(), NOW())
     ON CONFLICT (workspace_id, key)
     DO UPDATE SET
       value = EXCLUDED.value,
       updated_at = NOW()`,
    [workspaceId, JSON.stringify(snapshot)]
  );

  return snapshot;
}

module.exports = {
  DEFAULT_PLAN,
  buildPlanSnapshot,
  normalizePlanId,
  syncWorkspacePlan,
};
