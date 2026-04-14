# AI Credits, BYOK, And Billing Migration V1

> **Type:** Technical Spec
> **Status:** Draft
> **Date:** 2026-04-13
> **Owner:** Codex

## Goal

Ship a first production-grade AI monetization model for Vutler that:

- keeps current workspace plans as the platform-access SKU
- adds monthly included AI credits to paid plans
- supports one-time credit top-ups
- preserves BYOK as a first-class path
- gives operators and customers clear visibility into:
  - remaining credits
  - included vs top-up balances
  - BYOK vs Vutler-managed usage
  - standard vs advanced vs premium consumption

This slice must fit the current repo and billing/runtime architecture instead of replacing it.

## Non-Goals

This V1 does not cover:

- replacing OpenAI or Anthropic with self-hosted models
- enterprise true-up invoicing or custom contract billing
- per-user AI seat pricing
- provider marketplace redesign
- retroactive perfect reconstruction of historical trial vs purchased token usage

## Product Outcome

After this slice:

- paid plans still sell Vutler platform access first
- each paid plan can include a monthly AI credit allowance
- workspaces can buy one-time rollover credit packs
- BYOK usage remains available and is never billed against Vutler credits
- the Usage page can distinguish:
  - `byok`
  - `managed_plan`
  - `managed_topup`
  - `trial`
- the Usage page can also distinguish:
  - `standard`
  - `advanced`
  - `premium`
- managed runtime routing becomes deterministic enough to support clear pricing semantics

## Current Repo Anchors

The existing implementation already provides the right base layer:

### Plans and subscriptions

- [packages/core/middleware/featureGate.js](/Users/alopez/Devs/Vutler/packages/core/middleware/featureGate.js:18)
- [services/workspacePlanService.js](/Users/alopez/Devs/Vutler/services/workspacePlanService.js:25)
- [api/billing.js](/Users/alopez/Devs/Vutler/api/billing.js:192)

### Managed provider runtime

- [services/managedProviderService.js](/Users/alopez/Devs/Vutler/services/managedProviderService.js:194)
- [services/llmRouter.js](/Users/alopez/Devs/Vutler/services/llmRouter.js:2216)

### BYOK providers

- [api/providers.js](/Users/alopez/Devs/Vutler/api/providers.js:35)
- [services/providerSecrets.js](/Users/alopez/Devs/Vutler/services/providerSecrets.js:13)
- [frontend/src/app/(app)/providers/page.tsx](</Users/alopez/Devs/Vutler/frontend/src/app/(app)/providers/page.tsx:63>)

### Usage analytics and current credit ledger

- [services/llmRouter.js](/Users/alopez/Devs/Vutler/services/llmRouter.js:1808)
- [api/usage-pg.js](/Users/alopez/Devs/Vutler/api/usage-pg.js:29)
- [services/creditLedger.js](/Users/alopez/Devs/Vutler/services/creditLedger.js:5)
- [scripts/migrations/20260404_credit_transactions.sql](/Users/alopez/Devs/Vutler/scripts/migrations/20260404_credit_transactions.sql:1)

### Current UI

- [frontend/src/app/(app)/billing/page.tsx](</Users/alopez/Devs/Vutler/frontend/src/app/(app)/billing/page.tsx:823>)
- [frontend/src/app/(app)/usage/page.tsx](</Users/alopez/Devs/Vutler/frontend/src/app/(app)/usage/page.tsx:143>)
- [frontend/src/app/(landing)/pricing/page.tsx](</Users/alopez/Devs/Vutler/frontend/src/app/(landing)/pricing/page.tsx:26>)

## Current State Summary

Validated in the repo today:

- plans and Stripe subscriptions already exist
- one-time managed credit packs already exist, but they sell raw tokens
- managed credits are currently folded into `trial_tokens_total`
- usage debits are already recorded in `credit_transactions`
- BYOK keys are already stored per workspace in `llm_providers`

Main gap:

- `llm_usage_logs` records provider/model/tokens/latency, but not the billing source or pricing tier

That means the current product cannot answer these questions correctly:

- was this request BYOK or Vutler-managed?
- if Vutler-managed, did it consume monthly included credits or rollover top-ups?
- was the request billed at standard, advanced, or premium rate?

## V1 Product Rules

### 1. Plans stay platform-first

The public price of a plan continues to represent:

