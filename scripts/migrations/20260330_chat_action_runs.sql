CREATE TABLE IF NOT EXISTS tenant_vutler.chat_action_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  chat_message_id UUID NOT NULL,
  channel_id UUID NOT NULL,
  requested_agent_id TEXT,
  display_agent_id TEXT,
  orchestrated_by TEXT,
  executed_by TEXT,
  action_key TEXT NOT NULL,
  adapter TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  input_json JSONB DEFAULT '{}'::jsonb,
  output_json JSONB DEFAULT '{}'::jsonb,
  error_json JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_action_runs_message
  ON tenant_vutler.chat_action_runs (workspace_id, chat_message_id, started_at DESC);
