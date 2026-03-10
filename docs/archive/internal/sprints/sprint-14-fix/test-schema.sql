-- Sprint 14 Runtime - Schema Validation SQL
-- Run this on the VPS to verify all tables and columns exist
-- Author: Mike ⚙️
-- Date: 2026-02-27

\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
\echo '🔍 Sprint 14 Runtime - Schema Validation'
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
\echo ''

\echo '📋 Testing agent_runtime_status schema...'
SELECT 
  column_name, 
  data_type 
FROM information_schema.columns 
WHERE table_schema = 'tenant_vutler' 
  AND table_name = 'agent_runtime_status'
ORDER BY ordinal_position;

\echo ''
\echo '✅ Expected columns: id, agent_id, status, started_at, last_activity, config, created_at, workspace_id'
\echo ''

\echo '📋 Testing agent_llm_configs schema...'
SELECT 
  column_name, 
  data_type 
FROM information_schema.columns 
WHERE table_schema = 'tenant_vutler' 
  AND table_name = 'agent_llm_configs'
ORDER BY ordinal_position;

\echo ''
\echo '✅ Expected columns: id, agent_id, provider, model, temperature, max_tokens, created_at, updated_at, workspace_id'
\echo ''

\echo '📋 Testing agent_memories schema...'
SELECT 
  column_name, 
  data_type 
FROM information_schema.columns 
WHERE table_schema = 'tenant_vutler' 
  AND table_name = 'agent_memories'
ORDER BY ordinal_position;

\echo ''
\echo '✅ Expected columns: id, agent_id, type, content, metadata, created_at, updated_at, workspace_id'
\echo ''

\echo '📋 Testing tasks schema...'
SELECT 
  column_name, 
  data_type 
FROM information_schema.columns 
WHERE table_schema = 'tenant_vutler' 
  AND table_name = 'tasks'
ORDER BY ordinal_position;

\echo ''
\echo '✅ Expected columns: id, title, description, status, priority, assignee, due_date, created_at, updated_at, workspace_id'
\echo ''

\echo '📋 Testing goals schema...'
SELECT 
  column_name, 
  data_type 
FROM information_schema.columns 
WHERE table_schema = 'tenant_vutler' 
  AND table_name = 'goals'
ORDER BY ordinal_position;

\echo ''
\echo '✅ Expected columns: id, workspace_id, agent_id, title, description, status, progress, deadline, phases, checkins, priority, created_at, updated_at'
\echo ''

\echo '📋 Testing events schema...'
SELECT 
  column_name, 
  data_type 
FROM information_schema.columns 
WHERE table_schema = 'tenant_vutler' 
  AND table_name = 'events'
ORDER BY ordinal_position;

\echo ''
\echo '✅ Expected columns: id, workspace_id, title, description, start_time, end_time, agent_id, event_type, color, created_at'
\echo ''

\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
\echo '📊 Row Counts'
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
\echo ''

SELECT 
  'agent_runtime_status' AS table_name,
  COUNT(*) AS row_count
FROM tenant_vutler.agent_runtime_status
UNION ALL
SELECT 
  'agent_llm_configs',
  COUNT(*)
FROM tenant_vutler.agent_llm_configs
UNION ALL
SELECT 
  'agent_memories',
  COUNT(*)
FROM tenant_vutler.agent_memories
UNION ALL
SELECT 
  'tasks',
  COUNT(*)
FROM tenant_vutler.tasks
UNION ALL
SELECT 
  'goals',
  COUNT(*)
FROM tenant_vutler.goals
UNION ALL
SELECT 
  'events',
  COUNT(*)
FROM tenant_vutler.events;

\echo ''
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
\echo '✅ Schema Validation Complete'
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
\echo ''
\echo '🔍 Run this file with:'
\echo '  psql $DATABASE_URL -f test-schema.sql'
\echo ''
