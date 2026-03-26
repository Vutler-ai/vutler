'use strict';

/**
 * stripe-setup.js — Create Stripe products and prices for all Vutler plans.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_... node scripts/stripe-setup.js
 *
 * What it does:
 *   1. For each billable plan, checks if a Stripe product already exists
 *      (matched by metadata.plan_id).
 *   2. Creates the product + monthly price + yearly price if not present.
 *   3. Prints the env vars to set (STRIPE_PRICE_<PLAN>_MONTHLY/YEARLY).
 *   4. Optionally writes them to .env.stripe (never overwrites existing values).
 *
 * Plans created:
 *   office_starter  $29/mo  $290/yr
 *   office_team     $79/mo  $790/yr
 *   agents_starter  $29/mo  $290/yr
 *   agents_pro      $79/mo  $790/yr
 *   full           $129/mo $1290/yr
 */

const Stripe = require('stripe');
const fs = require('fs');
const path = require('path');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_ACCOUNT_ID = process.env.STRIPE_ACCOUNT_ID || 'acct_1T2tqGDj0FRggNOE';

if (!STRIPE_SECRET_KEY) {
  console.error('ERROR: STRIPE_SECRET_KEY env var is required.');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

// When using an Organization API key the Stripe-Context header (stripeAccount) is required.
const ACCOUNT_OPTS = { stripeAccount: STRIPE_ACCOUNT_ID };

// Plans to create (free, enterprise, beta have no paid prices)
const PLANS_TO_CREATE = [
  { id: 'office_starter',  label: 'Office Starter',  monthly: 2900,  yearly: 29000  },
  { id: 'office_team',     label: 'Office Team',      monthly: 7900,  yearly: 79000  },
  { id: 'agents_starter',  label: 'Agents Starter',   monthly: 2900,  yearly: 29000  },
  { id: 'agents_pro',      label: 'Agents Pro',        monthly: 7900,  yearly: 79000  },
  { id: 'full',            label: 'Full Platform',     monthly: 12900, yearly: 129000 },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Find an existing Stripe product by metadata.plan_id.
 * Returns the product object or null.
 */
async function findProductByPlanId(planId) {
  let hasMore = true;
  let startingAfter = undefined;

  while (hasMore) {
    const params = { limit: 100, active: true };
    if (startingAfter) params.starting_after = startingAfter;

    const page = await stripe.products.list(params, ACCOUNT_OPTS);
    for (const product of page.data) {
      if (product.metadata && product.metadata.plan_id === planId) {
        return product;
      }
    }
    hasMore = page.has_more;
    if (page.data.length > 0) {
      startingAfter = page.data[page.data.length - 1].id;
    }
  }
  return null;
}

/**
 * Find an existing price for a product with the given interval.
 * Returns the price object or null.
 */
async function findPrice(productId, interval, intervalCount) {
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 }, ACCOUNT_OPTS);
  return prices.data.find(
    (p) => p.recurring?.interval === interval && p.recurring?.interval_count === intervalCount
  ) || null;
}

/**
 * Get or create a Stripe product for the given plan.
 */
async function getOrCreateProduct(plan) {
  const existing = await findProductByPlanId(plan.id);
  if (existing) {
    console.log(`  [product] Found existing product for ${plan.id}: ${existing.id}`);
    return existing;
  }

  const product = await stripe.products.create(
    { name: `Vutler — ${plan.label}`, metadata: { plan_id: plan.id } },
    ACCOUNT_OPTS
  );
  console.log(`  [product] Created product for ${plan.id}: ${product.id}`);
  return product;
}

/**
 * Get or create a Stripe price.
 * interval: 'month' | 'year'
 * intervalCount: 1
 */
async function getOrCreatePrice(productId, planId, amountCents, interval) {
  const existing = await findPrice(productId, interval, 1);
  if (existing) {
    console.log(`  [price]   Found existing ${interval}ly price: ${existing.id} ($${amountCents / 100})`);
    return existing;
  }

  const price = await stripe.prices.create(
    {
      product: productId,
      unit_amount: amountCents,
      currency: 'usd',
      recurring: { interval, interval_count: 1 },
      metadata: { plan_id: planId, interval: interval === 'month' ? 'monthly' : 'yearly' },
    },
    ACCOUNT_OPTS
  );
  console.log(`  [price]   Created ${interval}ly price: ${price.id} ($${amountCents / 100})`);
  return price;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Vutler Stripe Setup ===');
  console.log(`Account: ${STRIPE_SECRET_KEY.startsWith('sk_live_') || STRIPE_SECRET_KEY.startsWith('sk_org_live_') ? 'LIVE' : 'TEST'}\n`);

  const envLines = [];
  const results = [];

  for (const plan of PLANS_TO_CREATE) {
    console.log(`\nProcessing plan: ${plan.id} (${plan.label})`);

    try {
      const product = await getOrCreateProduct(plan);

      const monthlyPrice = await getOrCreatePrice(product.id, plan.id, plan.monthly, 'month');
      const yearlyPrice  = await getOrCreatePrice(product.id, plan.id, plan.yearly,  'year');

      const monthlyVar = `STRIPE_PRICE_${plan.id.toUpperCase()}_MONTHLY`;
      const yearlyVar  = `STRIPE_PRICE_${plan.id.toUpperCase()}_YEARLY`;

      envLines.push(`${monthlyVar}=${monthlyPrice.id}`);
      envLines.push(`${yearlyVar}=${yearlyPrice.id}`);

      results.push({ planId: plan.id, monthlyVar, monthlyPriceId: monthlyPrice.id, yearlyVar, yearlyPriceId: yearlyPrice.id });
    } catch (err) {
      console.error(`  ERROR processing ${plan.id}:`, err.message);
    }
  }

  // ── Print env vars ──────────────────────────────────────────────────────────
  console.log('\n\n=== Add these to your .env / environment ===\n');
  for (const line of envLines) {
    console.log(line);
  }

  // ── Write to .env.stripe ────────────────────────────────────────────────────
  const envFilePath = path.join(__dirname, '..', '.env.stripe');
  const fileContent = [
    '# Auto-generated by scripts/stripe-setup.js',
    '# Add these to your main .env or server environment.',
    '',
    ...envLines,
    '',
  ].join('\n');

  fs.writeFileSync(envFilePath, fileContent, 'utf8');
  console.log(`\nPrice IDs saved to: ${envFilePath}`);

  // ── Summary table ───────────────────────────────────────────────────────────
  console.log('\n=== Summary ===');
  console.log('Plan ID'.padEnd(18), 'Monthly Price ID'.padEnd(30), 'Yearly Price ID');
  console.log('-'.repeat(80));
  for (const r of results) {
    console.log(r.planId.padEnd(18), r.monthlyPriceId.padEnd(30), r.yearlyPriceId);
  }
  console.log('\nDone. Configure your Stripe webhook endpoint in the dashboard:');
  console.log('  URL: https://api.vutler.ai/api/v1/billing/webhooks/stripe');
  console.log('  Events: checkout.session.completed, customer.subscription.updated,');
  console.log('          customer.subscription.deleted, invoice.payment_failed');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
