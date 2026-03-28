-- Social Media Integration (Post for Me)
-- Tables for social account connections and usage tracking

-- Social accounts connected via Post for Me OAuth
CREATE TABLE IF NOT EXISTS tenant_vutler.social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  platform VARCHAR(50) NOT NULL,          -- linkedin, twitter, instagram, tiktok, facebook, etc.
  platform_account_id VARCHAR(255),       -- Post for Me account ID
  account_name VARCHAR(255),              -- Display name (e.g. "Vutler LinkedIn Page")
  account_type VARCHAR(50) DEFAULT 'personal', -- personal, page, group
  external_id VARCHAR(255),               -- Post for Me external_id (ws_{workspaceId})
  metadata JSONB DEFAULT '{}',            -- Additional account info from Post for Me
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_accounts_workspace
  ON tenant_vutler.social_accounts(workspace_id);

-- Social posts usage tracking (for quota enforcement)
CREATE TABLE IF NOT EXISTS tenant_vutler.social_posts_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  agent_id UUID,                          -- Which agent posted (nullable for manual posts)
  platform VARCHAR(50) NOT NULL,
  post_id VARCHAR(255),                   -- Post for Me post ID
  caption TEXT,
  status VARCHAR(50) DEFAULT 'processing', -- processing, success, failed
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_usage_workspace_month
  ON tenant_vutler.social_posts_usage(workspace_id, created_at);

-- Social media add-on subscriptions (purchased packs)
CREATE TABLE IF NOT EXISTS tenant_vutler.social_media_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  addon_id VARCHAR(100) NOT NULL,         -- social_posts_100, social_posts_500, social_posts_2000
  posts_included INT NOT NULL,
  stripe_subscription_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_media_addons_workspace
  ON tenant_vutler.social_media_addons(workspace_id);
