-- Schema for Vutler API PostgreSQL tables
-- Database: vaultbrix
-- User: vaultbrix
-- Host: vutler-postgres

-- LLM Providers table
CREATE TABLE IF NOT EXISTS workspace_llm_providers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  provider_type VARCHAR(100) NOT NULL,
  api_key TEXT,
  api_url TEXT,
  model VARCHAR(255),
  config JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index on provider_type for faster lookups
CREATE INDEX IF NOT EXISTS idx_providers_type ON workspace_llm_providers(provider_type);
CREATE INDEX IF NOT EXISTS idx_providers_active ON workspace_llm_providers(is_active);

-- Workspace Settings table
CREATE TABLE IF NOT EXISTS workspace_settings (
  key VARCHAR(255) PRIMARY KEY,
  value TEXT NOT NULL,
  type VARCHAR(50),
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default settings (optional)
INSERT INTO workspace_settings (key, value, type, description, created_at, updated_at)
VALUES 
  ('theme', 'dark', 'string', 'Default UI theme', NOW(), NOW()),
  ('language', 'en', 'string', 'Default interface language', NOW(), NOW()),
  ('timezone', 'UTC', 'string', 'Default timezone', NOW(), NOW())
ON CONFLICT (key) DO NOTHING;

-- ─── Sprint 7.4: Vutler Connect ─────────────────────────────────

CREATE TABLE IF NOT EXISTS connect_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  channel VARCHAR(50) NOT NULL DEFAULT 'whatsapp',
  webhook_url TEXT,
  config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS connect_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES connect_partners(id) ON DELETE CASCADE,
  agent_id VARCHAR(255),
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('in', 'out')),
  channel VARCHAR(50) NOT NULL DEFAULT 'whatsapp',
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connect_partners_phone ON connect_partners(phone);
CREATE INDEX IF NOT EXISTS idx_connect_partners_active ON connect_partners(is_active);
CREATE INDEX IF NOT EXISTS idx_connect_messages_partner ON connect_messages(partner_id);
CREATE INDEX IF NOT EXISTS idx_connect_messages_created ON connect_messages(created_at);

-- Example provider data (optional)
-- INSERT INTO workspace_llm_providers (name, provider_type, api_url, model, is_active)
-- VALUES 
--   ('OpenAI', 'openai', 'https://api.openai.com/v1', 'gpt-4', true),
--   ('Anthropic', 'anthropic', 'https://api.anthropic.com/v1', 'claude-3-opus', true)
-- ON CONFLICT DO NOTHING;
