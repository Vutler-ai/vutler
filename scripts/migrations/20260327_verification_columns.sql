-- Add verification columns for closed-loop swarm orchestration
-- These columns store LLM verification scores and retry state

ALTER TABLE tenant_vutler.tasks
  ADD COLUMN IF NOT EXISTS verification_score numeric(3,1),
  ADD COLUMN IF NOT EXISTS verification_result jsonb,
  ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0;
