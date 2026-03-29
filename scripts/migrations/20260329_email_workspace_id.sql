-- Migration: Add workspace_id to emails and email_messages tables
-- Required for multi-tenant workspace isolation (audit 2026-03-29)

-- 1. Add workspace_id column to emails table
ALTER TABLE tenant_vutler.emails ADD COLUMN IF NOT EXISTS workspace_id UUID;
CREATE INDEX IF NOT EXISTS idx_emails_workspace_id ON tenant_vutler.emails(workspace_id);
CREATE INDEX IF NOT EXISTS idx_emails_workspace_folder ON tenant_vutler.emails(workspace_id, folder);

-- 2. Add workspace_id column to email_messages table
ALTER TABLE tenant_vutler.email_messages ADD COLUMN IF NOT EXISTS workspace_id UUID;
CREATE INDEX IF NOT EXISTS idx_email_messages_workspace_id ON tenant_vutler.email_messages(workspace_id);

-- 3. Backfill workspace_id from agent's workspace (for emails linked to agents)
UPDATE tenant_vutler.emails e
SET workspace_id = a.workspace_id
FROM tenant_vutler.agents a
WHERE e.agent_id = a.id::text AND e.workspace_id IS NULL;

-- 4. Backfill email_messages from email_routes workspace
UPDATE tenant_vutler.email_messages em
SET workspace_id = er.workspace_id
FROM tenant_vutler.email_routes er
WHERE em.to_addr LIKE '%' || er.address || '%' AND em.workspace_id IS NULL;
