'use strict';

const express = require('express');
const router = express.Router();
const { PLANS } = require('../packages/core/middleware/featureGate');

let pool;
try { pool = require('../lib/vaultbrix'); } catch (e) {
  try { pool = require('../pg-updated'); } catch (e2) { console.error('[Billing] No DB pool found'); }
}

const SCHEMA = 'tenant_vutler';
const STRIPE_ACCOUNT_ID = process.env.STRIPE_ACCOUNT_ID || 'acct_1T2tqGDj0FRggNOE';
let _stripe;
function getStripe() {
  if (!_stripe) { const Stripe = require('stripe'); _stripe = new Stripe(process.env.STRIPE_SECRET_KEY); }
  return _stripe;
}
function getStripePriceId(planId, interval) {
  return process.env[`STRIPE_PRICE_${planId.toUpperCase()}_${interval.toUpperCase()}`] || null;
}

const ADDONS = [
  { id: 'extra_nexus_node', label: 'Extra Nexus Node', price: 1900, unit: 'node/month' },
  { id: 'extra_agents_10',  label: 'Extra 10 Agents',  price: 1200, unit: '10 agents/month' },
];

router.get('/billing/plans', (req, res) => {
  const grouped = { office: [], agents: [], full: [], addons: ADDONS };
  for (const [id, plan] of Object.entries(PLANS)) {
    if (!plan.price || (plan.price.monthly === 0 && plan.price.yearly === 0)) continue;
    const entry = { id, label: plan.label, price: plan.price, features: plan.features, limits: plan.limits };
    if (plan.tier === 'office')       grouped.office.push(entry);
    else if (plan.tier === 'agents')  grouped.agents.push(entry);
    else if (plan.tier === 'full')    grouped.full.push(entry);
  }
  res.json({ success: true, data: grouped });
});

router.get('/billing/subscription', async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ success: false, error: 'workspaceId required' });

    const subRow = pool
      ? (await pool.query(
          `SELECT * FROM ${SCHEMA}.workspace_subscriptions WHERE workspace_id = $1 AND status = 'active' LIMIT 1`,
          [workspaceId]
        )).rows[0]
      : null;

    if (!subRow) {
      return res.json({ success: true, data: { plan: 'free', status: 'active', subscription: null } });
    }

    const planDef = PLANS[subRow.plan_id] || PLANS.free;
    let usage = null;
    if (pool) {
      const usageRes = await pool.query(
        `SELECT metric, value FROM ${SCHEMA}.usage_records WHERE workspace_id = $1`,
        [workspaceId]
      );
      usage = Object.fromEntries(usageRes.rows.map(r => [r.metric, r.value]));
    }

    res.json({
      success: true,
      data: {
        plan: subRow.plan_id,
        label: planDef.label,
        status: subRow.status,
        interval: subRow.interval,
        currentPeriodStart: subRow.current_period_start,
        currentPeriodEnd: subRow.current_period_end,
        cancelAtPeriodEnd: subRow.cancel_at_period_end,
        stripeSubscriptionId: subRow.stripe_subscription_id,
        stripeCustomerId: subRow.stripe_customer_id,
        limits: planDef.limits,
        usage,
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
    if (!priceId) return res.status(400).json({ success: false, error: `No Stripe price configured for ${planId}/${interval}` });

    const stripe = getStripe();
    const email = req.userEmail || req.user?.email;
    let customerId;

    if (email) {
      const existing = await stripe.customers.list({ email, limit: 1 }, { stripeAccount: STRIPE_ACCOUNT_ID });
      customerId = existing.data.length
        ? existing.data[0].id
        : (await stripe.customers.create(
            { email, metadata: { userId: req.userId, workspaceId: req.workspaceId } },
            { stripeAccount: STRIPE_ACCOUNT_ID }
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

    const session = await stripe.checkout.sessions.create(params, { stripeAccount: STRIPE_ACCOUNT_ID });
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
      const row = (await pool.query(
        `SELECT stripe_customer_id FROM ${SCHEMA}.workspace_subscriptions WHERE workspace_id = $1 AND status = 'active' LIMIT 1`,
        [workspaceId]
      )).rows[0];
      customerId = row?.stripe_customer_id;
    }

    if (!customerId) {
      const email = req.userEmail || req.user?.email;
      if (!email) return res.status(404).json({ success: false, error: 'No billing account found' });
      const stripe = getStripe();
      const list = await stripe.customers.list({ email, limit: 1 }, { stripeAccount: STRIPE_ACCOUNT_ID });
      if (!list.data.length) return res.status(404).json({ success: false, error: 'No billing account found. Subscribe to a plan first.' });
      customerId = list.data[0].id;
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create(
      { customer: customerId, return_url: req.body.returnUrl || 'https://app.vutler.ai/billing' },
      { stripeAccount: STRIPE_ACCOUNT_ID }
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
      const { planId, interval, workspaceId } = s.metadata || {};
      if (pool && workspaceId && planId) {
        const q = `INSERT INTO ${SCHEMA}.workspace_subscriptions
          (workspace_id,plan_id,interval,status,stripe_customer_id,stripe_subscription_id,current_period_start,current_period_end,cancel_at_period_end)
          VALUES($1,$2,$3,'active',$4,$5,NOW(),NOW()+INTERVAL '1 month',false)
          ON CONFLICT(workspace_id) DO UPDATE SET plan_id=$2,interval=$3,status='active',
          stripe_customer_id=$4,stripe_subscription_id=$5,current_period_start=NOW(),
          current_period_end=NOW()+INTERVAL '1 month',cancel_at_period_end=false`;
        await pool.query(q, [workspaceId, planId, interval, s.customer, s.subscription]);
      }
    } else if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object;
      if (pool) {
        await pool.query(
          `UPDATE ${SCHEMA}.workspace_subscriptions SET
             status=$1, current_period_start=to_timestamp($2), current_period_end=to_timestamp($3),
             cancel_at_period_end=$4
           WHERE stripe_subscription_id=$5`,
          [sub.status, sub.current_period_start, sub.current_period_end, sub.cancel_at_period_end, sub.id]
        );
      }
    } else if (event.type === 'customer.subscription.deleted') {
      if (pool) {
        await pool.query(
          `UPDATE ${SCHEMA}.workspace_subscriptions SET status='canceled' WHERE stripe_subscription_id=$1`,
          [event.data.object.id]
        );
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error('[Billing] webhook handler error:', err.message);
    res.status(500).json({ error: err.message });
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

    if (subRow?.stripe_subscription_id) {
      const stripe = getStripe();
      const interval = subRow.interval || 'monthly';
      const newPriceId = getStripePriceId(planId, interval);
      if (!newPriceId) return res.status(400).json({ success: false, error: `No Stripe price configured for ${planId}/${interval}` });

      const stripeSub = await stripe.subscriptions.retrieve(subRow.stripe_subscription_id, {}, { stripeAccount: STRIPE_ACCOUNT_ID });
      await stripe.subscriptions.update(
        subRow.stripe_subscription_id,
        { items: [{ id: stripeSub.items.data[0].id, price: newPriceId }], proration_behavior: 'create_prorations' },
        { stripeAccount: STRIPE_ACCOUNT_ID }
      );
    }

    if (pool && workspaceId) {
      await pool.query(
        `UPDATE ${SCHEMA}.workspace_subscriptions SET plan_id=$1 WHERE workspace_id=$2`,
        [planId, workspaceId]
      );
    }

    res.json({ success: true, data: { planId, label: PLANS[planId].label } });
  } catch (err) {
    console.error('[Billing] change-plan error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
