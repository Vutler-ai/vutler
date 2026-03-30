ALTER TABLE tenant_vutler.tasks
  ADD COLUMN IF NOT EXISTS snipara_task_id TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_snipara_task_id
  ON tenant_vutler.tasks (workspace_id, snipara_task_id)
  WHERE snipara_task_id IS NOT NULL;
