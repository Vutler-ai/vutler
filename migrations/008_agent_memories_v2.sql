-- Migration 008: Agent Memory v2 (Sprint 7.3 revised)
-- UUID primary key, updated type enum: fact|decision|learning|preference|todo

-- Drop old table if upgrading from v1
DROP TABLE IF EXISTS agent_memories CASCADE;

CREATE TABLE agent_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('fact','decision','learning','preference','todo')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_memories_agent ON agent_memories(agent_id);
CREATE INDEX idx_agent_memories_type ON agent_memories(agent_id, type);
CREATE INDEX idx_agent_memories_created ON agent_memories(created_at DESC);
CREATE INDEX idx_agent_memories_metadata ON agent_memories USING GIN (metadata);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_agent_memories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_agent_memories_updated_at ON agent_memories;
CREATE TRIGGER trigger_agent_memories_updated_at
  BEFORE UPDATE ON agent_memories
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_memories_updated_at();
