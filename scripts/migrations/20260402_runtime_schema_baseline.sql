-- Baseline for schemas that used to be bootstrapped at runtime.
-- After this migration, production code can validate schema readiness
-- instead of issuing CREATE/ALTER statements from request paths.

CREATE TABLE IF NOT EXISTS tenant_vutler.workspace_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  created_by_user_id UUID NULL,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'developer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL
);

ALTER TABLE tenant_vutler.workspace_api_keys
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID NULL,
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'developer',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_api_keys_workspace
  ON tenant_vutler.workspace_api_keys (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_api_keys_active
  ON tenant_vutler.workspace_api_keys (workspace_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS tenant_vutler.integrations_catalog (
  provider TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  category TEXT,
  source TEXT NOT NULL DEFAULT 'internal',
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_vutler.workspace_integration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  provider TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER,
  error_message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_vutler.workspace_integration_agents (
  workspace_id UUID NOT NULL,
  provider TEXT NOT NULL,
  agent_id UUID NOT NULL,
  has_access BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, provider, agent_id)
);

ALTER TABLE tenant_vutler.workspace_integrations
  ADD COLUMN IF NOT EXISTS access_token TEXT,
  ADD COLUMN IF NOT EXISTS refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS tenant_vutler.sandbox_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NULL,
  agent_id TEXT NULL,
  language TEXT NOT NULL,
  code TEXT NOT NULL,
  stdout TEXT NULL,
  stderr TEXT NULL,
  exit_code INTEGER NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  duration_ms INTEGER NULL,
  batch_id UUID NULL,
  batch_index INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant_vutler.sandbox_executions
  ADD COLUMN IF NOT EXISTS workspace_id UUID NULL,
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER NULL,
  ADD COLUMN IF NOT EXISTS batch_id UUID NULL,
  ADD COLUMN IF NOT EXISTS batch_index INTEGER NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

CREATE TABLE IF NOT EXISTS tenant_vutler.vault_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'ssh', 'api_token', 'smtp', 'database',
    'password', 'certificate', 'custom'
  )),
  host TEXT NULL,
  port INTEGER NULL,
  username TEXT NULL,
  secret_encrypted TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  notes TEXT NULL,
  source_file TEXT NULL,
  extracted_by TEXT NULL,
  last_used_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_workspace
  ON tenant_vutler.vault_secrets (workspace_id);

CREATE INDEX IF NOT EXISTS idx_vault_tags
  ON tenant_vutler.vault_secrets USING gin (tags);

CREATE TABLE IF NOT EXISTS tenant_vutler.browser_operator_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  app_key TEXT NOT NULL,
  credential_key TEXT NOT NULL,
  credential_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_tested_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_browser_operator_credentials_workspace_key
  ON tenant_vutler.browser_operator_credentials (workspace_id, credential_key);

CREATE INDEX IF NOT EXISTS idx_browser_operator_credentials_workspace
  ON tenant_vutler.browser_operator_credentials (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tenant_vutler.browser_operator_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  app_key TEXT NOT NULL,
  session_key TEXT NOT NULL,
  runtime_mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  storage_state JSONB NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_browser_operator_sessions_workspace_key
  ON tenant_vutler.browser_operator_sessions (workspace_id, app_key, session_key);

CREATE TABLE IF NOT EXISTS tenant_vutler.browser_operator_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  requested_by_user_id UUID NULL,
  runtime_mode TEXT NOT NULL,
  profile_key TEXT NOT NULL,
  profile_version TEXT NULL,
  credentials_ref TEXT NULL,
  session_mode TEXT NOT NULL DEFAULT 'ephemeral',
  session_key TEXT NULL,
  status TEXT NOT NULL,
  target JSONB NOT NULL,
  flow_key TEXT NULL,
  flow_version TEXT NULL,
  governance JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  report_format TEXT NOT NULL DEFAULT 'full',
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant_vutler.browser_operator_runs
  ADD COLUMN IF NOT EXISTS credentials_ref TEXT NULL,
  ADD COLUMN IF NOT EXISTS session_mode TEXT NOT NULL DEFAULT 'ephemeral',
  ADD COLUMN IF NOT EXISTS session_key TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_browser_operator_runs_workspace
  ON tenant_vutler.browser_operator_runs (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tenant_vutler.browser_operator_run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES tenant_vutler.browser_operator_runs(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  action_key TEXT NOT NULL,
  status TEXT NOT NULL,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NULL,
  error JSONB NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_browser_operator_steps_run
  ON tenant_vutler.browser_operator_run_steps (run_id, step_index);

CREATE TABLE IF NOT EXISTS tenant_vutler.browser_operator_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES tenant_vutler.browser_operator_runs(id) ON DELETE CASCADE,
  step_id UUID NULL REFERENCES tenant_vutler.browser_operator_run_steps(id) ON DELETE SET NULL,
  artifact_kind TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  mime_type TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  inline_text TEXT NULL,
  artifact_payload JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_browser_operator_evidence_run
  ON tenant_vutler.browser_operator_evidence (run_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tenant_vutler.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NULL,
  workspace_id TEXT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  title TEXT NULL,
  message TEXT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS tenant_vutler.automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  name TEXT NOT NULL,
  trigger JSONB NULL,
  action JSONB NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_run TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_vutler.goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  title TEXT NOT NULL,
  description TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  due_date TIMESTAMPTZ NULL,
  assigned_to UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_vutler.password_reset_tokens (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'tenant_vutler'
       AND table_name = 'users_auth'
  ) THEN
    EXECUTE '
      ALTER TABLE tenant_vutler.users_auth
        ADD COLUMN IF NOT EXISTS salt TEXT,
        ADD COLUMN IF NOT EXISTS name TEXT,
        ADD COLUMN IF NOT EXISTS role TEXT DEFAULT ''user'',
        ADD COLUMN IF NOT EXISTS workspace_id UUID DEFAULT ''00000000-0000-0000-0000-000000000001'',
        ADD COLUMN IF NOT EXISTS avatar_url TEXT,
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ
    ';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'tenant_vutler'
       AND table_name = 'workspace_settings'
  ) THEN
    EXECUTE '
      ALTER TABLE tenant_vutler.workspace_settings
        ADD COLUMN IF NOT EXISTS notification_email TEXT,
        ADD COLUMN IF NOT EXISTS notification_settings JSONB DEFAULT ''{}''::jsonb
    ';
  END IF;
END $$;
