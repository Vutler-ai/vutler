-- Email Groups (Distribution Lists) Migration
-- Allows creating shared email addresses like info@vutler.ai
-- that route to multiple agents and/or human members.

-- ─── Email Groups ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_vutler.email_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  name VARCHAR(100) NOT NULL,
  email_address VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  auto_reply BOOLEAN DEFAULT true,
  approval_required BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_groups_workspace
  ON tenant_vutler.email_groups(workspace_id);
CREATE INDEX IF NOT EXISTS idx_email_groups_address
  ON tenant_vutler.email_groups(email_address);

-- ─── Group Members ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_vutler.email_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES tenant_vutler.email_groups(id) ON DELETE CASCADE,
  member_type VARCHAR(10) NOT NULL CHECK (member_type IN ('agent', 'human')),
  -- Agent member fields
  agent_id UUID REFERENCES tenant_vutler.agents(id) ON DELETE CASCADE,
  -- Human member fields (forwarding)
  human_email VARCHAR(255),
  human_name VARCHAR(100),
  -- Membership settings
  role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  notify BOOLEAN DEFAULT true,
  can_reply BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Ensure either agent or human is set
  CHECK (
    (member_type = 'agent' AND agent_id IS NOT NULL) OR
    (member_type = 'human' AND human_email IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_email_group_members_group
  ON tenant_vutler.email_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_email_group_members_agent
  ON tenant_vutler.email_group_members(agent_id);

-- Prevent duplicate agent memberships (human can have multiple via different emails)
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_group_members_unique_agent
  ON tenant_vutler.email_group_members(group_id, agent_id)
  WHERE agent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_group_members_unique_human
  ON tenant_vutler.email_group_members(group_id, human_email)
  WHERE human_email IS NOT NULL;
