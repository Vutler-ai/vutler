const fs = require('fs/promises');
const path = require('path');
const pool = require('../lib/vaultbrix');

const SCHEMA = 'tenant_vutler';
const SEED_ROOT = path.join(__dirname, '..', 'seeds', 'nexus-enterprise');

const REGISTRY_CONFIG = {
  profiles: {
    table: 'enterprise_agent_profiles',
    dir: 'profiles',
    keyColumn: 'profile_key',
    extract: (record) => ({
      profile_key: record.key,
      name: record.definition?.name || record.key,
      category: record.definition?.category || 'general',
      agent_level: Number(record.definition?.agent_level || 0),
      seat_class: record.definition?.seat_class || 'standard_agent',
    }),
  },
  capabilities: {
    table: 'enterprise_capability_packs',
    dir: 'capabilities',
    keyColumn: 'capability_key',
    extract: (record) => ({
      capability_key: record.key,
      risk_class: record.definition?.risk_class || 'knowledge',
    }),
  },
  matrices: {
    table: 'enterprise_agent_level_matrix',
    dir: 'matrices',
    keyColumn: 'matrix_key',
    extract: (record) => ({
      matrix_key: record.key,
    }),
  },
  actionCatalogs: {
    table: 'enterprise_action_catalogs',
    dir: 'action-catalogs',
    keyColumn: 'catalog_key',
    extract: (record) => ({
      catalog_key: record.key,
      profile_key: record.definition?.profile_key || null,
    }),
  },
  policyBundles: {
    table: 'enterprise_policy_bundles',
    dir: 'policy-bundles',
    keyColumn: 'bundle_key',
    extract: (record) => ({
      bundle_key: record.key,
      profile_key: record.definition?.profile_key || null,
    }),
  },
  localIntegrations: {
    table: 'enterprise_local_integration_registries',
    dir: 'local-integrations',
    keyColumn: 'registry_key',
    extract: (record) => ({
      registry_key: record.key,
      profile_key: record.definition?.profile_key || null,
    }),
  },
  helperRules: {
    table: 'enterprise_helper_agent_rules',
    dir: 'helper-rules',
    keyColumn: 'rules_key',
    extract: (record) => ({
      rules_key: record.key,
      profile_key: record.definition?.profile_key || null,
    }),
  },
};

let ensurePromise = null;
let seedPackPromise = null;
let seedFallbackMode = false;
let seedFallbackWarningLogged = false;

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.code = 'NEXUS_ENTERPRISE_REGISTRY_INVALID';
    throw err;
  }
}

function sortByKey(a, b) {
  return a.key.localeCompare(b.key) || a.version.localeCompare(b.version);
}

function normalizeRecord(record, kind) {
  assert(isObject(record), `${kind} seed must be an object`);
  assert(typeof record.key === 'string' && record.key, `${kind} seed is missing key`);
  assert(typeof record.version === 'string' && record.version, `${kind} seed ${record.key} is missing version`);
  assert(typeof record.status === 'string' && record.status, `${kind} seed ${record.key} is missing status`);
  assert(typeof record.managed_by === 'string' && record.managed_by, `${kind} seed ${record.key} is missing managed_by`);
  assert(isObject(record.definition), `${kind} seed ${record.key} is missing definition`);
  return record;
}

