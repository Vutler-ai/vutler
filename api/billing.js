'use strict';

const express = require('express');
const router = express.Router();
const { PLANS } = require('../packages/core/middleware/featureGate');
const { syncWorkspacePlan, normalizePlanId, getWorkspacePlanId } = require('../services/workspacePlanService');
const {
  getWorkspaceBillingAddonSummary,
  upsertWorkspaceBillingAddon,
  updateWorkspaceBillingAddonStatusByStripeSubscription,
} = require('../services/workspaceBillingAddons');
const { recordCreditTransaction } = require('../services/creditLedger');
const { ensureManagedProvider } = require('../services/managedProviderService');

let pool;
try { pool = require('../lib/vaultbrix'); } catch (e) {
  try { pool = require('../lib/postgres').pool; } catch (e2) { console.error('[Billing] No DB pool found'); }
}

const SCHEMA = 'tenant_vutler';
const STRIPE_ACCOUNT_ID = process.env.STRIPE_ACCOUNT_ID || null;
let _stripe;
function getStripe() {
  if (!_stripe) { const Stripe = require('stripe'); _stripe = new Stripe(process.env.STRIPE_SECRET_KEY); }
  return _stripe;
}
function getStripeRequestOptions() {
  return STRIPE_ACCOUNT_ID ? { stripeAccount: STRIPE_ACCOUNT_ID } : undefined;
}
function getStripePriceId(planId, interval) {
  return process.env[`STRIPE_PRICE_${planId.toUpperCase()}_${interval.toUpperCase()}`] || null;
}

const ADDONS = [
  { id: 'extra_nexus_clone',   label: 'Nexus Clone Node',    price: 1900, unit: 'node/month' },
  { id: 'extra_nexus_runtime', label: 'Nexus Runtime Node',  price: 3900, unit: 'node/month' },
  {
    id: 'nexus_enterprise_node',
    label: 'Nexus Enterprise Extra Node',
    price: 50000,
    unit: 'node/month',
    addonType: 'nexus_enterprise_node',
    enterpriseNodes: 1,
  },
  {
    id: 'nexus_enterprise_seats_5',
    label: 'Nexus Enterprise +5 Seats',
    price: 39000,
    unit: '5 seats/month',
    addonType: 'nexus_enterprise_seats',
    enterpriseSeats: 5,
  },
  { id: 'extra_agents_10',     label: 'Extra 10 Agents',     price: 1200, unit: '10 agents/month' },
  { id: 'extra_user',          label: 'Extra User',          price: 500,  unit: 'user/month' },
  { id: 'extra_storage_10gb',  label: 'Extra 10GB Storage',  price: 500,  unit: '10GB/month' },
  { id: 'social_posts_100',    label: '100 Social Posts',    price: 500,  unit: '100 posts/month',  addonType: 'social_posts', posts: 100 },
  { id: 'social_posts_500',    label: '500 Social Posts',    price: 1900, unit: '500 posts/month',  addonType: 'social_posts', posts: 500 },
  { id: 'social_posts_2000',   label: '2000 Social Posts',   price: 4900, unit: '2000 posts/month', addonType: 'social_posts', posts: 2000 },
];

function normalizeBillingLimits(limits = {}) {
  const storageGb = limits.storage_gb;
  const nexusNodes = limits.nexus_nodes;
  const nexusEnterpriseNodes = limits.nexus_enterprise;
  const nexusLocalNodes = limits.nexus_local;
  const socialPosts = limits.social_posts_month;
  const enterpriseSeats = limits.nexus_enterprise_seats;

  return {
    ...limits,
    storage_gb: storageGb,
    storage: storageGb === undefined ? undefined : (storageGb === -1 ? 'Unlimited' : `${storageGb} GB`),
    nexus_nodes: nexusNodes,
    nexusNodes,
    nexus_enterprise: nexusEnterpriseNodes,
    nexusEnterpriseNodes,
    nexus_local: nexusLocalNodes,
    nexusLocalNodes,
    nexus_enterprise_seats: enterpriseSeats,
    social_posts_month: socialPosts ?? 0,
    socialPosts: socialPosts ?? 0,
  };
}

function normalizeBillingPlanEntry(id, plan) {
  return {
    id,
    label: plan.label,
    price: plan.price,
    features: plan.features,
    limits: normalizeBillingLimits(plan.limits),
  };
}

