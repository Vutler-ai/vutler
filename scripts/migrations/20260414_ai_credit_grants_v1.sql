-- AI credit grants v1
-- Phase 1 foundation for managed AI billing metadata and future credit pools.

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
