'use strict';

/**
 * stripe-setup.js — Create Stripe products and prices for all Vutler plans.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_... node scripts/stripe-setup.js
 *   STRIPE_MODE=test node scripts/stripe-setup.js
 *
 * What it does:
 *   1. For each billable plan, checks if a Stripe product already exists
 *      (matched by metadata.plan_id).
 *   2. Creates the product + monthly price + yearly price if not present.
 *   3. Prints the env vars to set (STRIPE_PRICE_<PLAN>_MONTHLY/YEARLY).
 *   4. Optionally writes them to .env.stripe (never overwrites existing values).
 *
 * The script also supports local Stripe CLI config resolution when
 * STRIPE_SECRET_KEY is not exported, and writes the generated price IDs
 * to .env.stripe for copy/paste into runtime env vars.
 */

const Stripe = require('stripe');
const fs = require('fs');
const os = require('os');
const path = require('path');

function resolveStripeSecretKey() {
  if (process.env.STRIPE_SECRET_KEY) return process.env.STRIPE_SECRET_KEY;

  try {
    const configPath = path.join(os.homedir(), '.config', 'stripe', 'config.toml');
    const config = fs.readFileSync(configPath, 'utf8');
    const profile = process.env.STRIPE_PROFILE || 'default';
    const mode = (process.env.STRIPE_MODE || 'test').toLowerCase();
    const keyName = mode === 'live' ? 'live_mode_api_key' : 'test_mode_api_key';
    const sectionMatch = config.match(new RegExp(`\\[${profile}\\]([\\s\\S]*?)(?:\\n\\[[^\\]]+\\]|$)`));
    const keyMatch = sectionMatch?.[1]?.match(new RegExp(`${keyName} = '([^']+)'`));
    const value = keyMatch?.[1] || null;
    return value && !value.includes('*') ? value : null;
  } catch (_) {
    return null;
  }
}

const STRIPE_SECRET_KEY = resolveStripeSecretKey();
const STRIPE_ACCOUNT_ID = process.env.STRIPE_ACCOUNT_ID || process.env.STRIPE_ACCOUNT || null;

if (!STRIPE_SECRET_KEY) {
  console.error('ERROR: STRIPE_SECRET_KEY is required (env or local Stripe CLI test key).');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

// Organization API keys require Stripe-Context. Account-level keys should omit it.
const ACCOUNT_OPTS = STRIPE_ACCOUNT_ID ? { stripeAccount: STRIPE_ACCOUNT_ID } : undefined;

// Plans to create (free, beta have no paid prices)
const PLANS_TO_CREATE = [
  { id: 'office_starter',  label: 'Office Starter',  monthly: 2900,  yearly: 29000  },
  { id: 'office_team',     label: 'Office Pro',       monthly: 7900,  yearly: 79000  },
  { id: 'agents_starter',  label: 'Agents Starter',   monthly: 2900,  yearly: 29000  },
  { id: 'agents_pro',      label: 'Agents Pro',        monthly: 7900,  yearly: 79000  },
  { id: 'full',            label: 'Full Platform',     monthly: 12900, yearly: 129000 },
  { id: 'nexus_enterprise', label: 'Nexus Enterprise', monthly: 149000, yearly: 1490000 },
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

    const page = ACCOUNT_OPTS
      ? await stripe.products.list(params, ACCOUNT_OPTS)
      : await stripe.products.list(params);
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
async function findPrice(productId, interval, intervalCount, amountCents) {
  const prices = ACCOUNT_OPTS
    ? await stripe.prices.list({ product: productId, active: true, limit: 100 }, ACCOUNT_OPTS)
    : await stripe.prices.list({ product: productId, active: true, limit: 100 });
  return prices.data.find(
    (p) =>
      p.recurring?.interval === interval &&
      p.recurring?.interval_count === intervalCount &&
      p.unit_amount === amountCents
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
  const existing = await findPrice(productId, interval, 1, amountCents);
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
      const monthlyVar = `STRIPE_PRICE_${plan.id.toUpperCase()}_MONTHLY`;
      envLines.push(`${monthlyVar}=${monthlyPrice.id}`);

      let yearlyPriceId = 'N/A';
      if (plan.yearly > 0) {
        const yearlyPrice  = await getOrCreatePrice(product.id, plan.id, plan.yearly,  'year');
        const yearlyVar  = `STRIPE_PRICE_${plan.id.toUpperCase()}_YEARLY`;
        envLines.push(`${yearlyVar}=${yearlyPrice.id}`);
        yearlyPriceId = yearlyPrice.id;
      }

      results.push({ planId: plan.id, monthlyVar, monthlyPriceId: monthlyPrice.id, yearlyPriceId });
    } catch (err) {
      console.error(`  ERROR processing ${plan.id}:`, err.message);
    }
  }

  // ── Social Media Addon Packs ────────────────────────────────────────────────
  const ADDON_PACKS = [
    { id: 'nexus_enterprise_seats_5', label: 'Nexus Enterprise +5 Seats', monthly: 39000 },
    { id: 'nexus_enterprise_node', label: 'Nexus Enterprise Extra Node', monthly: 50000 },
    { id: 'social_posts_100',  label: '100 Social Posts/month',  monthly: 500 },
    { id: 'social_posts_500',  label: '500 Social Posts/month',  monthly: 1900 },
    { id: 'social_posts_2000', label: '2000 Social Posts/month', monthly: 4900 },
  ];

  console.log('\n\n--- Processing Social Media Addon Packs ---');
  for (const addon of ADDON_PACKS) {
    console.log(`\nProcessing addon: ${addon.id} (${addon.label})`);
    try {
      const existing = await findProductByPlanId(addon.id);
      let product;
      if (existing) {
        console.log(`  [product] Found existing product for ${addon.id}: ${existing.id}`);
        product = existing;
      } else {
        product = await stripe.products.create(
          { name: `Vutler — ${addon.label}`, metadata: { plan_id: addon.id, type: 'addon' } },
          ACCOUNT_OPTS
        );
        console.log(`  [product] Created product for ${addon.id}: ${product.id}`);
      }

      const monthlyPrice = await getOrCreatePrice(product.id, addon.id, addon.monthly, 'month');
      const addonVar = `STRIPE_PRICE_ADDON_${addon.id.toUpperCase()}`;
      envLines.push(`${addonVar}=${monthlyPrice.id}`);

      results.push({ planId: addon.id, monthlyVar: addonVar, monthlyPriceId: monthlyPrice.id, yearlyPriceId: 'N/A' });
    } catch (err) {
      console.error(`  ERROR processing addon ${addon.id}:`, err.message);
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
