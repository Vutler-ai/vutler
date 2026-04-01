-- Usage analytics storage for workspace-scoped LLM activity.
-- This is the primary table used by services/llmRouter.js and api/usage-pg.js.

CREATE TABLE IF NOT EXISTS tenant_vutler.llm_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  agent_id UUID,
  provider VARCHAR(64) NOT NULL,
  model VARCHAR(255) NOT NULL,
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_workspace_created_at
  ON tenant_vutler.llm_usage_logs(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_agent_created_at
  ON tenant_vutler.llm_usage_logs(agent_id, created_at DESC);
