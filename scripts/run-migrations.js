#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: '.env.local', quiet: true, override: true });
require('dotenv').config({ quiet: true, override: true });

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { URL } = require('url');
const {
  getDatabaseUrl,
  getDatabaseHost,
  getDatabasePort,
  getDatabaseName,
  getDatabaseUser,
  getDatabasePassword,
} = require('../lib/database-env');

const SCHEMA = 'tenant_vutler';
const TRACKING_TABLE = `${SCHEMA}.schema_migrations`;
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const LEGACY_MIGRATION_ORDER = Object.freeze([
  'integrations.sql',
  'social_media.sql',
  'agent-email.sql',
  'email-groups.sql',
]);

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    status: argv.includes('--status'),
    verbose: argv.includes('--verbose'),
  };
}

function formatError(error) {
  if (!error) return 'Unknown error';

  const nested = Array.isArray(error.errors)
    ? error.errors
        .map((entry) => {
          const code = entry?.code ? ` [${entry.code}]` : '';
          const address = entry?.address && entry?.port ? ` (${entry.address}:${entry.port})` : '';
          return `${entry?.message || 'Unknown nested error'}${code}${address}`;
        })
        .filter(Boolean)
    : [];

  const head = error.message
    || (error.code ? `${error.code}` : '')
    || nested[0]
    || String(error);

  if (nested.length <= 1) return head;
  return `${head}\n${nested.map((line) => `  - ${line}`).join('\n')}`;
}

function getPoolConfig() {
  const databaseUrl = getDatabaseUrl();
  if (databaseUrl) {
    const parsed = new URL(databaseUrl);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || '5432', 10),
      database: parsed.pathname.replace(/^\//, '').split('?')[0],
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      ssl: false,
      options: `-c search_path=${SCHEMA}`,
      max: 1,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };
  }

  return {
    host: getDatabaseHost(),
    port: getDatabasePort(),
    database: getDatabaseName(),
    user: getDatabaseUser(),
    password: getDatabasePassword(),
    ssl: false,
    options: `-c search_path=${SCHEMA}`,
    max: 1,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };
}

function isDatedMigration(fileName) {
  return /^\d{8}.*\.sql$/i.test(fileName);
}

function sortMigrationFiles(fileNames) {
  const legacyIndex = new Map(LEGACY_MIGRATION_ORDER.map((fileName, index) => [fileName, index]));

  return [...fileNames].sort((left, right) => {
    const leftLegacy = legacyIndex.has(left);
    const rightLegacy = legacyIndex.has(right);
    if (leftLegacy && rightLegacy) return legacyIndex.get(left) - legacyIndex.get(right);
    if (leftLegacy) return -1;
    if (rightLegacy) return 1;

    const leftDated = isDatedMigration(left);
    const rightDated = isDatedMigration(right);
    if (leftDated && rightDated) return left.localeCompare(right);
    if (leftDated) return 1;
    if (rightDated) return -1;

    return left.localeCompare(right);
  });
}

function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function listMigrationEntries(dirPath = MIGRATIONS_DIR) {
  const fileNames = fs.readdirSync(dirPath)
    .filter((fileName) => fileName.endsWith('.sql'));

  return sortMigrationFiles(fileNames).map((fileName) => {
    const absolutePath = path.join(dirPath, fileName);
    const sql = fs.readFileSync(absolutePath, 'utf8');
    return {
      fileName,
      absolutePath,
      sql,
      checksum: hashContent(sql),
    };
  });
}

async function ensureTrackingTable(client) {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
      migration_name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      execution_ms INTEGER NOT NULL DEFAULT 0
    )`
  );
}

async function readAppliedMigrations(client) {
  const result = await client.query(
    `SELECT migration_name, checksum, applied_at, execution_ms
       FROM ${TRACKING_TABLE}
      ORDER BY applied_at ASC`
  );

  return new Map(result.rows.map((row) => [row.migration_name, row]));
}

function buildMigrationPlan(entries, appliedMigrations) {
  const applied = [];
  const pending = [];
  const changed = [];

  for (const entry of entries) {
    const existing = appliedMigrations.get(entry.fileName);
    if (!existing) {
      pending.push(entry);
      continue;
    }

    if (existing.checksum !== entry.checksum) {
      changed.push({
        ...entry,
        appliedAt: existing.applied_at,
        appliedChecksum: existing.checksum,
      });
      continue;
    }

    applied.push({
      ...entry,
      appliedAt: existing.applied_at,
      executionMs: existing.execution_ms,
    });
  }

  return { applied, pending, changed };
}

async function applyMigration(client, entry) {
  const startedAt = Date.now();
  await client.query('BEGIN');
  try {
    await client.query(entry.sql);
    await client.query(
      `INSERT INTO ${TRACKING_TABLE} (migration_name, checksum, execution_ms)
       VALUES ($1, $2, $3)`,
      [entry.fileName, entry.checksum, Date.now() - startedAt]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw new Error(`${entry.fileName} failed: ${error.message}`);
  }
}

function formatList(entries, mapper = (entry) => entry.fileName) {
  return entries.map((entry) => `  - ${mapper(entry)}`).join('\n');
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const pool = new Pool(getPoolConfig());
  const client = await pool.connect();

  try {
    await ensureTrackingTable(client);
    const entries = listMigrationEntries();
    const appliedMigrations = await readAppliedMigrations(client);
    const plan = buildMigrationPlan(entries, appliedMigrations);

    if (plan.changed.length > 0) {
      console.error('[MIGRATIONS] Applied migrations changed on disk. Refusing to continue.');
      console.error(formatList(plan.changed, (entry) => `${entry.fileName} (applied checksum ${entry.appliedChecksum.slice(0, 12)}..., current ${entry.checksum.slice(0, 12)}...)`));
      process.exitCode = 1;
      return;
    }

    if (args.status || args.dryRun) {
      console.log(`[MIGRATIONS] Applied: ${plan.applied.length}`);
      console.log(`[MIGRATIONS] Pending: ${plan.pending.length}`);
      if (plan.pending.length > 0) {
        console.log(formatList(plan.pending));
      }
      return;
    }

    if (plan.pending.length === 0) {
      console.log('[MIGRATIONS] No pending migrations.');
      return;
    }

    console.log(`[MIGRATIONS] Applying ${plan.pending.length} migration(s)...`);
    for (const entry of plan.pending) {
      if (args.verbose) {
        console.log(`[MIGRATIONS] Running ${entry.fileName} from ${entry.absolutePath}`);
      } else {
        console.log(`[MIGRATIONS] Running ${entry.fileName}`);
      }
      await applyMigration(client, entry);
    }
    console.log('[MIGRATIONS] All pending migrations applied successfully.');
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[MIGRATIONS] Runner failed:', formatError(error));
    process.exitCode = 1;
  });
}

module.exports = {
  LEGACY_MIGRATION_ORDER,
  MIGRATIONS_DIR,
  buildMigrationPlan,
  formatError,
  getPoolConfig,
  hashContent,
  isDatedMigration,
  listMigrationEntries,
  parseArgs,
  sortMigrationFiles,
};
