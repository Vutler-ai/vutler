-- Integrations migration: add OAuth token columns to workspace_integrations
-- Run with: psql $DATABASE_URL -f scripts/migrations/integrations.sql

-- Ensure table exists with correct base structure
CREATE TABLE IF NOT EXISTS tenant_vutler.workspace_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  provider VARCHAR(50) NOT NULL,
  source TEXT NOT NULL DEFAULT 'internal',
  connected BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'disconnected',
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  config JSONB NOT NULL DEFAULT '{}',
  scopes JSONB NOT NULL DEFAULT '[]',
  credentials JSONB NOT NULL DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  connected_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, provider)
);

-- Add OAuth token columns if they don't exist yet (idempotent)
ALTER TABLE tenant_vutler.workspace_integrations
  ADD COLUMN IF NOT EXISTS access_token TEXT,
  ADD COLUMN IF NOT EXISTS refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Index for fast workspace lookup
CREATE INDEX IF NOT EXISTS idx_workspace_integrations_workspace_id
  ON tenant_vutler.workspace_integrations (workspace_id);

CREATE INDEX IF NOT EXISTS idx_workspace_integrations_provider
  ON tenant_vutler.workspace_integrations (provider);
