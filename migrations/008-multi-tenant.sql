-- ============================================================================
-- Sprint 8.1 — Multi-Tenant Isolation (workspace_id + RLS)
-- Execute via Vaultbrix Dashboard (service role cannot run DDL)
-- ============================================================================
-- Date: 2026-02-26
-- Author: Mike ⚙️ (Lead Engineer)
-- 
-- This migration:
-- 1. Adds workspace_id UUID column to all 12 tenant_vutler tables
-- 2. Creates indexes on workspace_id
-- 3. Enables Row-Level Security (RLS)
-- 4. Creates workspace isolation policies
--
-- Default workspace_id: 00000000-0000-0000-0000-000000000000
-- (backward compatible — all existing data gets this default)
-- ============================================================================

BEGIN;

-- ─── Step 1: Add workspace_id column to all tables ─────────────────────────

ALTER TABLE tenant_vutler.agent_conversations
  ADD COLUMN IF NOT EXISTS workspace_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

ALTER TABLE tenant_vutler.agent_llm_configs
  ADD COLUMN IF NOT EXISTS workspace_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

ALTER TABLE tenant_vutler.agent_memories
  ADD COLUMN IF NOT EXISTS workspace_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

ALTER TABLE tenant_vutler.agent_runtime_status
  ADD COLUMN IF NOT EXISTS workspace_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

ALTER TABLE tenant_vutler.audit_logs
  ADD COLUMN IF NOT EXISTS workspace_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

ALTER TABLE tenant_vutler.calendar_events
  ADD COLUMN IF NOT EXISTS workspace_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

ALTER TABLE tenant_vutler.emails
  ADD COLUMN IF NOT EXISTS workspace_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

ALTER TABLE tenant_vutler.tasks
  ADD COLUMN IF NOT EXISTS workspace_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

ALTER TABLE tenant_vutler.templates
  ADD COLUMN IF NOT EXISTS workspace_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

ALTER TABLE tenant_vutler.token_usage
  ADD COLUMN IF NOT EXISTS workspace_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

ALTER TABLE tenant_vutler.workspace_llm_providers
  ADD COLUMN IF NOT EXISTS workspace_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

ALTER TABLE tenant_vutler.workspace_settings
  ADD COLUMN IF NOT EXISTS workspace_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

-- ─── Step 2: Create indexes on workspace_id ─────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_agent_conversations_workspace ON tenant_vutler.agent_conversations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_llm_configs_workspace ON tenant_vutler.agent_llm_configs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_memories_workspace ON tenant_vutler.agent_memories(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_runtime_status_workspace ON tenant_vutler.agent_runtime_status(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace ON tenant_vutler.audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_workspace ON tenant_vutler.calendar_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_emails_workspace ON tenant_vutler.emails(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tenant_vutler.tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_templates_workspace ON tenant_vutler.templates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_workspace ON tenant_vutler.token_usage(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_llm_providers_workspace ON tenant_vutler.workspace_llm_providers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_settings_workspace ON tenant_vutler.workspace_settings(workspace_id);

-- ─── Step 3: Enable Row-Level Security ──────────────────────────────────────
-- NOTE: RLS policies use current_setting('app.workspace_id') which must be
-- set per-connection via: SET app.workspace_id = '<uuid>';

ALTER TABLE tenant_vutler.agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_vutler.agent_llm_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_vutler.agent_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_vutler.agent_runtime_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_vutler.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_vutler.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_vutler.emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_vutler.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_vutler.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_vutler.token_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_vutler.workspace_llm_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_vutler.workspace_settings ENABLE ROW LEVEL SECURITY;

-- ─── Step 4: Create workspace isolation policies ────────────────────────────

CREATE POLICY workspace_isolation ON tenant_vutler.agent_conversations
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

CREATE POLICY workspace_isolation ON tenant_vutler.agent_llm_configs
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

CREATE POLICY workspace_isolation ON tenant_vutler.agent_memories
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

CREATE POLICY workspace_isolation ON tenant_vutler.agent_runtime_status
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

CREATE POLICY workspace_isolation ON tenant_vutler.audit_logs
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

CREATE POLICY workspace_isolation ON tenant_vutler.calendar_events
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

CREATE POLICY workspace_isolation ON tenant_vutler.emails
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

CREATE POLICY workspace_isolation ON tenant_vutler.tasks
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

CREATE POLICY workspace_isolation ON tenant_vutler.templates
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

CREATE POLICY workspace_isolation ON tenant_vutler.token_usage
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

CREATE POLICY workspace_isolation ON tenant_vutler.workspace_llm_providers
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

CREATE POLICY workspace_isolation ON tenant_vutler.workspace_settings
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

COMMIT;

-- ============================================================================
-- POST-MIGRATION VERIFICATION (run manually to check):
-- ============================================================================
-- SELECT table_name, column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_schema = 'tenant_vutler' AND column_name = 'workspace_id';
--
-- SELECT tablename, rowsecurity 
-- FROM pg_tables 
-- WHERE schemaname = 'tenant_vutler';
-- ============================================================================