- access to the Vutler platform
- workspace/product limits
- support and operational overhead
- included AI credits where applicable

The plan is not redefined as a pure token bundle.

### 2. BYOK remains first-class

BYOK stays available wherever it is available today.

Rules:

- BYOK usage does not debit Vutler credits
- BYOK usage still appears in Usage analytics
- a workspace can use both BYOK and Vutler-managed credits in the same month
- default provider choice stays under workspace control

### 3. Managed credits are sold as credits, not raw tokens

Public packaging:

- `1 credit = 1,000 standard tokens`

Managed runtime tiers:

- `standard` → multiplier `1.0`
- `advanced` → multiplier `3.5`
- `premium` → multiplier `6.0`

Initial managed catalog:

- `standard`
  - `gpt-5.4-mini`
  - `claude-haiku-4-5`
- `advanced`
  - `gpt-5.4`
  - `claude-sonnet-4-20250514`
- `premium`
  - `claude-opus-4-20250514`

Important:

- do not use opaque `openrouter/auto` for billed managed tiers in V1
- V1 pricing needs deterministic provider/model attribution

### 4. Included credits and top-ups must be separate pools

Priority order for debit:

1. trial credits
2. monthly included plan credits that expire at period end
3. top-up credits that roll over
4. manual or contract grants

This keeps the user-visible balance understandable and avoids burning top-ups before expiring plan credits.

## Exact Patch Plan

### 1. Add A Proper Credit Grants Table

Create a new additive migration:

- `scripts/migrations/20260413_ai_credit_grants_v1.sql`

Exact SQL:

```sql
CREATE TABLE IF NOT EXISTS tenant_vutler.workspace_credit_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  source TEXT NOT NULL CHECK (source IN (
    'trial',
    'legacy_pool',
    'plan_monthly',
    'topup',
    'manual_adjustment',
    'contract'
  )),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active',
    'depleted',
    'expired',
    'canceled'
  )),
  credits_total BIGINT NOT NULL CHECK (credits_total >= 0),
  credits_remaining BIGINT NOT NULL CHECK (credits_remaining >= 0),
  period_start TIMESTAMPTZ NULL,
  period_end TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NULL,
  stripe_checkout_session_id TEXT NULL,
  stripe_payment_intent_id TEXT NULL,
  grant_label TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_credit_grants_workspace_status
  ON tenant_vutler.workspace_credit_grants (workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_credit_grants_workspace_expiry
  ON tenant_vutler.workspace_credit_grants (workspace_id, expires_at, created_at DESC);
```

Design notes:

- this is the source of truth for remaining managed credit balances
- do not overload `workspace_settings.trial_tokens_total` as the balance model anymore
- a single workspace can have multiple active grants at the same time

### 2. Extend The Ledger And Usage Tables For Queryable Billing Metadata

Add columns to the existing ledger and usage log.

Exact SQL:

```sql
ALTER TABLE tenant_vutler.credit_transactions
  ADD COLUMN IF NOT EXISTS grant_id UUID NULL REFERENCES tenant_vutler.workspace_credit_grants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_source TEXT NULL,
  ADD COLUMN IF NOT EXISTS billing_tier TEXT NULL,
  ADD COLUMN IF NOT EXISTS credit_multiplier NUMERIC(10,4) NULL,
  ADD COLUMN IF NOT EXISTS credits_amount BIGINT NULL,
  ADD COLUMN IF NOT EXISTS provider_id UUID NULL,
  ADD COLUMN IF NOT EXISTS model_canonical TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_credit_transactions_workspace_source
  ON tenant_vutler.credit_transactions (workspace_id, billing_source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_workspace_tier
  ON tenant_vutler.credit_transactions (workspace_id, billing_tier, created_at DESC);

ALTER TABLE tenant_vutler.llm_usage_logs
  ADD COLUMN IF NOT EXISTS provider_id UUID NULL,
  ADD COLUMN IF NOT EXISTS billing_source TEXT NULL,
  ADD COLUMN IF NOT EXISTS billing_tier TEXT NULL,
  ADD COLUMN IF NOT EXISTS credit_multiplier NUMERIC(10,4) NULL,
  ADD COLUMN IF NOT EXISTS credits_debited BIGINT NULL,
  ADD COLUMN IF NOT EXISTS grant_id UUID NULL REFERENCES tenant_vutler.workspace_credit_grants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_workspace_source
  ON tenant_vutler.llm_usage_logs (workspace_id, billing_source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_workspace_tier
  ON tenant_vutler.llm_usage_logs (workspace_id, billing_tier, created_at DESC);
```

