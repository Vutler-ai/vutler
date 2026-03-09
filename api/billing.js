'use strict';

const express = require('express');
const router = express.Router();

const STRIPE_ACCOUNT_ID = process.env.STRIPE_ACCOUNT_ID || 'acct_1T2tqGDj0FRggNOE';

// Lazy-init Stripe to avoid issues if env not loaded yet
let _stripe;
function getStripe() {
  if (!_stripe) {
    const Stripe = require('stripe');
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

const PLANS = [
  { id: 'starter', name: 'Starter', priceId: 'price_1T8qX9Dj0FRggNOEqGCBUoUH', amount: 2900, currency: 'usd', interval: 'month', features: ['25 AI Agents', 'Priority Support', '10GB Storage', 'Advanced Models', 'Email Integration'] },
  { id: 'team', name: 'Team', priceId: 'price_1T8qXPDj0FRggNOECtmF6aYB', amount: 7900, currency: 'usd', interval: 'month', popular: true, features: ['100 AI Agents', '24/7 Support', '100GB Storage', 'Premium Models', 'Team Collaboration', 'API Access'] },
  { id: 'enterprise', name: 'Enterprise', priceId: 'price_1T8qXhDj0FRggNOEM5TAjxw2', amount: 19900, currency: 'usd', interval: 'month', features: ['Unlimited Agents', 'Dedicated Support', 'Unlimited Storage', 'Custom Models', 'SSO Integration', 'Custom Development'] },
];

const ADDONS = [
  { id: 'extra-agent-standard', name: 'Extra Agent (Standard)', priceId: 'price_1T8qXyDj0FRggNOEVYLTt3du', amount: 1200, currency: 'usd', interval: 'month' },
  { id: 'extra-agent-enterprise', name: 'Extra Agent (Enterprise)', priceId: 'price_1T8qYFDj0FRggNOEhgaQHujI', amount: 900, currency: 'usd', interval: 'month' },
  { id: 'nexus-clone', name: 'Nexus Clone', priceId: 'price_1T8qYWDj0FRggNOEXEpPA6jl', amount: 1900, currency: 'usd', interval: 'month' },
  { id: 'nexus-runtime', name: 'Nexus Runtime', priceId: 'price_1T8qYlDj0FRggNOEQ8emiuG9', amount: 3900, currency: 'usd', interval: 'month' },
];

// ── GET /billing/plans ──
router.get('/billing/plans', async (req, res) => {
  try {
    res.json({ success: true, data: { plans: PLANS, addons: ADDONS } });
  } catch (err) {
    console.error('[Billing] plans error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /billing/subscription ──
router.get('/billing/subscription', async (req, res) => {
  try {
    const stripe = getStripe();
    const userId = req.userId;
    const email = req.userEmail || req.user?.email;

    // Find customer by email or metadata
    let customers;
    if (email) {
      customers = await stripe.customers.list({ email, limit: 1 }, { stripeAccount: STRIPE_ACCOUNT_ID });
    }

    if (!customers || !customers.data.length) {
      return res.json({ success: true, data: { plan: 'free', status: 'active', subscription: null } });
    }

    const customer = customers.data[0];
    const subs = await stripe.subscriptions.list({ customer: customer.id, status: 'active', limit: 1 }, { stripeAccount: STRIPE_ACCOUNT_ID });

    if (!subs.data.length) {
      return res.json({ success: true, data: { plan: 'free', status: 'active', subscription: null, customerId: customer.id } });
    }

    const sub = subs.data[0];
    const priceId = sub.items.data[0]?.price?.id;
    const matchedPlan = PLANS.find(p => p.priceId === priceId);

    res.json({
      success: true,
      data: {
        plan: matchedPlan?.id || 'unknown',
        planName: matchedPlan?.name || 'Unknown',
        status: sub.status,
        currentPeriodEnd: sub.current_period_end,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        subscription: {
          id: sub.id,
          priceId,
          amount: sub.items.data[0]?.price?.unit_amount,
          currency: sub.items.data[0]?.price?.currency,
        },
        customerId: customer.id,
      }
    });
  } catch (err) {
    console.error('[Billing] subscription error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /billing/checkout ──
router.post('/billing/checkout', async (req, res) => {
  try {
    const stripe = getStripe();
    const { priceId, successUrl, cancelUrl } = req.body;

    if (!priceId) return res.status(400).json({ success: false, error: 'priceId is required' });

    const validPrice = PLANS.find(p => p.priceId === priceId) || ADDONS.find(a => a.priceId === priceId);
    if (!validPrice) return res.status(400).json({ success: false, error: 'Invalid priceId' });

    const email = req.userEmail || req.user?.email;

    // Find or create customer
    let customerId;
    if (email) {
      const existing = await stripe.customers.list({ email, limit: 1 }, { stripeAccount: STRIPE_ACCOUNT_ID });
      if (existing.data.length) {
        customerId = existing.data[0].id;
      } else {
        const newCust = await stripe.customers.create({ email, metadata: { userId: req.userId, workspaceId: req.workspaceId } }, { stripeAccount: STRIPE_ACCOUNT_ID });
        customerId = newCust.id;
      }
    }

    const sessionParams = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl || 'https://app.vutler.ai/billing?success=true',
      cancel_url: cancelUrl || 'https://app.vutler.ai/billing?canceled=true',
      metadata: { userId: req.userId, workspaceId: req.workspaceId },
    };

    if (customerId) sessionParams.customer = customerId;
    else if (email) sessionParams.customer_email = email;

    const session = await stripe.checkout.sessions.create(sessionParams, { stripeAccount: STRIPE_ACCOUNT_ID });

    res.json({ success: true, data: { url: session.url, sessionId: session.id } });
  } catch (err) {
    console.error('[Billing] checkout error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /billing/portal ──
router.post('/billing/portal', async (req, res) => {
  try {
    const stripe = getStripe();
    const email = req.userEmail || req.user?.email;

    if (!email) return res.status(400).json({ success: false, error: 'User email not found' });

    const customers = await stripe.customers.list({ email, limit: 1 }, { stripeAccount: STRIPE_ACCOUNT_ID });
    if (!customers.data.length) {
      return res.status(404).json({ success: false, error: 'No billing account found. Subscribe to a plan first.' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customers.data[0].id,
      return_url: req.body.returnUrl || 'https://app.vutler.ai/billing',
    }, { stripeAccount: STRIPE_ACCOUNT_ID });

    res.json({ success: true, data: { url: session.url } });
  } catch (err) {
    console.error('[Billing] portal error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /billing/webhook ── (called with raw body, no auth)
router.post('/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const stripe = getStripe();
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('[Billing] Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    console.log('[Billing] Webhook event:', event.type);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        console.log('[Billing] Checkout completed for customer:', session.customer, 'subscription:', session.subscription);
        // TODO: Update user plan in DB if needed
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        console.log('[Billing] Subscription updated:', sub.id, 'status:', sub.status);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        console.log('[Billing] Subscription deleted:', sub.id);
        // TODO: Downgrade user to free plan in DB
        break;
      }
      default:
        console.log('[Billing] Unhandled event type:', event.type);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[Billing] webhook error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
