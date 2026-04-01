-- Normalize tenant_vutler.llm_providers to the runtime model expected by
-- api/providers.js and services/llmRouter.js while preserving legacy columns.

ALTER TABLE tenant_vutler.llm_providers
  ADD COLUMN IF NOT EXISTS api_key TEXT,
  ADD COLUMN IF NOT EXISTS base_url TEXT,
  ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE tenant_vutler.llm_providers
  ALTER COLUMN config SET DEFAULT '{}'::jsonb;

UPDATE tenant_vutler.llm_providers
   SET config = COALESCE(config, '{}'::jsonb)
 WHERE config IS NULL;

UPDATE tenant_vutler.llm_providers
   SET is_enabled = CASE
     WHEN status IS NULL THEN TRUE
     WHEN lower(status) IN ('active', 'enabled', 'connected', 'ready') THEN TRUE
     ELSE FALSE
   END
 WHERE is_enabled IS DISTINCT FROM CASE
   WHEN status IS NULL THEN TRUE
   WHEN lower(status) IN ('active', 'enabled', 'connected', 'ready') THEN TRUE
   ELSE FALSE
 END;

UPDATE tenant_vutler.llm_providers
   SET base_url = NULLIF(trim(base_url), '')
 WHERE base_url IS NOT NULL;

UPDATE tenant_vutler.llm_providers
   SET config = CASE
     WHEN config ? 'display_name' THEN config
     WHEN name IS NULL OR trim(name) = '' THEN config
     ELSE config || jsonb_build_object('display_name', name)
   END;

CREATE INDEX IF NOT EXISTS idx_llm_providers_workspace_enabled
  ON tenant_vutler.llm_providers (workspace_id, is_enabled, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_providers_workspace_provider
  ON tenant_vutler.llm_providers (workspace_id, provider);
