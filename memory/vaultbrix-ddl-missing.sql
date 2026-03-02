-- Missing columns for agents table (Vaultbrix DDL - run as admin)
-- Current issue: tenant_vutler_service user lacks ALTER TABLE permissions

-- Add missing columns to agents table
ALTER TABLE tenant_vutler.agents ADD COLUMN IF NOT EXISTS tools JSONB DEFAULT '[]';
ALTER TABLE tenant_vutler.agents ADD COLUMN IF NOT EXISTS avatar VARCHAR(500);
ALTER TABLE tenant_vutler.agents ADD COLUMN IF NOT EXISTS role VARCHAR(50);
ALTER TABLE tenant_vutler.agents ADD COLUMN IF NOT EXISTS mbti VARCHAR(10);
ALTER TABLE tenant_vutler.agents ADD COLUMN IF NOT EXISTS model VARCHAR(100);
ALTER TABLE tenant_vutler.agents ADD COLUMN IF NOT EXISTS provider VARCHAR(100);
ALTER TABLE tenant_vutler.agents ADD COLUMN IF NOT EXISTS system_prompt TEXT;
ALTER TABLE tenant_vutler.agents ADD COLUMN IF NOT EXISTS temperature DECIMAL(3,2) DEFAULT 0.7;
ALTER TABLE tenant_vutler.agents ADD COLUMN IF NOT EXISTS max_tokens INTEGER DEFAULT 4096;
ALTER TABLE tenant_vutler.agents ADD COLUMN IF NOT EXISTS capabilities JSONB DEFAULT '[]';
ALTER TABLE tenant_vutler.agents ADD COLUMN IF NOT EXISTS deployment_status VARCHAR(20) DEFAULT 'undeployed';
ALTER TABLE tenant_vutler.agents ADD COLUMN IF NOT EXISTS deployed_at TIMESTAMPTZ;
ALTER TABLE tenant_vutler.agents ADD COLUMN IF NOT EXISTS deployment_url VARCHAR(500);

-- Verify columns added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'tenant_vutler'
  AND table_name = 'agents'
ORDER BY ordinal_position;
