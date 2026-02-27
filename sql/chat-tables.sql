-- Chat Pro Tables for tenant_vutler schema
-- Execute with superuser/admin role

CREATE TABLE tenant_vutler.chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  type VARCHAR(20) DEFAULT 'channel', -- channel, direct, group
  workspace_id UUID NOT NULL,
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tenant_vutler.chat_channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES tenant_vutler.chat_channels(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'member', -- admin, member
  joined_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tenant_vutler.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES tenant_vutler.chat_channels(id) ON DELETE CASCADE,
  sender_id VARCHAR(255) NOT NULL,
  sender_name VARCHAR(255),
  content TEXT,
  message_type VARCHAR(20) DEFAULT 'text', -- text, file, image, system
  file_url TEXT,
  file_name VARCHAR(255),
  file_size BIGINT,
  parent_id UUID, -- for threads
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_chat_messages_channel_id ON tenant_vutler.chat_messages(channel_id);
CREATE INDEX idx_chat_messages_created_at ON tenant_vutler.chat_messages(created_at DESC);
CREATE INDEX idx_chat_messages_parent_id ON tenant_vutler.chat_messages(parent_id);
CREATE INDEX idx_chat_channel_members_channel_id ON tenant_vutler.chat_channel_members(channel_id);
CREATE INDEX idx_chat_channel_members_user_id ON tenant_vutler.chat_channel_members(user_id);
CREATE INDEX idx_chat_channels_workspace_id ON tenant_vutler.chat_channels(workspace_id);

-- Grant permissions to service role
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_vutler.chat_channels TO "tenant_vutler_service.vaultbrix-prod";
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_vutler.chat_channel_members TO "tenant_vutler_service.vaultbrix-prod";
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_vutler.chat_messages TO "tenant_vutler_service.vaultbrix-prod";
