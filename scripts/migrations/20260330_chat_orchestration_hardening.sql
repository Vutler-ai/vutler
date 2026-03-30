ALTER TABLE tenant_vutler.chat_messages
  ADD COLUMN IF NOT EXISTS processing_state TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS processing_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID;

CREATE INDEX IF NOT EXISTS idx_chat_messages_processing
  ON tenant_vutler.chat_messages (workspace_id, processing_state, next_retry_at, created_at);

CREATE INDEX IF NOT EXISTS idx_chat_messages_reply_to
  ON tenant_vutler.chat_messages (reply_to_message_id);

ALTER TABLE tenant_vutler.tasks
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by TEXT,
  ADD COLUMN IF NOT EXISTS execution_attempts INTEGER NOT NULL DEFAULT 0;
