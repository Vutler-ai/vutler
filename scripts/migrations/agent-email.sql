-- Agent Email System Migration
-- Adds agent email addresses, workspace domain verification, and email routing

-- Agent email column (may already exist on some instances)
ALTER TABLE tenant_vutler.agents ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Workspace verified domains for custom email sending
CREATE TABLE IF NOT EXISTS tenant_vutler.workspace_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  domain VARCHAR(255) NOT NULL,
  mx_verified BOOLEAN DEFAULT false,
  spf_verified BOOLEAN DEFAULT false,
  dkim_verified BOOLEAN DEFAULT false,
  dmarc_verified BOOLEAN DEFAULT false,
  dns_records JSONB DEFAULT '{}',
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, domain)
);

-- Email routing: which agent handles incoming emails for a given address
CREATE TABLE IF NOT EXISTS tenant_vutler.email_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  email_address VARCHAR(255) NOT NULL UNIQUE,
  agent_id UUID REFERENCES tenant_vutler.agents(id) ON DELETE SET NULL,
  auto_reply BOOLEAN DEFAULT true,
  approval_required BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_workspace_domains_workspace ON tenant_vutler.workspace_domains(workspace_id);
CREATE INDEX IF NOT EXISTS idx_email_routes_workspace ON tenant_vutler.email_routes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_email_routes_agent ON tenant_vutler.email_routes(agent_id);
CREATE INDEX IF NOT EXISTS idx_email_routes_address ON tenant_vutler.email_routes(email_address);
