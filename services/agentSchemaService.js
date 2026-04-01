'use strict';

const pool = require('../lib/vaultbrix');
const {
  assertColumnsExist,
  assertTableExists,
  runtimeSchemaMutationsAllowed,
} = require('../lib/schemaReadiness');

const SCHEMA = 'tenant_vutler';

const REQUIRED_AGENT_COLUMNS = Object.freeze({
  email: `ALTER TABLE ${SCHEMA}.agents ADD COLUMN IF NOT EXISTS email VARCHAR(255)`,
  avatar: `ALTER TABLE ${SCHEMA}.agents ADD COLUMN IF NOT EXISTS avatar VARCHAR(500)`,
  description: `ALTER TABLE ${SCHEMA}.agents ADD COLUMN IF NOT EXISTS description TEXT`,
  role: `ALTER TABLE ${SCHEMA}.agents ADD COLUMN IF NOT EXISTS role VARCHAR(50)`,
  mbti: `ALTER TABLE ${SCHEMA}.agents ADD COLUMN IF NOT EXISTS mbti VARCHAR(10)`,
  model: `ALTER TABLE ${SCHEMA}.agents ADD COLUMN IF NOT EXISTS model VARCHAR(100)`,
  provider: `ALTER TABLE ${SCHEMA}.agents ADD COLUMN IF NOT EXISTS provider VARCHAR(100)`,
  system_prompt: `ALTER TABLE ${SCHEMA}.agents ADD COLUMN IF NOT EXISTS system_prompt TEXT`,
  temperature: `ALTER TABLE ${SCHEMA}.agents ADD COLUMN IF NOT EXISTS temperature DECIMAL(3,2) DEFAULT 0.7`,
  max_tokens: `ALTER TABLE ${SCHEMA}.agents ADD COLUMN IF NOT EXISTS max_tokens INTEGER DEFAULT 4096`,
  capabilities: `ALTER TABLE ${SCHEMA}.agents ADD COLUMN IF NOT EXISTS capabilities JSONB DEFAULT '[]'::jsonb`,
  config: `ALTER TABLE ${SCHEMA}.agents ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb`,
});

const AGENT_BACKFILL_STATEMENTS = [
  `UPDATE ${SCHEMA}.agents SET capabilities = '[]'::jsonb WHERE capabilities IS NULL`,
  `UPDATE ${SCHEMA}.agents SET config = '{}'::jsonb WHERE config IS NULL`,
];

let ensurePromise = null;

function buildPermissionError() {
  return new Error(
    'Agent schema is outdated and automatic bootstrap failed because the database role cannot alter tenant_vutler.agents. Run scripts/migrations/20260402_agent_configuration_model.sql with a database admin role.'
  );
}

async function ensureAgentConfigurationSchema(db = pool) {
  if (!db?.query) return;
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    if (!runtimeSchemaMutationsAllowed()) {
      await assertColumnsExist(
        db,
        SCHEMA,
        'agents',
        Object.keys(REQUIRED_AGENT_COLUMNS),
        { label: 'Agent configuration schema' }
      );
      await assertTableExists(db, SCHEMA, 'email_routes', { label: 'Agent email routing table' });
      return;
    }

    const result = await db.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = 'agents'
          AND column_name = ANY($2::text[])`,
      [SCHEMA, Object.keys(REQUIRED_AGENT_COLUMNS)]
    );
    const existingColumns = new Set(result.rows.map((row) => row.column_name));

    for (const [columnName, statement] of Object.entries(REQUIRED_AGENT_COLUMNS)) {
      if (existingColumns.has(columnName)) continue;
      await db.query(statement);
    }

    for (const statement of AGENT_BACKFILL_STATEMENTS) {
      await db.query(statement);
    }
  })().catch((err) => {
    ensurePromise = null;
    if (err?.code === '42501' || /permission denied/i.test(String(err?.message || ''))) {
      throw buildPermissionError();
    }
    throw err;
  });

  return ensurePromise;
}

module.exports = {
  ensureAgentConfigurationSchema,
  REQUIRED_AGENT_COLUMNS,
};
