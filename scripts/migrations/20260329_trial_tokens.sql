-- Trial tokens: partial indexes for fast lookup
-- Speeds up trial quota checks in llmRouter and onboarding/trial-status

CREATE INDEX IF NOT EXISTS idx_workspace_settings_trial
  ON tenant_vutler.workspace_settings (workspace_id)
  WHERE key IN ('trial_tokens_total', 'trial_tokens_used', 'trial_expires_at');

CREATE INDEX IF NOT EXISTS idx_llm_providers_trial
  ON tenant_vutler.workspace_llm_providers (workspace_id)
  WHERE provider = 'vutler-trial';

-- Email: add flagged column
ALTER TABLE tenant_vutler.emails ADD COLUMN IF NOT EXISTS flagged BOOLEAN DEFAULT false;
