-- ==========================================
-- Sprint 8 - Multi-tenant isolation migration
-- ==========================================

-- 1. Fix token_usage workspace_id to be NOT NULL with default
ALTER TABLE token_usage 
  ALTER COLUMN workspace_id SET NOT NULL,
  ALTER COLUMN workspace_id SET DEFAULT 'default';

-- Create index if not exists
CREATE INDEX IF NOT EXISTS idx_token_usage_workspace ON token_usage (workspace_id);

-- 2. Enable RLS on all tables that need it
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_llm_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_model_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE drive_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_llm_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_partners ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing incorrect policies
DROP POLICY IF EXISTS ws_isolation_templates ON templates;
DROP POLICY IF EXISTS ws_isolation_audit_logs ON audit_logs;
DROP POLICY IF EXISTS ws_isolation_agent_llm_cfg ON agent_llm_configs;
DROP POLICY IF EXISTS ws_isolation_agent_model_assign ON agent_model_assignments;

-- 4. Create proper workspace isolation policies
-- (Using current_setting to get workspace_id from application context)

-- Agents
CREATE POLICY ws_isolation_agents ON agents
  USING (workspace_id = current_setting('app.workspace_id', true));

-- Templates 
CREATE POLICY ws_isolation_templates ON templates
  USING (workspace_id = current_setting('app.workspace_id', true));

-- Audit logs
CREATE POLICY ws_isolation_audit_logs ON audit_logs
  USING (workspace_id = current_setting('app.workspace_id', true));

-- Token usage
CREATE POLICY ws_isolation_token_usage ON token_usage
  USING (workspace_id = current_setting('app.workspace_id', true));

-- Agent LLM configs
CREATE POLICY ws_isolation_agent_llm_configs ON agent_llm_configs
  USING (workspace_id = current_setting('app.workspace_id', true));

-- Agent model assignments
CREATE POLICY ws_isolation_agent_model_assignments ON agent_model_assignments
  USING (workspace_id = current_setting('app.workspace_id', true));

-- Agent emails
CREATE POLICY ws_isolation_agent_emails ON agent_emails
  USING (workspace_id = current_setting('app.workspace_id', true));

-- Drive files
CREATE POLICY ws_isolation_drive_files ON drive_files
  USING (workspace_id = current_setting('app.workspace_id', true));

-- Shared channels
CREATE POLICY ws_isolation_shared_channels ON shared_channels
  USING (workspace_id = current_setting('app.workspace_id', true));

-- Workspace settings (inherently workspace-specific)
CREATE POLICY ws_isolation_workspace_settings ON workspace_settings
  USING (workspace_id = current_setting('app.workspace_id', true));

-- Workspace LLM providers
CREATE POLICY ws_isolation_workspace_llm_providers ON workspace_llm_providers
  USING (workspace_id = current_setting('app.workspace_id', true));

-- Workspace partners  
CREATE POLICY ws_isolation_workspace_partners ON workspace_partners
  USING (workspace_id = current_setting('app.workspace_id', true));

-- 5. Create workspace context function
CREATE OR REPLACE FUNCTION set_workspace_context(ws_id text)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.workspace_id', ws_id, true);
END;
$$ LANGUAGE plpgsql;

-- 6. Add missing tables that might need workspace_id
-- (Check for tables that don't have workspace_id yet)

-- Agent context
ALTER TABLE agent_context ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS idx_agent_context_workspace ON agent_context (workspace_id);
ALTER TABLE agent_context ENABLE ROW LEVEL SECURITY;
CREATE POLICY ws_isolation_agent_context ON agent_context
  USING (workspace_id = current_setting('app.workspace_id', true));

-- Agent tools  
ALTER TABLE agent_tools ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS idx_agent_tools_workspace ON agent_tools (workspace_id);
ALTER TABLE agent_tools ENABLE ROW LEVEL SECURITY;
CREATE POLICY ws_isolation_agent_tools ON agent_tools
  USING (workspace_id = current_setting('app.workspace_id', true));

-- Agent RC channels
ALTER TABLE agent_rc_channels ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS idx_agent_rc_channels_workspace ON agent_rc_channels (workspace_id);
ALTER TABLE agent_rc_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY ws_isolation_agent_rc_channels ON agent_rc_channels
  USING (workspace_id = current_setting('app.workspace_id', true));

-- Email signatures
ALTER TABLE email_signatures ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS idx_email_signatures_workspace ON email_signatures (workspace_id);
ALTER TABLE email_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY ws_isolation_email_signatures ON email_signatures
  USING (workspace_id = current_setting('app.workspace_id', true));

-- VChat inbox
ALTER TABLE vchat_inbox ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS idx_vchat_inbox_workspace ON vchat_inbox (workspace_id);
ALTER TABLE vchat_inbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY ws_isolation_vchat_inbox ON vchat_inbox
  USING (workspace_id = current_setting('app.workspace_id', true));

-- Connect message log
ALTER TABLE connect_message_log ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS idx_connect_message_log_workspace ON connect_message_log (workspace_id);
ALTER TABLE connect_message_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY ws_isolation_connect_message_log ON connect_message_log
  USING (workspace_id = current_setting('app.workspace_id', true));

-- Subscriptions
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS idx_subscriptions_workspace ON subscriptions (workspace_id);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY ws_isolation_subscriptions ON subscriptions
  USING (workspace_id = current_setting('app.workspace_id', true));

-- Agent email configs
ALTER TABLE agent_email_configs ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS idx_agent_email_configs_workspace ON agent_email_configs (workspace_id);
ALTER TABLE agent_email_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY ws_isolation_agent_email_configs ON agent_email_configs
  USING (workspace_id = current_setting('app.workspace_id', true));