async function readSeedDir(dirName) {
  const dirPath = path.join(SEED_ROOT, dirName);
  let fileNames = [];
  try {
    fileNames = await fs.readdir(dirPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }

  const records = [];
  for (const fileName of fileNames.filter((name) => name.endsWith('.json')).sort()) {
    const filePath = path.join(dirPath, fileName);
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    records.push(parsed);
  }
  return records;
}

async function loadSeedPackFromDisk() {
  const seedPack = {};
  for (const [kind, config] of Object.entries(REGISTRY_CONFIG)) {
    seedPack[kind] = (await readSeedDir(config.dir)).map((record) => normalizeRecord(record, kind)).sort(sortByKey);
  }
  return seedPack;
}

async function getValidatedSeedPack() {
  if (seedPackPromise) return seedPackPromise;

  seedPackPromise = (async () => {
    const seedPack = await loadSeedPackFromDisk();
    validateSeedPack(seedPack);
    return seedPack;
  })().catch((error) => {
    seedPackPromise = null;
    throw error;
  });

  return seedPackPromise;
}

function validateCommonSeedPack(seedPack) {
  assert(seedPack.matrices.length > 0, 'At least one enterprise level matrix seed is required');
  assert(seedPack.profiles.length > 0, 'At least one enterprise profile seed is required');
}

function validateCapabilities(seedPack) {
  for (const capability of seedPack.capabilities) {
    const riskClass = capability.definition?.risk_class;
    assert(typeof capability.definition?.capability_key === 'string', `Capability ${capability.key} is missing definition.capability_key`);
    assert(capability.definition.capability_key === capability.key, `Capability ${capability.key} must match definition.capability_key`);
    assert(typeof riskClass === 'string' && riskClass, `Capability ${capability.key} is missing risk_class`);
  }
}

function validateMatrices(seedPack) {
  for (const matrix of seedPack.matrices) {
    const levels = matrix.definition?.levels;
    assert(isObject(levels), `Matrix ${matrix.key} is missing levels`);
    for (const level of ['1', '2', '3']) {
      assert(isObject(levels[level]), `Matrix ${matrix.key} is missing level ${level}`);
    }
  }
}

function validateProfiles(seedPack) {
  const capabilityMap = new Map(seedPack.capabilities.map((record) => [record.key, record]));
  const matrix = seedPack.matrices[0];
  const levels = matrix.definition.levels;

  for (const profile of seedPack.profiles) {
    const def = profile.definition;
    assert(def.profile_key === profile.key, `Profile ${profile.key} must match definition.profile_key`);
    assert(typeof def.name === 'string' && def.name, `Profile ${profile.key} is missing name`);
    assert(Number.isInteger(def.agent_level), `Profile ${profile.key} is missing integer agent_level`);
    const level = String(def.agent_level);
    assert(levels[level], `Profile ${profile.key} references unsupported agent_level ${def.agent_level}`);
    assert(Array.isArray(def.required_capabilities), `Profile ${profile.key} is missing required_capabilities`);
    assert(Array.isArray(def.optional_capabilities), `Profile ${profile.key} is missing optional_capabilities`);
    assert(typeof def.action_catalog_ref === 'string' && def.action_catalog_ref, `Profile ${profile.key} is missing action_catalog_ref`);
    assert(typeof def.policy_bundle_ref === 'string' && def.policy_bundle_ref, `Profile ${profile.key} is missing policy_bundle_ref`);
    assert(typeof def.local_integrations_ref === 'string' && def.local_integrations_ref, `Profile ${profile.key} is missing local_integrations_ref`);
    assert(typeof def.helper_rules_ref === 'string' && def.helper_rules_ref, `Profile ${profile.key} is missing helper_rules_ref`);

    const deniedRiskClasses = new Set(levels[level].denied_capability_risk_classes || []);
    for (const capabilityKey of [...def.required_capabilities, ...def.optional_capabilities]) {
      const capability = capabilityMap.get(capabilityKey);
      assert(capability, `Profile ${profile.key} references unknown capability ${capabilityKey}`);
      const riskClass = capability.definition.risk_class;
      assert(!deniedRiskClasses.has(riskClass), `Profile ${profile.key} cannot use denied capability risk_class ${riskClass} for level ${def.agent_level}`);
    }
  }
}

function validateCatalogsAndBundles(seedPack) {
  const profileKeys = new Set(seedPack.profiles.map((record) => record.key));

  for (const catalog of seedPack.actionCatalogs) {
    const def = catalog.definition;
    assert(typeof def.profile_key === 'string' && profileKeys.has(def.profile_key), `Action catalog ${catalog.key} references unknown profile ${def.profile_key}`);
    assert(Array.isArray(def.actions), `Action catalog ${catalog.key} is missing actions`);
    for (const action of def.actions) {
      assert(typeof action.action_key === 'string' && action.action_key, `Action catalog ${catalog.key} contains action without action_key`);
      assert(typeof action.tool_class === 'string' && action.tool_class, `Action ${action.action_key} in ${catalog.key} is missing tool_class`);
      assert(typeof action.risk_level === 'string' && action.risk_level, `Action ${action.action_key} in ${catalog.key} is missing risk_level`);
    }
  }

  for (const bundle of seedPack.policyBundles) {
    const def = bundle.definition;
    assert(typeof def.profile_key === 'string' && profileKeys.has(def.profile_key), `Policy bundle ${bundle.key} references unknown profile ${def.profile_key}`);
    assert(Array.isArray(def.default_rules), `Policy bundle ${bundle.key} is missing default_rules`);
  }
}

function validateLocalIntegrationsAndHelpers(seedPack) {
  const profileKeys = new Set(seedPack.profiles.map((record) => record.key));

  for (const registry of seedPack.localIntegrations) {
    const def = registry.definition;
    assert(typeof def.profile_key === 'string' && profileKeys.has(def.profile_key), `Local integration registry ${registry.key} references unknown profile ${def.profile_key}`);
    assert(Array.isArray(def.integrations), `Local integration registry ${registry.key} is missing integrations`);
    for (const integration of def.integrations) {
      assert(typeof integration.integration_key === 'string' && integration.integration_key, `Local integration registry ${registry.key} contains integration without integration_key`);
      assert(Number.isInteger(integration.required_level), `Local integration ${integration.integration_key} in ${registry.key} is missing required_level`);
    }
  }

  for (const rules of seedPack.helperRules) {
    const def = rules.definition;
    assert(typeof def.profile_key === 'string' && profileKeys.has(def.profile_key), `Helper rules ${rules.key} references unknown profile ${def.profile_key}`);
    assert(Array.isArray(def.allowed_helpers), `Helper rules ${rules.key} is missing allowed_helpers`);
    for (const helper of def.allowed_helpers) {
      assert(typeof helper.profile_key === 'string' && profileKeys.has(helper.profile_key), `Helper rules ${rules.key} references unknown helper profile ${helper.profile_key}`);
    }
  }
}

function validateProfileReferences(seedPack) {
  const catalogKeys = new Set(seedPack.actionCatalogs.map((record) => record.key));
  const bundleKeys = new Set(seedPack.policyBundles.map((record) => record.key));
  const localRegistryKeys = new Set(seedPack.localIntegrations.map((record) => record.key));
  const helperRuleKeys = new Set(seedPack.helperRules.map((record) => record.key));

  for (const profile of seedPack.profiles) {
    const def = profile.definition;
    assert(catalogKeys.has(def.action_catalog_ref), `Profile ${profile.key} references missing action catalog ${def.action_catalog_ref}`);
    assert(bundleKeys.has(def.policy_bundle_ref), `Profile ${profile.key} references missing policy bundle ${def.policy_bundle_ref}`);
    assert(localRegistryKeys.has(def.local_integrations_ref), `Profile ${profile.key} references missing local integration registry ${def.local_integrations_ref}`);
    assert(helperRuleKeys.has(def.helper_rules_ref), `Profile ${profile.key} references missing helper rules ${def.helper_rules_ref}`);
  }
}

function validateSeedPack(seedPack) {
  validateCommonSeedPack(seedPack);
  validateCapabilities(seedPack);
  validateMatrices(seedPack);
  validateProfiles(seedPack);
  validateCatalogsAndBundles(seedPack);
  validateLocalIntegrationsAndHelpers(seedPack);
  validateProfileReferences(seedPack);
}

async function ensureRegistryTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.enterprise_agent_profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NULL,
      profile_key TEXT NOT NULL,
      version TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      agent_level SMALLINT NOT NULL,
      seat_class TEXT NOT NULL DEFAULT 'standard_agent',
      status TEXT NOT NULL DEFAULT 'active',
      managed_by TEXT NOT NULL DEFAULT 'platform',
      definition JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ent_profiles_key ON ${SCHEMA}.enterprise_agent_profiles (profile_key, version, status)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.enterprise_capability_packs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      capability_key TEXT NOT NULL,
      version TEXT NOT NULL,
      risk_class TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      managed_by TEXT NOT NULL DEFAULT 'platform',
      definition JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ent_capabilities_key ON ${SCHEMA}.enterprise_capability_packs (capability_key, version, status)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.enterprise_agent_level_matrix (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      matrix_key TEXT NOT NULL,
      version TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      managed_by TEXT NOT NULL DEFAULT 'platform',
      definition JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ent_matrix_key ON ${SCHEMA}.enterprise_agent_level_matrix (matrix_key, version, status)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.enterprise_action_catalogs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      catalog_key TEXT NOT NULL,
      version TEXT NOT NULL,
      profile_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      managed_by TEXT NOT NULL DEFAULT 'platform',
      definition JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ent_catalogs_key ON ${SCHEMA}.enterprise_action_catalogs (catalog_key, version, status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ent_catalogs_profile ON ${SCHEMA}.enterprise_action_catalogs (profile_key, status)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.enterprise_policy_bundles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      bundle_key TEXT NOT NULL,
      version TEXT NOT NULL,
      profile_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      managed_by TEXT NOT NULL DEFAULT 'platform',
      definition JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ent_policy_bundles_key ON ${SCHEMA}.enterprise_policy_bundles (bundle_key, version, status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ent_policy_bundles_profile ON ${SCHEMA}.enterprise_policy_bundles (profile_key, status)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.enterprise_local_integration_registries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      registry_key TEXT NOT NULL,
      version TEXT NOT NULL,
      profile_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      managed_by TEXT NOT NULL DEFAULT 'platform',
      definition JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ent_local_integrations_key ON ${SCHEMA}.enterprise_local_integration_registries (registry_key, version, status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ent_local_integrations_profile ON ${SCHEMA}.enterprise_local_integration_registries (profile_key, status)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.enterprise_helper_agent_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rules_key TEXT NOT NULL,
      version TEXT NOT NULL,
      profile_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      managed_by TEXT NOT NULL DEFAULT 'platform',
      definition JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ent_helper_rules_key ON ${SCHEMA}.enterprise_helper_agent_rules (rules_key, version, status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ent_helper_rules_profile ON ${SCHEMA}.enterprise_helper_agent_rules (profile_key, status)`);
}

function mapRecordForDb(kind, record) {
  const extra = REGISTRY_CONFIG[kind].extract(record);
  return {
    status: record.status,
    managed_by: record.managed_by,
    definition: record.definition,
    ...extra,
  };
}

async function upsertRegistryRecord(client, kind, record) {
  const config = REGISTRY_CONFIG[kind];
  const mapped = mapRecordForDb(kind, record);
  const keyColumn = config.keyColumn;

  const existing = await client.query(
    `SELECT id FROM ${SCHEMA}.${config.table} WHERE ${keyColumn} = $1 AND version = $2 LIMIT 1`,
    [record.key, record.version]
  );

  if (kind === 'profiles') {
    if (existing.rows.length > 0) {
      await client.query(
        `UPDATE ${SCHEMA}.${config.table}
         SET workspace_id = NULL,
             name = $2,
             category = $3,
             agent_level = $4,
             seat_class = $5,
             status = $6,
             managed_by = $7,
             definition = $8::jsonb,
             updated_at = NOW()
         WHERE id = $1`,
        [
          existing.rows[0].id,
          mapped.name,
          mapped.category,
          mapped.agent_level,
          mapped.seat_class,
          mapped.status,
          mapped.managed_by,
          JSON.stringify(mapped.definition),
        ]
      );
      return;
    }

    await client.query(
      `INSERT INTO ${SCHEMA}.${config.table}
         (workspace_id, ${keyColumn}, version, name, category, agent_level, seat_class, status, managed_by, definition)
       VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        record.key,
        record.version,
        mapped.name,
        mapped.category,
        mapped.agent_level,
        mapped.seat_class,
        mapped.status,
        mapped.managed_by,
        JSON.stringify(mapped.definition),
      ]
    );
    return;
  }

  const columns = Object.keys(mapped);
  const payloadColumns = columns.filter((column) => column !== keyColumn);
  if (existing.rows.length > 0) {
    const assignments = payloadColumns.map((column, index) => `${column} = $${index + 2}${column === 'definition' ? '::jsonb' : ''}`);
    const values = payloadColumns.map((column) => (column === 'definition' ? JSON.stringify(mapped[column]) : mapped[column]));
    await client.query(
      `UPDATE ${SCHEMA}.${config.table}
       SET ${assignments.join(', ')}, updated_at = NOW()
       WHERE id = $1`,
      [existing.rows[0].id, ...values]
    );
    return;
  }

  const insertColumns = [keyColumn, 'version', ...payloadColumns];
  const placeholders = insertColumns.map((column, index) => {
    if (column === 'definition') return `$${index + 1}::jsonb`;
    return `$${index + 1}`;
  });
  const insertValues = [record.key, record.version, ...payloadColumns.map((column) => (column === 'definition' ? JSON.stringify(mapped[column]) : mapped[column]))];
  await client.query(
    `INSERT INTO ${SCHEMA}.${config.table} (${insertColumns.join(', ')})
     VALUES (${placeholders.join(', ')})`,
    insertValues
  );
}

async function persistSeedPack(seedPack) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const kind of Object.keys(REGISTRY_CONFIG)) {
      for (const record of seedPack[kind]) {
        await upsertRegistryRecord(client, kind, record);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function ensureEnterpriseRegistryReady() {
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    await ensureRegistryTables();
    const seedPack = await getValidatedSeedPack();
    await persistSeedPack(seedPack);
    return true;
  })().catch((error) => {
    ensurePromise = null;
    throw error;
  });

  return ensurePromise;
}

function mapRow(row, kind) {
  if (!row) return null;
  const base = {
    key: row.profile_key || row.capability_key || row.matrix_key || row.catalog_key || row.bundle_key || row.registry_key || row.rules_key,
    version: row.version,
    status: row.status,
    managed_by: row.managed_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    definition: row.definition,
  };

  if (kind === 'profiles') {
    return {
      ...base,
      workspace_id: row.workspace_id,
      name: row.name,
      category: row.category,
      agent_level: row.agent_level,
      seat_class: row.seat_class,
    };
  }

  if (kind === 'capabilities') {
    return {
      ...base,
      risk_class: row.risk_class,
    };
  }

  if (kind === 'actionCatalogs' || kind === 'policyBundles' || kind === 'localIntegrations' || kind === 'helperRules') {
    return {
      ...base,
      profile_key: row.profile_key,
    };
  }

  return base;
}

function mapSeedRecord(record, kind) {
  const base = {
    key: record.key,
    version: record.version,
    status: record.status,
    managed_by: record.managed_by,
    created_at: null,
    updated_at: null,
    definition: record.definition,
  };

  if (kind === 'profiles') {
    return {
      ...base,
      workspace_id: null,
      name: record.definition?.name || record.key,
      category: record.definition?.category || 'general',
      agent_level: Number(record.definition?.agent_level || 0),
      seat_class: record.definition?.seat_class || 'standard_agent',
    };
  }

  if (kind === 'capabilities') {
    return {
      ...base,
      risk_class: record.definition?.risk_class || null,
    };
  }

  if (kind === 'actionCatalogs' || kind === 'policyBundles' || kind === 'localIntegrations' || kind === 'helperRules') {
    return {
      ...base,
      profile_key: record.definition?.profile_key || null,
    };
  }

  return base;
}

function sortRecordsLatestFirst(a, b) {
  return a.key.localeCompare(b.key) || b.version.localeCompare(a.version);
}

function pickSeedRecord(records, key, version) {
  const filtered = records.filter((record) => record.key === key && record.status === 'active');
  if (!filtered.length) return null;
  if (version) {
    return filtered.find((record) => record.version === version) || null;
  }
  return [...filtered].sort((a, b) => b.version.localeCompare(a.version))[0] || null;
}

function shouldUseSeedFallback(error) {
  return Boolean(error) && error.code !== 'NEXUS_ENTERPRISE_REGISTRY_INVALID';
}

function logSeedFallback(error) {
  if (seedFallbackWarningLogged) return;
  seedFallbackWarningLogged = true;
  console.warn('[NexusEnterpriseRegistry] Falling back to seed registry:', error?.message || error);
}

async function readWithSeedFallback(dbReader, seedReader) {
  if (seedFallbackMode) {
    return seedReader();
  }

  try {
    await ensureEnterpriseRegistryReady();
    return await dbReader();
  } catch (error) {
    if (!shouldUseSeedFallback(error)) {
      throw error;
    }
    seedFallbackMode = true;
    logSeedFallback(error);
    return seedReader();
  }
}

async function listProfiles() {
  return readWithSeedFallback(
    async () => {
      const result = await pool.query(
        `SELECT * FROM ${SCHEMA}.enterprise_agent_profiles
         WHERE workspace_id IS NULL AND status = 'active'
         ORDER BY profile_key ASC, created_at DESC`
      );
      return result.rows.map((row) => mapRow(row, 'profiles'));
    },
    async () => {
      const seedPack = await getValidatedSeedPack();
      return seedPack.profiles
        .filter((record) => record.status === 'active')
        .sort(sortRecordsLatestFirst)
        .map((record) => mapSeedRecord(record, 'profiles'));
    }
  );
}

async function getProfile(profileKey, version) {
  return readWithSeedFallback(
    async () => {
      const params = [profileKey];
      let sql = `SELECT * FROM ${SCHEMA}.enterprise_agent_profiles
                 WHERE workspace_id IS NULL AND profile_key = $1 AND status = 'active'`;
      if (version) {
        params.push(version);
        sql += ` AND version = $2`;
      }
      sql += ' ORDER BY created_at DESC LIMIT 1';
      const result = await pool.query(sql, params);
      return mapRow(result.rows[0], 'profiles');
    },
    async () => {
      const seedPack = await getValidatedSeedPack();
      const record = pickSeedRecord(seedPack.profiles, profileKey, version);
      return mapSeedRecord(record, 'profiles');
    }
  );
}

async function listCapabilities() {
  return readWithSeedFallback(
    async () => {
      const result = await pool.query(
        `SELECT * FROM ${SCHEMA}.enterprise_capability_packs
         WHERE status = 'active'
         ORDER BY capability_key ASC, created_at DESC`
      );
      return result.rows.map((row) => mapRow(row, 'capabilities'));
    },
    async () => {
      const seedPack = await getValidatedSeedPack();
      return seedPack.capabilities
        .filter((record) => record.status === 'active')
        .sort(sortRecordsLatestFirst)
        .map((record) => mapSeedRecord(record, 'capabilities'));
    }
  );
}

async function getActiveMatrix(version) {
  return readWithSeedFallback(
    async () => {
      const params = [];
      let sql = `SELECT * FROM ${SCHEMA}.enterprise_agent_level_matrix WHERE status = 'active'`;
      if (version) {
        params.push(version);
        sql += ` AND version = $1`;
      }
      sql += ' ORDER BY created_at DESC LIMIT 1';
      const result = await pool.query(sql, params);
      return mapRow(result.rows[0], 'matrices');
    },
    async () => {
      const seedPack = await getValidatedSeedPack();
      const activeMatrices = seedPack.matrices.filter((record) => record.status === 'active');
      const record = version
        ? activeMatrices.find((item) => item.version === version) || null
        : [...activeMatrices].sort((a, b) => b.version.localeCompare(a.version))[0] || null;
      return mapSeedRecord(record, 'matrices');
    }
  );
}

async function getProfileLinkedRecord(kind, profileKey, version) {
  return readWithSeedFallback(
    async () => {
      const config = REGISTRY_CONFIG[kind];
      const params = [profileKey];
      let sql = `SELECT * FROM ${SCHEMA}.${config.table}
                 WHERE profile_key = $1 AND status = 'active'`;
      if (version) {
        params.push(version);
        sql += ` AND version = $2`;
      }
      sql += ' ORDER BY created_at DESC LIMIT 1';
      const result = await pool.query(sql, params);
      return mapRow(result.rows[0], kind);
    },
    async () => {
      const seedPack = await getValidatedSeedPack();
      const records = seedPack[kind].filter(
        (record) => record.status === 'active' && record.definition?.profile_key === profileKey
      );
      const record = version
        ? records.find((item) => item.version === version) || null
        : [...records].sort((a, b) => b.version.localeCompare(a.version))[0] || null;
      return mapSeedRecord(record, kind);
    }
  );
}

module.exports = {
  ensureEnterpriseRegistryReady,
  listProfiles,
  getProfile,
  listCapabilities,
  getActiveMatrix,
  getActionCatalog: (profileKey, version) => getProfileLinkedRecord('actionCatalogs', profileKey, version),
  getPolicyBundle: (profileKey, version) => getProfileLinkedRecord('policyBundles', profileKey, version),
  getLocalIntegrationRegistry: (profileKey, version) => getProfileLinkedRecord('localIntegrations', profileKey, version),
  getHelperRules: (profileKey, version) => getProfileLinkedRecord('helperRules', profileKey, version),
};