Why columns instead of only JSON:

- the usage dashboard will need aggregations by source and tier
- this should remain indexable and queryable without JSON extraction everywhere

### 3. Introduce An AI Billing Policy Setting

Do not create a separate table for policy in V1.
Use `workspace_settings` with a new key:

- `ai_billing_policy`

Suggested value:

```json
{
  "version": 1,
  "managed_runtime_enabled": true,
  "byok_enabled": true,
  "tier_multipliers": {
    "standard": 1.0,
    "advanced": 3.5,
    "premium": 6.0
  },
  "managed_models": {
    "standard": [
      { "provider": "openai", "model": "gpt-5.4-mini" },
      { "provider": "anthropic", "model": "claude-haiku-4-5" }
    ],
    "advanced": [
      { "provider": "openai", "model": "gpt-5.4" },
      { "provider": "anthropic", "model": "claude-sonnet-4-20250514" }
    ],
    "premium": [{ "provider": "anthropic", "model": "claude-opus-4-20250514" }]
  }
}
```

Files:

- [services/workspacePlanService.js](/Users/alopez/Devs/Vutler/services/workspacePlanService.js:97)
- [api/settings.js](/Users/alopez/Devs/Vutler/api/settings.js)

### 4. Add A Credit Grant Service

Add a new service:

- `services/workspaceCreditService.js`

Responsibilities:

- grant monthly included credits
- grant top-up credits
- read current balances
- pick the next grant to debit
- expire depleted or past-period grants
- backfill legacy pools

Suggested API:

```js
getPlanIncludedCredits(planId);
grantMonthlyPlanCredits(db, workspaceId, { planId, periodStart, periodEnd });
grantTopupCredits(db, workspaceId, { credits, stripeCheckoutSessionId, stripePaymentIntentId, label });
getWorkspaceCreditBalance(db, workspaceId);
debitWorkspaceCredits(db, workspaceId, { credits, billingTier, providerId, model, usage });
backfillLegacyCreditPool(db, workspaceId);
expireStaleCreditGrants(db, workspaceId);
```

Files:

- new `services/workspaceCreditService.js`
- [services/creditLedger.js](/Users/alopez/Devs/Vutler/services/creditLedger.js:5)

### 5. Change Managed Runtime Debit Logic

Modify [services/llmRouter.js](/Users/alopez/Devs/Vutler/services/llmRouter.js:2749).

Current behavior:

- debit total tokens against `trial_tokens_used`
- write `credit_transactions` for managed usage only

V1 behavior:

- determine `billing_source`
  - `trial`
  - `managed_plan`
  - `managed_topup`
  - `manual_adjustment`
- determine `billing_tier`
  - `standard`
  - `advanced`
  - `premium`
- compute `credits_debited = ceil(total_tokens / 1000 * multiplier)`
- debit from `workspace_credit_grants`
- write the same billing fields into:
  - `llm_usage_logs`
  - `credit_transactions`

Required changes:

- `logUsage()` must accept richer billing context
- managed runtime requests must no longer depend on `trial_tokens_total` as the primary balance store

Suggested payload attached to `llmResult` before logging:

```js
llmResult.billing = {
  source: 'managed_plan',
  tier: 'advanced',
  multiplier: 3.5,
  credits_debited: 42,
  grant_id: 'uuid',
  provider_id: 'uuid-or-null',
};
```

### 6. Preserve BYOK Behavior And Make It Visible

Modify:

- [services/llmRouter.js](/Users/alopez/Devs/Vutler/services/llmRouter.js:2257)
- [api/providers.js](/Users/alopez/Devs/Vutler/api/providers.js:35)
- [frontend/src/app/(app)/providers/page.tsx](</Users/alopez/Devs/Vutler/frontend/src/app/(app)/providers/page.tsx:153>)

Rules:

- if request uses workspace `llm_providers` with a customer key, set:
  - `billing_source = 'byok'`
  - `billing_tier = null`
  - `credits_debited = 0`
- still log the request in `llm_usage_logs`
- do not write negative `credit_transactions` for BYOK

