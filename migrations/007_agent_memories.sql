-- Migration 007: Agent Memory System (Story 7.3)
-- Created: 2026-02-24
-- Description: Persistent memory storage per agent with expiry and lifecycle management

-- Drop existing table if running this as a fresh migration
-- DROP TABLE IF EXISTS agent_memories CASCADE;

CREATE TABLE IF NOT EXISTS agent_memories (
  id SERIAL PRIMARY KEY,
  agent_id VARCHAR(255) NOT NULL,
  memory_type VARCHAR(50) NOT NULL CHECK (memory_type IN ('fact', 'preference', 'context', 'conversation_summary')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  embedding_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NULL
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_agent_memories_agent_id ON agent_memories(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_memories_type ON agent_memories(agent_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_agent_memories_expires ON agent_memories(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_memories_created ON agent_memories(agent_id, created_at DESC);

-- GIN index for JSONB metadata (for future advanced queries)
CREATE INDEX IF NOT EXISTS idx_agent_memories_metadata ON agent_memories USING GIN (metadata);

-- Full-text search index for content (optional, for better search performance)
CREATE INDEX IF NOT EXISTS idx_agent_memories_content_search ON agent_memories USING GIN (to_tsvector('english', content));

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_agent_memories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trigger_agent_memories_updated_at ON agent_memories;
CREATE TRIGGER trigger_agent_memories_updated_at
  BEFORE UPDATE ON agent_memories
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_memories_updated_at();

-- Cleanup expired memories (run periodically via cron or API)
-- Example: DELETE FROM agent_memories WHERE expires_at IS NOT NULL AND expires_at < NOW();

COMMENT ON TABLE agent_memories IS 'Persistent memory storage per agent with TTL support';
COMMENT ON COLUMN agent_memories.memory_type IS 'Type: fact, preference, context, conversation_summary';
COMMENT ON COLUMN agent_memories.content IS 'The actual memory content (text)';
COMMENT ON COLUMN agent_memories.metadata IS 'JSON metadata: tags, source, confidence, etc.';
COMMENT ON COLUMN agent_memories.embedding_text IS 'Text for future semantic search (vector embeddings)';
COMMENT ON COLUMN agent_memories.expires_at IS 'Optional TTL for temporary memories';
