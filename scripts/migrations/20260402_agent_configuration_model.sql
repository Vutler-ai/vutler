-- Agent configuration model bootstrap
-- Adds the columns required by the current agent settings surface
-- (`GET /api/v1/agents/:id/config`, `PUT /api/v1/agents/:id/config`,
--  `PATCH /api/v1/agents/:id/access`, `PATCH /api/v1/agents/:id/provisioning`)

ALTER TABLE tenant_vutler.agents ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE tenant_vutler.agents ADD COLUMN IF NOT EXISTS avatar VARCHAR(500);
ALTER TABLE tenant_vutler.agents ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE tenant_vutler.agents ADD COLUMN IF NOT EXISTS role VARCHAR(50);
ALTER TABLE tenant_vutler.agents ADD COLUMN IF NOT EXISTS mbti VARCHAR(10);
ALTER TABLE tenant_vutler.agents ADD COLUMN IF NOT EXISTS model VARCHAR(100);
ALTER TABLE tenant_vutler.agents ADD COLUMN IF NOT EXISTS provider VARCHAR(100);
ALTER TABLE tenant_vutler.agents ADD COLUMN IF NOT EXISTS system_prompt TEXT;
ALTER TABLE tenant_vutler.agents ADD COLUMN IF NOT EXISTS temperature DECIMAL(3,2) DEFAULT 0.7;
ALTER TABLE tenant_vutler.agents ADD COLUMN IF NOT EXISTS max_tokens INTEGER DEFAULT 4096;
ALTER TABLE tenant_vutler.agents ADD COLUMN IF NOT EXISTS capabilities JSONB DEFAULT '[]'::jsonb;
ALTER TABLE tenant_vutler.agents ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'tenant_vutler'
      AND table_name = 'agents'
      AND column_name = 'capabilities'
      AND udt_name <> 'jsonb'
  ) THEN
    ALTER TABLE tenant_vutler.agents
      ALTER COLUMN capabilities DROP DEFAULT,
      ALTER COLUMN capabilities TYPE JSONB
      USING CASE
        WHEN capabilities IS NULL THEN '[]'::jsonb
        ELSE to_jsonb(capabilities)
      END,
      ALTER COLUMN capabilities SET DEFAULT '[]'::jsonb;
  END IF;
END $$;

UPDATE tenant_vutler.agents
SET capabilities = '[]'::jsonb
WHERE capabilities IS NULL;

UPDATE tenant_vutler.agents
SET config = '{}'::jsonb
WHERE config IS NULL;

CREATE TABLE IF NOT EXISTS tenant_vutler.email_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  email_address VARCHAR(255) NOT NULL UNIQUE,
  agent_id UUID REFERENCES tenant_vutler.agents(id) ON DELETE SET NULL,
  auto_reply BOOLEAN DEFAULT true,
  approval_required BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_routes_workspace
  ON tenant_vutler.email_routes(workspace_id);

CREATE INDEX IF NOT EXISTS idx_email_routes_agent
  ON tenant_vutler.email_routes(agent_id);

CREATE INDEX IF NOT EXISTS idx_email_routes_address
  ON tenant_vutler.email_routes(email_address);