function normalizeAddonEntry(addon) {
  return {
    id: addon.id,
    label: addon.label,
    price: addon.price,
    unit: addon.unit,
    addonType: addon.addonType || 'generic',
    enterpriseSeats: addon.enterpriseSeats || 0,
    enterpriseNodes: addon.enterpriseNodes || 0,
    posts: addon.posts || 0,
  };
}

async function recordAddonActivation({ workspaceId, addon, stripeSubscriptionId }) {
  if (!pool || !workspaceId || !addon) return;

  await upsertWorkspaceBillingAddon({
    workspaceId,
    addonId: addon.id,
    addonType: addon.addonType || 'generic',
    quantity: addon.enterpriseSeats || addon.enterpriseNodes || 1,
    config: {
      enterpriseSeats: addon.enterpriseSeats || 0,
      enterpriseNodes: addon.enterpriseNodes || 0,
      postsIncluded: addon.posts || 0,
      unit: addon.unit,
    },
    stripeSubscriptionId,
    status: 'active',
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  }, pool).catch((err) => console.error('[Billing] workspace addon insert error:', err.message));

  if (addon.posts) {
    await pool.query(
      `INSERT INTO ${SCHEMA}.social_media_addons
        (workspace_id, addon_id, posts_included, stripe_subscription_id, status, current_period_start, current_period_end)
       VALUES ($1, $2, $3, $4, 'active', NOW(), NOW() + INTERVAL '1 month')
       ON CONFLICT DO NOTHING`,
      [workspaceId, addon.id, addon.posts, stripeSubscriptionId]
    ).catch((err) => console.error('[Billing] addon insert error:', err.message));
  }
}

async function applyWorkspacePlan(workspaceId, planId, options = {}) {
  if (!pool || !workspaceId) return null;
  return syncWorkspacePlan({
    workspaceId,
    planId: normalizePlanId(planId),
    source: options.source || 'billing',
    status: options.status || 'active',
    interval: options.interval || null,
    stripeCustomerId: options.stripeCustomerId || null,
    stripeSubscriptionId: options.stripeSubscriptionId || null,
  });
}

async function applyManagedCreditsPurchase(workspaceId, session) {
  if (!pool || !workspaceId) return;

  const purchasedTokens = parseInt(session?.metadata?.tokens, 10) || 0;
  if (purchasedTokens <= 0) return;

  await pool.query(
    `INSERT INTO ${SCHEMA}.workspace_settings (id, workspace_id, key, value, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'trial_tokens_total', to_jsonb($2), NOW(), NOW())
     ON CONFLICT (workspace_id, key) DO UPDATE
       SET value = to_jsonb((workspace_settings.value::text::int + $2)), updated_at = NOW()`,
    [workspaceId, purchasedTokens]
  );

  await ensureManagedProvider(pool, workspaceId, {
    source: 'credits',
    forceDefault: false,
  });

  // Purchased credits do not expire.
  await pool.query(
    `DELETE FROM ${SCHEMA}.workspace_settings WHERE workspace_id = $1 AND key = 'trial_expires_at'`,
    [workspaceId]
  );

  await recordCreditTransaction(pool, {
    workspaceId,
    type: 'purchase',
    amount: purchasedTokens,
    metadata: {
      source: 'billing.webhook',
      pack_id: session?.metadata?.pack_id || null,
      stripe_session_id: session?.id || null,
      stripe_payment_intent: session?.payment_intent || null,
    },
  });

  console.log(`[Billing] Credits: +${purchasedTokens} tokens for workspace ${workspaceId}`);
}

router.get('/billing/plans', (req, res) => {
  const grouped = { office: [], agents: [], full: [], enterprise: [], addons: ADDONS.map(normalizeAddonEntry) };
  for (const [id, plan] of Object.entries(PLANS)) {
    if (id === 'beta') continue;
    if (id !== 'free' && id !== 'enterprise' && plan.price && plan.price.monthly === 0 && plan.price.yearly === 0) continue;
    const entry = normalizeBillingPlanEntry(id, plan);
    if (id === 'nexus_enterprise' || id === 'enterprise') grouped.enterprise.push(entry);
    else if (plan.tier === 'free' || plan.tier === 'office') grouped.office.push(entry);
    else if (plan.tier === 'agents') grouped.agents.push(entry);
    else if (plan.tier === 'full') grouped.full.push(entry);
  }
  res.json({ success: true, data: grouped });
});