UI additions on Providers page:

- show which providers are customer-managed
- show whether a managed Vutler runtime is also available
- add one line explaining:
  - BYOK usage is visible in analytics
  - BYOK usage does not consume Vutler credits

### 7. Extend Billing APIs

Modify [api/billing.js](/Users/alopez/Devs/Vutler/api/billing.js:206).

#### Extend `GET /api/v1/billing/subscription`

Add an `ai` block:

```json
{
  "ai": {
    "byok_enabled": true,
    "managed_runtime_available": true,
    "monthly_included_credits": 10000,
    "balances": {
      "total_remaining": 12450,
      "trial_remaining": 0,
      "plan_remaining": 7450,
      "topup_remaining": 5000
    },
    "current_period": {
      "credits_consumed": 2550,
      "by_tier": {
        "standard": 1200,
        "advanced": 950,
        "premium": 400
      }
    }
  }
}
```

#### Replace raw token packs with credit packs

Current:

- [api/billing.js](/Users/alopez/Devs/Vutler/api/billing.js:858)

Replace pack shape:

```js
const CREDIT_PACKS = [
  { id: 'credits_3k', label: '3,000 credits', credits: 3000, price: 1900, currency: 'usd', rollover: true },
  { id: 'credits_10k', label: '10,000 credits', credits: 10000, price: 5900, currency: 'usd', rollover: true },
  { id: 'credits_35k', label: '35,000 credits', credits: 35000, price: 19900, currency: 'usd', rollover: true },
];
```

The endpoint can stay:

- `GET /api/v1/billing/credits`
- `POST /api/v1/billing/credits`

But the response must switch from `tokens` to `credits`.

#### Add `GET /api/v1/billing/credits/balance`

Return:

- total remaining
- plan remaining
- top-up remaining
- trial remaining
- grant list
- next plan refresh date

### 8. Extend Usage APIs

Modify [api/usage-pg.js](/Users/alopez/Devs/Vutler/api/usage-pg.js:29).

Add support for reading the new columns from `llm_usage_logs`.

Each usage record should expose:

- `billing_source`
- `billing_tier`
- `credit_multiplier`
- `credits_debited`
- `provider_id`

Extend summary responses:

```json
{
  "summary": {
    "tokens_total": 123456,
    "credits_total": 520,
    "by_source": {
      "byok": 34000,
      "managed_plan": 70000,
      "managed_topup": 19456,
      "trial": 0
    },
    "credits_by_tier": {
      "standard": 180,
      "advanced": 240,
      "premium": 100
    }
  }
}
```

Keep fallback behavior for older rows that lack the new columns.

### 9. Update Billing UI

Modify:

- [frontend/src/app/(app)/billing/page.tsx](</Users/alopez/Devs/Vutler/frontend/src/app/(app)/billing/page.tsx:238>)

Changes:

- add an `AI Credits` usage block under Current Plan
- show:
  - monthly included credits
  - remaining plan credits
  - remaining top-up credits
  - next reset date
- replace current raw-token pack cards with credit pack cards
- preserve the existing BYOK CTA to `/providers`
- add copy clarifying:
  - included credits are monthly
  - top-ups roll over
  - BYOK never consumes credits

Do not:

- show raw token caps as the public pricing primitive
- imply that all usage is billed by Vutler

### 10. Update Usage UI

Modify:

- [frontend/src/app/(app)/usage/page.tsx](</Users/alopez/Devs/Vutler/frontend/src/app/(app)/usage/page.tsx:143>)

Changes:

- add top summary cards for:
  - total tokens
  - total credits consumed
  - BYOK vs managed split
  - advanced/premium share
- add table columns:
  - `Billing Source`
  - `Tier`
  - `Credits`
- add filters:
  - source
  - tier
  - provider
  - model

The page should answer these questions without manual calculation:

- how much of this month was paid by plan credits?
- how much came from top-ups?
- how much was BYOK?
- how much premium usage did we burn?

### 11. Update Public Pricing Copy

Modify:

- [frontend/src/app/(landing)/pricing/page.tsx](</Users/alopez/Devs/Vutler/frontend/src/app/(landing)/pricing/page.tsx:26>)

Changes:

- keep current plan families
- add a short AI block per paid plan:
  - included monthly credits
  - BYOK available
  - additional credits available
- remove raw `tokens_month` language from public pricing

