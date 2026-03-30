ALTER TABLE tenant_vutler.chat_messages
  ADD COLUMN IF NOT EXISTS requested_agent_id TEXT,
  ADD COLUMN IF NOT EXISTS display_agent_id TEXT,
  ADD COLUMN IF NOT EXISTS orchestrated_by TEXT,
  ADD COLUMN IF NOT EXISTS executed_by TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_chat_messages_requested_agent
  ON tenant_vutler.chat_messages (workspace_id, requested_agent_id, created_at DESC);
