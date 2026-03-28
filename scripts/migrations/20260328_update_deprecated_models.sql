-- Migration: Update deprecated OpenAI models to current versions
-- Date: 2026-03-28
-- Reason: GPT-4o, GPT-4.1, GPT-4o-mini deprecated on 2026-02-13
--         GPT-5.1 removed 2026-03-11. Current lineup: GPT-5.4, GPT-5.3-Codex, GPT-5.3-Codex-Spark, o3
-- ============================================================================

BEGIN;

-- ─── 1. Update all agents with deprecated OpenAI models ─────────────────────

-- gpt-4o → gpt-5.4
UPDATE tenant_vutler.agents
SET model = 'gpt-5.4', updated_at = NOW()
WHERE model = 'gpt-4o';

-- gpt-4o-mini → gpt-5.4-mini
UPDATE tenant_vutler.agents
SET model = 'gpt-5.4-mini', updated_at = NOW()
WHERE model = 'gpt-4o-mini';

-- gpt-4.1 → gpt-5.4
UPDATE tenant_vutler.agents
SET model = 'gpt-5.4', updated_at = NOW()
WHERE model = 'gpt-4.1';

-- gpt-4.1-mini → gpt-5.4-mini
UPDATE tenant_vutler.agents
SET model = 'gpt-5.4-mini', updated_at = NOW()
WHERE model = 'gpt-4.1-mini';

-- gpt-5.2 → gpt-5.4
UPDATE tenant_vutler.agents
SET model = 'gpt-5.4', updated_at = NOW()
WHERE model = 'gpt-5.2';

-- gpt-5.3 → gpt-5.4
UPDATE tenant_vutler.agents
SET model = 'gpt-5.4', updated_at = NOW()
WHERE model = 'gpt-5.3';

-- o4-mini → o3
UPDATE tenant_vutler.agents
SET model = 'o3', updated_at = NOW()
WHERE model = 'o4-mini';

-- ─── 2. Update Codex-prefixed models ────────────────────────────────────────

-- codex/gpt-4o → codex/gpt-5.4
UPDATE tenant_vutler.agents
SET model = 'codex/gpt-5.4', updated_at = NOW()
WHERE model = 'codex/gpt-4o';

-- codex/gpt-4o-mini → codex/gpt-5.4-mini
UPDATE tenant_vutler.agents
SET model = 'codex/gpt-5.4-mini', updated_at = NOW()
WHERE model = 'codex/gpt-4o-mini';

-- codex/gpt-4.1 → codex/gpt-5.4
UPDATE tenant_vutler.agents
SET model = 'codex/gpt-5.4', updated_at = NOW()
WHERE model = 'codex/gpt-4.1';

-- codex/gpt-4.1-mini → codex/gpt-5.4-mini
UPDATE tenant_vutler.agents
SET model = 'codex/gpt-5.4-mini', updated_at = NOW()
WHERE model = 'codex/gpt-4.1-mini';

-- ─── 3. Update deprecated Anthropic model references ────────────────────────

UPDATE tenant_vutler.agents
SET model = 'claude-sonnet-4-20250514', updated_at = NOW()
WHERE model IN ('claude-3.5-sonnet', 'claude-3-5-sonnet', 'claude-sonnet-4.5');

UPDATE tenant_vutler.agents
SET model = 'claude-opus-4-20250514', updated_at = NOW()
WHERE model IN ('claude-3-opus', 'claude-3-opus-20240229');

UPDATE tenant_vutler.agents
SET model = 'claude-haiku-4-5', updated_at = NOW()
WHERE model IN ('claude-3-5-haiku-latest', 'claude-3-haiku');

-- ─── 4. Update legacy openai-codex/ prefix to codex/ ────────────────────────

UPDATE tenant_vutler.agents
SET model = REPLACE(model, 'openai-codex/', 'codex/'), updated_at = NOW()
WHERE model LIKE 'openai-codex/%';

-- ─── 5. Starbox Vutler agents → Codex with best model per role ──────────────
-- Mike (fast coding agent) → codex/gpt-5.3-codex-spark
UPDATE tenant_vutler.agents
SET model = 'codex/gpt-5.3-codex-spark', updated_at = NOW()
WHERE LOWER(name) IN ('mike', 'mike-local')
  AND model NOT LIKE 'codex/gpt-5.3-codex-spark';

-- Technical/coding agents → codex/gpt-5.3-codex
UPDATE tenant_vutler.agents
SET model = 'codex/gpt-5.3-codex', updated_at = NOW()
WHERE LOWER(name) IN ('michael', 'rex', 'sentinel')
  AND model NOT LIKE 'codex/gpt-5.3-codex';

-- Creative/strategic agents → codex/gpt-5.4
UPDATE tenant_vutler.agents
SET model = 'codex/gpt-5.4', updated_at = NOW()
WHERE LOWER(name) IN ('andrea', 'luna', 'nora', 'oscar', 'philip', 'stephen', 'victor', 'marcus')
  AND model NOT IN ('codex/gpt-5.4', 'codex/gpt-5.3-codex', 'codex/gpt-5.3-codex-spark');

-- Routine/support agents → codex/gpt-5.4-mini
UPDATE tenant_vutler.agents
SET model = 'codex/gpt-5.4-mini', updated_at = NOW()
WHERE LOWER(name) IN ('max', 'jarvis')
  AND model NOT IN ('codex/gpt-5.4-mini', 'codex/gpt-5.4', 'codex/gpt-5.3-codex');

-- ─── 6. Verification query (run manually to check) ─────────────────────────
-- SELECT name, model, updated_at FROM tenant_vutler.agents ORDER BY name;

COMMIT;
