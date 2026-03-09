-- Migration: Add Snipara columns for auto-provisioning and task sync
-- Run as: psql with owner/admin credentials

-- Add Snipara project info to workspaces
ALTER TABLE tenant_vutler.workspaces 
  ADD COLUMN IF NOT EXISTS snipara_project_id TEXT,
  ADD COLUMN IF NOT EXISTS snipara_api_key TEXT;

-- Add swarm task ID to tasks for bidirectional sync
ALTER TABLE tenant_vutler.tasks 
  ADD COLUMN IF NOT EXISTS swarm_task_id TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tasks_swarm_task_id 
  ON tenant_vutler.tasks(swarm_task_id);

COMMENT ON COLUMN tenant_vutler.workspaces.snipara_project_id IS 'Snipara project ID for this workspace';
COMMENT ON COLUMN tenant_vutler.workspaces.snipara_api_key IS 'Snipara API key for this workspace project';
COMMENT ON COLUMN tenant_vutler.tasks.swarm_task_id IS 'Snipara swarm task ID for bidirectional sync';
