CREATE TABLE IF NOT EXISTS tenant_vutler.orchestration_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  source TEXT NOT NULL,
  source_ref JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued',
  mode TEXT NOT NULL DEFAULT 'autonomous',
  requested_agent_id UUID NULL,
  requested_agent_username TEXT NULL,
  display_agent_id UUID NULL,
  display_agent_username TEXT NULL,
  orchestrated_by TEXT NOT NULL DEFAULT 'jarvis',
  coordinator_agent_id UUID NULL,
  coordinator_agent_username TEXT NULL,
  root_task_id UUID NULL,
  current_step_id UUID NULL,
  lock_token UUID NULL,
  locked_by TEXT NULL,
  locked_at TIMESTAMPTZ NULL,
  lease_expires_at TIMESTAMPTZ NULL,
  next_wake_at TIMESTAMPTZ NULL,
  last_progress_at TIMESTAMPTZ NULL,
  summary TEXT NULL,
  plan_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json JSONB NULL,
  error_json JSONB NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT orchestration_runs_status_chk CHECK (
    status IN (
      'queued',
      'planning',
      'running',
      'waiting_on_tasks',
      'awaiting_approval',
      'sleeping',
      'blocked',
      'completed',
      'failed',
      'cancelled',
      'timed_out'
    )
  ),
  CONSTRAINT orchestration_runs_mode_chk CHECK (
    mode IN ('direct', 'assisted', 'autonomous')
  )
);

CREATE INDEX IF NOT EXISTS idx_orch_runs_workspace_status
  ON tenant_vutler.orchestration_runs (workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orch_runs_next_wake
  ON tenant_vutler.orchestration_runs (status, next_wake_at)
  WHERE next_wake_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orch_runs_root_task
  ON tenant_vutler.orchestration_runs (root_task_id)
  WHERE root_task_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS tenant_vutler.orchestration_run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES tenant_vutler.orchestration_runs(id) ON DELETE CASCADE,
  parent_step_id UUID NULL REFERENCES tenant_vutler.orchestration_run_steps(id) ON DELETE SET NULL,
  sequence_no INTEGER NOT NULL,
  step_type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  executor TEXT NOT NULL,
  selected_agent_id UUID NULL,
  selected_agent_username TEXT NULL,
  spawned_task_id UUID NULL,
  tool_name TEXT NULL,
  skill_key TEXT NULL,
  policy_bundle TEXT NULL,
  approval_mode TEXT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  input_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_json JSONB NULL,
  error_json JSONB NULL,
  wait_json JSONB NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT orchestration_run_steps_status_chk CHECK (
    status IN (
      'queued',
      'running',
      'waiting',
      'awaiting_approval',
      'completed',
      'failed',
      'cancelled',
      'skipped'
    )
  ),
  CONSTRAINT orchestration_run_steps_type_chk CHECK (
    step_type IN (
      'plan',
      'direct_answer',
      'tool',
      'delegate_task',
      'verify',
      'approval_gate',
      'wait',
      'checkpoint',
      'memory_write',
      'sleep',
      'finalize'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orch_steps_run_sequence
  ON tenant_vutler.orchestration_run_steps (run_id, sequence_no);

CREATE INDEX IF NOT EXISTS idx_orch_steps_run_status
  ON tenant_vutler.orchestration_run_steps (run_id, status, sequence_no);

CREATE INDEX IF NOT EXISTS idx_orch_steps_spawned_task
  ON tenant_vutler.orchestration_run_steps (spawned_task_id)
  WHERE spawned_task_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS tenant_vutler.orchestration_run_events (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES tenant_vutler.orchestration_runs(id) ON DELETE CASCADE,
  step_id UUID NULL REFERENCES tenant_vutler.orchestration_run_steps(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orch_events_run_created
  ON tenant_vutler.orchestration_run_events (run_id, created_at DESC);
