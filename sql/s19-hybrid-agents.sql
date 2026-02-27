-- Sprint 19: Hybrid Agents (On-Premise)
-- Schema: tenant_vutler on Vaultbrix

SET search_path TO tenant_vutler;

DO $$ BEGIN
  CREATE TYPE hybrid_agent_status AS ENUM ('online', 'offline', 'degraded', 'provisioning');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hybrid_task_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Hybrid agents registry
CREATE TABLE IF NOT EXISTS hybrid_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id VARCHAR(64) NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status hybrid_agent_status DEFAULT 'provisioning',
    tunnel_token VARCHAR(255) NOT NULL UNIQUE,
    version VARCHAR(32),
    hostname VARCHAR(255),
    ip_address VARCHAR(45),
    config JSONB DEFAULT '{}',
    metrics JSONB DEFAULT '{}',
    last_heartbeat TIMESTAMPTZ,
    data_filter_rules JSONB DEFAULT '{"allowlist": [], "blocklist": []}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hybrid agent tasks
CREATE TABLE IF NOT EXISTS hybrid_agent_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES hybrid_agents(id) ON DELETE CASCADE,
    task_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    result JSONB,
    status hybrid_task_status DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hybrid agent logs (audit trail)
CREATE TABLE IF NOT EXISTS hybrid_agent_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES hybrid_agents(id) ON DELETE CASCADE,
    level VARCHAR(16) DEFAULT 'info',
    event VARCHAR(64) NOT NULL,
    details JSONB DEFAULT '{}',
    data_transferred BOOLEAN DEFAULT FALSE,
    data_fields TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hybrid_agents_workspace ON hybrid_agents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_hybrid_agents_status ON hybrid_agents(status);
CREATE INDEX IF NOT EXISTS idx_hybrid_agents_token ON hybrid_agents(tunnel_token);
CREATE INDEX IF NOT EXISTS idx_hybrid_agents_heartbeat ON hybrid_agents(last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_hybrid_tasks_agent ON hybrid_agent_tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_hybrid_tasks_status ON hybrid_agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_hybrid_logs_agent ON hybrid_agent_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_hybrid_logs_created ON hybrid_agent_logs(created_at DESC);

-- Grants
GRANT ALL ON hybrid_agents TO "tenant_vutler_service.vaultbrix-prod";
GRANT ALL ON hybrid_agent_tasks TO "tenant_vutler_service.vaultbrix-prod";
GRANT ALL ON hybrid_agent_logs TO "tenant_vutler_service.vaultbrix-prod";