router.get('/billing/subscription', async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ success: false, error: 'workspaceId required' });

    // ── Fetch subscription row (may not exist for free-tier workspaces) ──────
    let subRow = null;
    if (pool) {
      try {
        subRow = (await pool.query(
          `SELECT * FROM ${SCHEMA}.workspace_subscriptions WHERE workspace_id = $1 AND status = 'active' LIMIT 1`,
          [workspaceId]
        )).rows[0] || null;
      } catch (_) { /* table may not exist yet — treat as free */ }
    }

    // If no subscription record, try reading plan from workspace_settings
    let planId = subRow ? subRow.plan_id : 'free';
    if (!subRow && pool) {
      try {
        const settingsRow = (await pool.query(
          `SELECT value FROM ${SCHEMA}.workspace_settings WHERE workspace_id = $1 AND key = 'billing_plan' LIMIT 1`,
          [workspaceId]
        )).rows[0];
        if (settingsRow?.value) {
          const parsed = typeof settingsRow.value === 'string' ? JSON.parse(settingsRow.value) : settingsRow.value;
          planId = parsed.plan || parsed || 'free';
        }
      } catch (_) { /* no settings table — stay on free */ }
    }

    const planDef = PLANS[planId] || PLANS.free;
    const addonSummary = pool
      ? await getWorkspaceBillingAddonSummary(workspaceId, pool).catch(() => ({
          enterpriseSeats: 0,
          enterpriseNodes: 0,
          socialPosts: 0,
          active: [],
        }))
      : {
          enterpriseSeats: 0,
          enterpriseNodes: 0,
          socialPosts: 0,
          active: [],
        };
    const normalizedLimits = normalizeBillingLimits(planDef.limits);
    if (normalizedLimits.nexus_nodes !== undefined && normalizedLimits.nexus_nodes !== -1) {
      normalizedLimits.nexus_nodes += addonSummary.enterpriseNodes;
      normalizedLimits.nexusNodes = normalizedLimits.nexus_nodes;
    }
    if (normalizedLimits.nexus_enterprise !== undefined && normalizedLimits.nexus_enterprise !== -1) {
      normalizedLimits.nexus_enterprise += addonSummary.enterpriseNodes;
      normalizedLimits.nexusEnterpriseNodes = normalizedLimits.nexus_enterprise;
    }
    if (normalizedLimits.nexus_enterprise_seats !== undefined && normalizedLimits.nexus_enterprise_seats !== -1) {
      normalizedLimits.nexus_enterprise_seats += addonSummary.enterpriseSeats;
    }
    if (normalizedLimits.social_posts_month !== undefined && normalizedLimits.social_posts_month !== -1) {
      normalizedLimits.social_posts_month += addonSummary.socialPosts;
      normalizedLimits.socialPosts = normalizedLimits.social_posts_month;
    }

    // ── Gather real usage data ────────────────────────────────────────────────
    let agentCount = 0;
    let tokenUsed  = 0;
    let storageBytesUsed = 0;

    if (pool) {
      // Agent count
      try {
        const agentRes = await pool.query(
          `SELECT COUNT(*) AS cnt FROM ${SCHEMA}.agents WHERE workspace_id = $1`,
          [workspaceId]
        );
        agentCount = parseInt(agentRes.rows[0]?.cnt || 0, 10);
      } catch (_) {}

      // Token usage from usage_logs (most common table name in Vutler)
      const TOKEN_QUERIES = [
        `SELECT COALESCE(SUM(tokens_input + tokens_output), 0) AS total FROM ${SCHEMA}.llm_usage_logs WHERE workspace_id = $1`,
        `SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total FROM ${SCHEMA}.usage_logs WHERE workspace_id = $1`,
        `SELECT COALESCE(SUM(tokens_used), 0) AS total FROM ${SCHEMA}.agent_executions WHERE workspace_id = $1`,
        `SELECT COALESCE(SUM(value::bigint), 0) AS total FROM ${SCHEMA}.usage_records WHERE workspace_id = $1 AND metric = 'tokens_month'`,
      ];
      for (const q of TOKEN_QUERIES) {
        try {
          const r = await pool.query(q, [workspaceId]);
          tokenUsed = parseInt(r.rows[0]?.total || 0, 10);
          if (tokenUsed > 0) break; // found real data
        } catch (_) {}
      }

      // Storage (drive files) — best-effort
      try {
        const storageRes = await pool.query(
          `SELECT COALESCE(SUM(size), 0) AS total FROM ${SCHEMA}.drive_files WHERE workspace_id = $1`,
          [workspaceId]
        );
        storageBytesUsed = parseInt(storageRes.rows[0]?.total || 0, 10);
      } catch (_) {}
    }

    const storageGbUsed = parseFloat((storageBytesUsed / (1024 ** 3)).toFixed(3));

    // Social posts usage this month
    let socialPostsUsed = 0;
    let socialPostsAddon = 0;
    if (pool) {
      try {
        const spRes = await pool.query(
          `SELECT COUNT(*) AS cnt FROM ${SCHEMA}.social_posts_usage
           WHERE workspace_id = $1 AND created_at >= date_trunc('month', NOW())`,
          [workspaceId]
        );
        socialPostsUsed = parseInt(spRes.rows[0]?.cnt || 0, 10);
      } catch (_) {}
      try {
        const addonRes = await pool.query(
          `SELECT COALESCE(SUM(posts_included), 0) AS total FROM ${SCHEMA}.social_media_addons
           WHERE workspace_id = $1 AND status = 'active'`,
          [workspaceId]
        );
        socialPostsAddon = parseInt(addonRes.rows[0]?.total || 0, 10);
      } catch (_) {}
    }

    const socialPostsLimit = normalizedLimits.social_posts_month ?? 0;

    const usage = {
      agents:       { used: agentCount,      limit: normalizedLimits.agents ?? 1 },
      tokens:       { used: tokenUsed,       limit: normalizedLimits.tokens_month ?? normalizedLimits.tokens ?? 50000 },
      storage_gb:   { used: storageGbUsed,   limit: normalizedLimits.storage_gb ?? 1 },
      social_posts: { used: socialPostsUsed, limit: socialPostsLimit, addon: socialPostsAddon },
    };

    if (!subRow) {
      // Free / settings-only plan — return minimal payload so billing page renders
      return res.json({
        success: true,
        data: {
          plan: planId,
          planId,
          label: planDef.label,
          status: 'active',
          interval: null,
          current_period_end: null,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          stripeSubscriptionId: null,
          stripeCustomerId: null,
          limits: normalizedLimits,
          usage,
          addons: {
            enterpriseSeats: addonSummary.enterpriseSeats,
            enterpriseNodes: addonSummary.enterpriseNodes,
            socialPosts: addonSummary.socialPosts,
            active: addonSummary.active,
          },
        },
      });
    }

    res.json({
      success: true,
      data: {
        plan: subRow.plan_id,
        planId: subRow.plan_id,
        label: planDef.label,
        status: subRow.status,
        interval: subRow.interval,
        current_period_end: subRow.current_period_end,
        currentPeriodStart: subRow.current_period_start,
        currentPeriodEnd: subRow.current_period_end,
        cancelAtPeriodEnd: subRow.cancel_at_period_end,
        stripeSubscriptionId: subRow.stripe_subscription_id,
        stripeCustomerId: subRow.stripe_customer_id,
        limits: normalizedLimits,
        usage,
        addons: {
          enterpriseSeats: addonSummary.enterpriseSeats,
          enterpriseNodes: addonSummary.enterpriseNodes,
          socialPosts: addonSummary.socialPosts,
          active: addonSummary.active,
        },
      },
    });
  } catch (err) {
    console.error('[Billing] subscription error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/billing/checkout', async (req, res) => {
  try {
    const { planId, interval = 'monthly', successUrl, cancelUrl } = req.body;

    if (!planId || !PLANS[planId]) return res.status(400).json({ success: false, error: 'Invalid planId' });
    if (!['monthly', 'yearly'].includes(interval)) return res.status(400).json({ success: false, error: 'interval must be monthly or yearly' });

    const priceId = getStripePriceId(planId, interval);

    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('[Billing] STRIPE_SECRET_KEY is not set');
      return res.status(500).json({ success: false, error: 'Stripe is not configured on this server' });
    }
    if (!priceId) {
      console.error(`[Billing] No Stripe price ID found for ${planId}/${interval}. Set STRIPE_PRICE_${planId.toUpperCase()}_${interval.toUpperCase()} env var.`);
      return res.status(400).json({ success: false, error: `No price configured for plan "${planId}" (${interval}). Run scripts/stripe-setup.js to create prices.` });
    }

    const stripe = getStripe();
    const email = req.userEmail || req.user?.email;
    let customerId;

    if (email) {
      const existing = await stripe.customers.list({ email, limit: 1 }, getStripeRequestOptions());
      customerId = existing.data.length
        ? existing.data[0].id
        : (await stripe.customers.create(
            { email, metadata: { userId: req.userId, workspaceId: req.workspaceId } },
            getStripeRequestOptions()
          )).id;
    }

    const params = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl || 'https://app.vutler.ai/billing?success=true',
      cancel_url:  cancelUrl  || 'https://app.vutler.ai/billing?canceled=true',
      metadata: { planId, interval, userId: req.userId, workspaceId: req.workspaceId },
    };
    if (customerId) params.customer = customerId;
    else if (email)  params.customer_email = email;

    const session = await stripe.checkout.sessions.create(params, getStripeRequestOptions());
    res.json({ success: true, data: { url: session.url } });
  } catch (err) {
    console.error('[Billing] checkout error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/billing/portal', async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    let customerId;

    if (pool && workspaceId) {
      try {
        const row = (await pool.query(
          `SELECT stripe_customer_id FROM ${SCHEMA}.workspace_subscriptions WHERE workspace_id = $1 AND status = 'active' LIMIT 1`,
          [workspaceId]
        )).rows[0];
        customerId = row?.stripe_customer_id;
      } catch (_) {}
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('[Billing] STRIPE_SECRET_KEY is not set');
      return res.status(500).json({ success: false, error: 'Stripe is not configured on this server' });
    }

    const stripe = getStripe();

    // If no customerId from DB, try to find by email
    if (!customerId) {
      const email = req.userEmail || req.user?.email;
      if (!email) return res.status(404).json({ success: false, error: 'No billing account found' });
      const list = await stripe.customers.list({ email, limit: 1 }, getStripeRequestOptions());
      if (!list.data.length) return res.status(404).json({ success: false, error: 'No billing account found. Subscribe to a plan first.' });
      customerId = list.data[0].id;
    }

    const session = await stripe.billingPortal.sessions.create(
      { customer: customerId, return_url: req.body.returnUrl || 'https://app.vutler.ai/billing' },
      getStripeRequestOptions()
    );
    res.json({ success: true, data: { url: session.url } });
  } catch (err) {
    console.error('[Billing] portal error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripe = getStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[Billing] Webhook signature failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object;
      const { planId, interval, workspaceId, addonId, type } = s.metadata || {};

      if (type === 'credits' && pool && workspaceId) {
        await applyManagedCreditsPurchase(workspaceId, s);
      } else if (type === 'addon' && pool && workspaceId && addonId) {
        // Handle addon purchase (social posts packs, etc.)
        const addon = ADDONS.find(a => a.id === addonId);
        await recordAddonActivation({ workspaceId, addon, stripeSubscriptionId: s.subscription });
        console.log(`[Billing] Addon ${addonId} activated for workspace ${workspaceId}`);
      } else if (pool && workspaceId && planId) {
        const q = `INSERT INTO ${SCHEMA}.workspace_subscriptions
          (workspace_id,plan_id,interval,status,stripe_customer_id,stripe_subscription_id,current_period_start,current_period_end,cancel_at_period_end)
          VALUES($1,$2,$3,'active',$4,$5,NOW(),NOW()+INTERVAL '1 month',false)
          ON CONFLICT(workspace_id) DO UPDATE SET plan_id=$2,interval=$3,status='active',
          stripe_customer_id=$4,stripe_subscription_id=$5,current_period_start=NOW(),
          current_period_end=NOW()+INTERVAL '1 month',cancel_at_period_end=false`;
        await pool.query(q, [workspaceId, planId, interval, s.customer, s.subscription]);
        await applyWorkspacePlan(workspaceId, planId, {
          source: 'billing.webhook.checkout',
          status: 'active',
          interval,
          stripeCustomerId: s.customer,
          stripeSubscriptionId: s.subscription,
        });
      }
    } else if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object;
      if (pool) {
        await updateWorkspaceBillingAddonStatusByStripeSubscription(
          sub.id,
          {
            status: sub.status === 'active' ? 'active' : 'canceled',
            currentPeriodStart: new Date(sub.current_period_start * 1000),
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
          },
          pool
        ).catch(() => {});
        await pool.query(
          `UPDATE ${SCHEMA}.workspace_subscriptions SET
             status=$1, current_period_start=to_timestamp($2), current_period_end=to_timestamp($3),
             cancel_at_period_end=$4
           WHERE stripe_subscription_id=$5`,
          [sub.status, sub.current_period_start, sub.current_period_end, sub.cancel_at_period_end, sub.id]
        );
        // Also update addon subscriptions
        await pool.query(
          `UPDATE ${SCHEMA}.social_media_addons SET status=$1 WHERE stripe_subscription_id=$2`,
          [sub.status === 'active' ? 'active' : 'canceled', sub.id]
        ).catch(() => {});
        const subRow = (await pool.query(
          `SELECT workspace_id, plan_id, interval, stripe_customer_id, stripe_subscription_id
             FROM ${SCHEMA}.workspace_subscriptions
            WHERE stripe_subscription_id = $1
            LIMIT 1`,
          [sub.id]
        )).rows[0];
        if (subRow?.workspace_id && subRow?.plan_id) {
          await applyWorkspacePlan(subRow.workspace_id, subRow.plan_id, {
            source: 'billing.webhook.subscription_updated',
            status: sub.status || 'active',
            interval: subRow.interval,
            stripeCustomerId: subRow.stripe_customer_id,
            stripeSubscriptionId: subRow.stripe_subscription_id,
          });
        }
      }
    } else if (event.type === 'customer.subscription.deleted') {
      if (pool) {
        const subRow = (await pool.query(
          `SELECT workspace_id
             FROM ${SCHEMA}.workspace_subscriptions
            WHERE stripe_subscription_id = $1
            LIMIT 1`,
          [event.data.object.id]
        )).rows[0];
        await pool.query(
          `UPDATE ${SCHEMA}.workspace_subscriptions SET status='canceled' WHERE stripe_subscription_id=$1`,
          [event.data.object.id]
        );
        await pool.query(
          `UPDATE ${SCHEMA}.social_media_addons SET status='canceled' WHERE stripe_subscription_id=$1`,
          [event.data.object.id]
        ).catch(() => {});
        await updateWorkspaceBillingAddonStatusByStripeSubscription(
          event.data.object.id,
          { status: 'canceled' },
          pool
        ).catch(() => {});
        if (subRow?.workspace_id) {
          await applyWorkspacePlan(subRow.workspace_id, 'free', {
            source: 'billing.webhook.subscription_deleted',
            status: 'canceled',
          });
        }
      }
    } else if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object;
      if (pool && invoice.subscription) {
        await updateWorkspaceBillingAddonStatusByStripeSubscription(
          invoice.subscription,
          { status: 'past_due' },
          pool
        ).catch(() => {});
        await pool.query(
          `UPDATE ${SCHEMA}.workspace_subscriptions SET status='past_due' WHERE stripe_subscription_id=$1`,
          [invoice.subscription]
        );
        console.warn('[Billing] Payment failed for subscription', invoice.subscription, '— marked past_due');
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error('[Billing] webhook handler error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Alias — some Stripe dashboard configs point to /billing/webhooks/stripe
router.post('/billing/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripe = getStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[Billing] Webhook signature failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object;
      const { planId, interval, workspaceId, addonId, type } = s.metadata || {};

      if (type === 'credits' && pool && workspaceId) {
        await applyManagedCreditsPurchase(workspaceId, s);
      } else if (type === 'addon' && pool && workspaceId && addonId) {
        const addon = ADDONS.find(a => a.id === addonId);
        await recordAddonActivation({ workspaceId, addon, stripeSubscriptionId: s.subscription });
      } else if (pool && workspaceId && planId) {
        const q = `INSERT INTO ${SCHEMA}.workspace_subscriptions
          (workspace_id,plan_id,interval,status,stripe_customer_id,stripe_subscription_id,current_period_start,current_period_end,cancel_at_period_end)
          VALUES($1,$2,$3,'active',$4,$5,NOW(),NOW()+INTERVAL '1 month',false)
          ON CONFLICT(workspace_id) DO UPDATE SET plan_id=$2,interval=$3,status='active',
          stripe_customer_id=$4,stripe_subscription_id=$5,current_period_start=NOW(),
          current_period_end=NOW()+INTERVAL '1 month',cancel_at_period_end=false`;
        await pool.query(q, [workspaceId, planId, interval, s.customer, s.subscription]);
        await applyWorkspacePlan(workspaceId, planId, {
          source: 'billing.webhook.checkout_alias',
          status: 'active',
          interval,
          stripeCustomerId: s.customer,
          stripeSubscriptionId: s.subscription,
        });
      }
    } else if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object;
      if (pool) {
        await updateWorkspaceBillingAddonStatusByStripeSubscription(
          sub.id,
          {
            status: sub.status === 'active' ? 'active' : 'canceled',
            currentPeriodStart: new Date(sub.current_period_start * 1000),
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
          },
          pool
        ).catch(() => {});
        await pool.query(
          `UPDATE ${SCHEMA}.workspace_subscriptions SET
             status=$1, current_period_start=to_timestamp($2), current_period_end=to_timestamp($3),
             cancel_at_period_end=$4
           WHERE stripe_subscription_id=$5`,
          [sub.status, sub.current_period_start, sub.current_period_end, sub.cancel_at_period_end, sub.id]
        );
        await pool.query(
          `UPDATE ${SCHEMA}.social_media_addons SET status=$1 WHERE stripe_subscription_id=$2`,
          [sub.status === 'active' ? 'active' : 'canceled', sub.id]
        ).catch(() => {});
        const subRow = (await pool.query(
          `SELECT workspace_id, plan_id, interval, stripe_customer_id, stripe_subscription_id
             FROM ${SCHEMA}.workspace_subscriptions
            WHERE stripe_subscription_id = $1
            LIMIT 1`,
          [sub.id]
        )).rows[0];
        if (subRow?.workspace_id && subRow?.plan_id) {
          await applyWorkspacePlan(subRow.workspace_id, subRow.plan_id, {
            source: 'billing.webhook.subscription_updated_alias',
            status: sub.status || 'active',
            interval: subRow.interval,
            stripeCustomerId: subRow.stripe_customer_id,
            stripeSubscriptionId: subRow.stripe_subscription_id,
          });
        }
      }
    } else if (event.type === 'customer.subscription.deleted') {
      if (pool) {
        const subRow = (await pool.query(
          `SELECT workspace_id
             FROM ${SCHEMA}.workspace_subscriptions
            WHERE stripe_subscription_id = $1
            LIMIT 1`,
          [event.data.object.id]
        )).rows[0];
        await pool.query(
          `UPDATE ${SCHEMA}.workspace_subscriptions SET status='canceled' WHERE stripe_subscription_id=$1`,
          [event.data.object.id]
        );
        await pool.query(
          `UPDATE ${SCHEMA}.social_media_addons SET status='canceled' WHERE stripe_subscription_id=$1`,
          [event.data.object.id]
        ).catch(() => {});
        await updateWorkspaceBillingAddonStatusByStripeSubscription(
          event.data.object.id,
          { status: 'canceled' },
          pool
        ).catch(() => {});
        if (subRow?.workspace_id) {
          await applyWorkspacePlan(subRow.workspace_id, 'free', {
            source: 'billing.webhook.subscription_deleted_alias',
            status: 'canceled',
          });
        }
      }
    } else if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object;
      if (pool && invoice.subscription) {
        await updateWorkspaceBillingAddonStatusByStripeSubscription(
          invoice.subscription,
          { status: 'past_due' },
          pool
        ).catch(() => {});
        await pool.query(
          `UPDATE ${SCHEMA}.workspace_subscriptions SET status='past_due' WHERE stripe_subscription_id=$1`,
          [invoice.subscription]
        );
        console.warn('[Billing] Payment failed for subscription', invoice.subscription, '— marked past_due');
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error('[Billing] webhook handler error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Add-on checkout (social posts packs, extra agents, etc.) ─────────────────
router.post('/billing/addon-checkout', async (req, res) => {
  try {
    const { addonId, successUrl, cancelUrl } = req.body;
    const addon = ADDONS.find(a => a.id === addonId);
    if (!addon) return res.status(400).json({ success: false, error: 'Invalid addonId' });

    if (addon.addonType && addon.addonType.startsWith('nexus_enterprise')) {
      const currentPlanId = await getWorkspacePlanId(pool, req.workspaceId).catch(() => 'free');
      if (currentPlanId !== 'nexus_enterprise') {
        return res.status(403).json({
          success: false,
          error: 'Nexus Enterprise add-ons require an active Nexus Enterprise base plan.',
        });
      }
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ success: false, error: 'Stripe is not configured' });
    }

    const priceId = process.env[`STRIPE_PRICE_ADDON_${addonId.toUpperCase()}`];
    if (!priceId) {
      return res.status(400).json({ success: false, error: `No Stripe price configured for addon "${addonId}". Run scripts/stripe-setup.js.` });
    }

    const stripe = getStripe();
    const email = req.userEmail || req.user?.email;
    let customerId;

    if (email) {
      const existing = await stripe.customers.list({ email, limit: 1 }, getStripeRequestOptions());
      customerId = existing.data.length
        ? existing.data[0].id
        : (await stripe.customers.create(
            { email, metadata: { userId: req.userId, workspaceId: req.workspaceId } },
            getStripeRequestOptions()
          )).id;
    }

    const params = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl || 'https://app.vutler.ai/billing?addon=success',
      cancel_url:  cancelUrl  || 'https://app.vutler.ai/billing?addon=canceled',
      metadata: { addonId, userId: req.userId, workspaceId: req.workspaceId, type: 'addon' },
    };
    if (customerId) params.customer = customerId;
    else if (email) params.customer_email = email;

    const session = await stripe.checkout.sessions.create(params, getStripeRequestOptions());
    res.json({ success: true, data: { url: session.url } });
  } catch (err) {
    console.error('[Billing] addon-checkout error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/billing/change-plan', async (req, res) => {
  try {
    const { planId } = req.body;
    if (!planId || !PLANS[planId]) return res.status(400).json({ success: false, error: 'Invalid planId' });
    const workspaceId = req.workspaceId;
    let subRow = null;
    if (pool && workspaceId) {
      subRow = (await pool.query(
        `SELECT * FROM ${SCHEMA}.workspace_subscriptions WHERE workspace_id = $1 AND status = 'active' LIMIT 1`,
        [workspaceId]
      )).rows[0];
    }

    // SECURITY: require active Stripe subscription for plan changes (audit 2026-03-28)
    if (!subRow?.stripe_subscription_id) {
      return res.status(402).json({ success: false, error: 'No active subscription. Please subscribe via checkout first.', redirect: '/billing' });
    }

    const stripe = getStripe();
    const interval = subRow.interval || 'monthly';
    const newPriceId = getStripePriceId(planId, interval);
    if (!newPriceId) return res.status(400).json({ success: false, error: `No Stripe price configured for ${planId}/${interval}` });

    const stripeSub = await stripe.subscriptions.retrieve(subRow.stripe_subscription_id, {}, getStripeRequestOptions());
    await stripe.subscriptions.update(
      subRow.stripe_subscription_id,
      { items: [{ id: stripeSub.items.data[0].id, price: newPriceId }], proration_behavior: 'create_prorations' },
      getStripeRequestOptions()
    );

    if (pool && workspaceId) {
      await pool.query(
        `UPDATE ${SCHEMA}.workspace_subscriptions SET plan_id=$1 WHERE workspace_id=$2`,
        [planId, workspaceId]
      );
      await applyWorkspacePlan(workspaceId, planId, {
        source: 'billing.change_plan',
        status: subRow.status || 'active',
        interval,
        stripeCustomerId: subRow.stripe_customer_id,
        stripeSubscriptionId: subRow.stripe_subscription_id,
      });
    }

    res.json({ success: true, data: { planId, label: PLANS[planId].label } });
  } catch (err) {
    console.error('[Billing] change-plan error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── LLM Credit Packs ──────────────────────────────────────────────────────────
const CREDIT_PACKS = [
  { id: 'credits_50k',  label: '50K tokens',  tokens: 50000,   price: 500,  currency: 'usd' },
  { id: 'credits_200k', label: '200K tokens', tokens: 200000,  price: 1500, currency: 'usd' },
  { id: 'credits_1m',   label: '1M tokens',   tokens: 1000000, price: 5000, currency: 'usd' },
];

router.get('/billing/credits', (req, res) => {
  res.json({
    success: true,
    data: CREDIT_PACKS.map(p => ({
      id: p.id,
      label: p.label,
      tokens: p.tokens,
      price_display: `$${(p.price / 100).toFixed(0)}`,
      price_cents: p.price,
    })),
  });
});

router.post('/billing/credits', async (req, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    if (!workspaceId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const { pack_id } = req.body || {};
    const pack = CREDIT_PACKS.find(p => p.id === pack_id);
    if (!pack) return res.status(400).json({ success: false, error: 'Invalid pack_id' });

    const stripe = getStripe();

    // Ensure Stripe customer exists
    let customerId;
    if (pool) {
      const sub = await pool.query(
        `SELECT stripe_customer_id FROM ${SCHEMA}.workspace_subscriptions WHERE workspace_id = $1 LIMIT 1`,
        [workspaceId]
      );
      customerId = sub.rows[0]?.stripe_customer_id;
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { workspaceId },
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: pack.currency,
          unit_amount: pack.price,
          product_data: { name: `Vutler LLM Credits — ${pack.label}` },
        },
        quantity: 1,
      }],
      metadata: {
        type: 'credits',
        pack_id: pack.id,
        tokens: String(pack.tokens),
        workspaceId,
      },
      success_url: `${process.env.APP_URL || 'https://app.vutler.ai'}/billing?credits=success`,
      cancel_url: `${process.env.APP_URL || 'https://app.vutler.ai'}/billing`,
    });

    res.json({ success: true, data: { checkout_url: session.url } });
  } catch (err) {
    console.error('[Billing] credits checkout error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
