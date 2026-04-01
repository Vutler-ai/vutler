CREATE TABLE IF NOT EXISTS tenant_vutler.sandbox_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  agent_id TEXT NULL,
  language TEXT NOT NULL,
  code TEXT NOT NULL,
  timeout_ms INTEGER NOT NULL DEFAULT 30000,
  status TEXT NOT NULL DEFAULT 'pending',
  stdout TEXT NULL,
  stderr TEXT NULL,
  exit_code INTEGER NULL,
  duration_ms INTEGER NULL,
  batch_id UUID NULL,
  batch_index INTEGER NULL,
  stop_on_error BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NOT NULL DEFAULT 'api',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  locked_by TEXT NULL,
  locked_at TIMESTAMPTZ NULL,
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  error TEXT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sandbox_jobs_workspace_created_idx
  ON tenant_vutler.sandbox_jobs (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sandbox_jobs_status_created_idx
  ON tenant_vutler.sandbox_jobs (status, created_at ASC);

CREATE INDEX IF NOT EXISTS sandbox_jobs_batch_idx
  ON tenant_vutler.sandbox_jobs (batch_id, batch_index);