### 12. Add A Monthly Credit Reconciliation Job

Use a background reconciliation job rather than a request-path side effect.

Good repo anchors:

- [services/scheduler.js](/Users/alopez/Devs/Vutler/services/scheduler.js:618)

V1 approach:

- add a small internal service:
  - `services/aiCreditReconciliationService.js`
- add a daily reconcile task:
  - find active workspace subscriptions
  - ensure the current period has exactly one `plan_monthly` grant
  - expire stale plan grants from prior periods

This does not need a separate infrastructure worker in V1 if the existing scheduler runtime is already active in the API process.

## Migration Strategy

### Phase 0. Schema First, No Behavior Change

Deploy additive SQL only:

- `workspace_credit_grants`
- additive columns on `credit_transactions`
- additive columns on `llm_usage_logs`

Do not change runtime logic in the same deploy.

### Phase 1. Dual-Write Managed Runtime Metadata

Deploy backend changes so new managed runs write:

- existing legacy fields
- new billing source/tier/credits metadata

During this phase:

- old balances still work
- new analytics starts collecting correct metadata for new traffic

### Phase 2. Backfill A Legacy Credit Pool

Do not attempt a perfect reconstruction of old purchases vs trial usage.

Backfill strategy:

- for each workspace with legacy managed balance
- compute:
  - `legacy_total = trial_tokens_total`
  - `legacy_used = trial_tokens_used`
  - `legacy_remaining = max(legacy_total - legacy_used, 0)`
- create one grant:
  - `source = 'legacy_pool'`
  - `credits_total = ceil(legacy_remaining / 1000)`
  - `credits_remaining = same`
  - `grant_label = 'Legacy managed balance'`

Reason:

- this is auditable
- it preserves customer value
- it avoids false precision from old mixed accounting

### Phase 3. Switch Checkout Packs To Credits

After the legacy pool exists:

- switch `/billing/credits` to sell credits
- update the billing page copy and pack cards
- write new grants into `workspace_credit_grants`

### Phase 4. Start Monthly Included Grants

Enable the reconciliation job that grants:

- monthly included credits based on active plan

At this point, plan AI entitlement becomes live.

### Phase 5. Stop Using `trial_tokens_*` As Primary Balance

After enough soak time:

- keep old fields for backwards compatibility and audit only
- remove them from new balance calculations

Do not delete legacy fields in the same release.

## Plan Mapping Recommendation

To fit current pricing while preserving platform margin:

```txt
free             -> 0 monthly credits, onboarding trial only
office_starter   -> 3,000 monthly credits
office_team      -> 10,000 monthly credits
agents_starter   -> 3,000 monthly credits
agents_pro       -> 10,000 monthly credits
full             -> 20,000 monthly credits
nexus_enterprise -> contract-managed monthly grant
enterprise       -> contract-managed monthly grant
```

This should not replace the existing plan IDs.
It should be a separate entitlement layer.

## API Contract Changes

### `GET /api/v1/billing/subscription`

Add:

- `ai.monthly_included_credits`
- `ai.balances`
- `ai.current_period.by_tier`
- `ai.byok_enabled`
- `ai.managed_runtime_available`

### `GET /api/v1/billing/credits`

Change payload from:

- `tokens`

To:

- `credits`
- `rollover`
- `price_display`

### `POST /api/v1/billing/credits`

Accept:

- `pack_id`

Persist:

- top-up grant
- purchase ledger row

### `GET /api/v1/billing/credits/balance`

New endpoint for fast balance rendering.

### `GET /api/v1/usage`

Extend rows with:

- `billing_source`
- `billing_tier`
- `credits_debited`

### `GET /api/v1/usage/summary`

Extend with:

- managed credit totals
- by-source totals
- by-tier totals

## UI Migration Notes

### Billing page

Keep the existing page structure.
Only add:

- an AI balance panel
- credit pack cards
- clearer BYOK messaging

### Usage page

Keep the existing table structure.
Only add:

- new billing columns
- source/tier filters
- summary cards

### Providers page

Do not merge BYOK and managed runtime into one ambiguous state.
The page should clearly distinguish:

- customer-managed provider credentials
- Vutler-managed runtime availability

## Required Environment And Operational Checks

