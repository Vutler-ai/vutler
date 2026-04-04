CREATE TABLE IF NOT EXISTS tenant_vutler.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  type TEXT NOT NULL,
  amount BIGINT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_workspace_created
  ON tenant_vutler.credit_transactions (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_workspace_type
  ON tenant_vutler.credit_transactions (workspace_id, type, created_at DESC);
