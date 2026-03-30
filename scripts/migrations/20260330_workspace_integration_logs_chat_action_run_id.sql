ALTER TABLE tenant_vutler.workspace_integration_logs
  ADD COLUMN IF NOT EXISTS chat_action_run_id UUID;

CREATE INDEX IF NOT EXISTS idx_workspace_integration_logs_chat_action_run
  ON tenant_vutler.workspace_integration_logs (workspace_id, chat_action_run_id, created_at DESC);