Must exist in production before rollout:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- all relevant `STRIPE_PRICE_*` for base plans
- `ENCRYPTION_KEY`
- at least one managed OpenAI key:
  - `VUTLER_MANAGED_OPENAI_KEY`
  - or `OPENAI_API_KEY`
- at least one managed Anthropic key:
  - `VUTLER_MANAGED_ANTHROPIC_KEY`
  - or `ANTHROPIC_API_KEY`

Recommended:

- use explicit managed provider keys rather than generic global fallbacks
- pin managed models by tier rather than using auto-routing

Open question to verify in production:

- whether the API process that already runs the scheduler is guaranteed to stay alive in all environments

If not, the monthly grant reconcile job should run from a dedicated ops script or worker process instead.

## Acceptance Criteria

### Billing acceptance

- a paid workspace sees monthly included credits on the Billing page
- a workspace can buy one-time credit packs
- top-up credits remain visible separately from included credits
- BYOK messaging remains visible and accurate

### Runtime acceptance

- a BYOK request never consumes managed credits
- a managed request debits the correct grant in the correct order
- advanced and premium requests debit more credits than standard requests

### Analytics acceptance

- the Usage page can filter by `byok`, `managed_plan`, `managed_topup`, and `trial`
- the Usage page can show `standard`, `advanced`, and `premium`
- the billing summary can show remaining credits and current-period consumption

### Migration acceptance

- existing workspaces with purchased managed balances keep usable value after migration
- no workspace loses BYOK configuration
- no plan ID changes are required for rollout

## Risks

### 1. Legacy accounting mismatch

Historical `trial_tokens_*` mixed trial and purchased managed balances.
V1 should preserve value through a `legacy_pool` grant, not promise perfect historical split.

### 2. Product confusion if `tokens_month` remains user-visible

The old token quota language conflicts with BYOK and credit packaging.
Public UX should pivot to credits while keeping token metrics as telemetry only.

### 3. Non-deterministic provider routing

`openrouter/auto` is acceptable for internal experimentation, but not for public credit semantics.

### 4. Scheduler dependency

Monthly plan grants need a reliable reconciliation loop.
This must be validated in production before public launch.

## Recommended Delivery Order

1. Ship additive SQL migration
2. Add `workspaceCreditService` and dual-write runtime metadata
3. Add legacy pool backfill
4. Extend `billing/subscription` and `usage` APIs
5. Update Billing and Usage UI
6. Switch credit pack checkout from tokens to credits
7. Enable monthly grant reconciliation
8. Update public pricing copy

## Implementation File Targets

Backend:

- [api/billing.js](/Users/alopez/Devs/Vutler/api/billing.js:152)
- [api/usage-pg.js](/Users/alopez/Devs/Vutler/api/usage-pg.js:152)
- [services/llmRouter.js](/Users/alopez/Devs/Vutler/services/llmRouter.js:1808)
- [services/creditLedger.js](/Users/alopez/Devs/Vutler/services/creditLedger.js:5)
- `services/workspaceCreditService.js`
- `services/aiCreditReconciliationService.js`
- `scripts/migrations/20260413_ai_credit_grants_v1.sql`

Frontend:

- [frontend/src/app/(app)/billing/page.tsx](</Users/alopez/Devs/Vutler/frontend/src/app/(app)/billing/page.tsx:823>)
- [frontend/src/app/(app)/usage/page.tsx](</Users/alopez/Devs/Vutler/frontend/src/app/(app)/usage/page.tsx:143>)
- [frontend/src/app/(app)/providers/page.tsx](</Users/alopez/Devs/Vutler/frontend/src/app/(app)/providers/page.tsx:153>)
- [frontend/src/app/(landing)/pricing/page.tsx](</Users/alopez/Devs/Vutler/frontend/src/app/(landing)/pricing/page.tsx:26>)
- [frontend/src/lib/api/types.ts](/Users/alopez/Devs/Vutler/frontend/src/lib/api/types.ts)
- [frontend/src/lib/api/endpoints/billing.ts](/Users/alopez/Devs/Vutler/frontend/src/lib/api/endpoints/billing.ts)

## Decision Summary

V1 should:

- keep the current plan catalog
- keep BYOK
- add monthly included credits as a separate entitlement layer
- sell top-ups in credits, not raw tokens
- make billing source and tier queryable in usage analytics
- migrate legacy balances through a `legacy_pool` grant instead of overloading trial fields forever
