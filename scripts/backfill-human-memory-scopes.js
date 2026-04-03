#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: '.env.local', quiet: true, override: true });
require('dotenv').config({ quiet: true, override: true });

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
const {
  DEFAULT_SCAN_LIMIT,
  runHumanMemoryBackfill,
} = require('../services/memoryBackfillService');

const SCHEMA = 'tenant_vutler';

function parseArgs(argv) {
  const args = {
    workspaceId: null,
    agentIdOrUsername: null,
    apply: false,
    scanLimit: DEFAULT_SCAN_LIMIT,
    verbose: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--workspace-id') args.workspaceId = argv[++i] || null;
    else if (arg === '--agent') args.agentIdOrUsername = argv[++i] || null;
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--scan-limit') args.scanLimit = Math.max(1, parseInt(argv[++i] || String(DEFAULT_SCAN_LIMIT), 10) || DEFAULT_SCAN_LIMIT);
    else if (arg === '--verbose') args.verbose = true;
  }

  return args;
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
      max: 2,
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
    max: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const pool = new Pool(getPoolConfig());

  try {
    const summary = await runHumanMemoryBackfill(pool, {
      workspaceId: args.workspaceId,
      agentIdOrUsername: args.agentIdOrUsername,
      apply: args.apply,
      scanLimit: args.scanLimit,
    });

    if (args.verbose) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    console.log(JSON.stringify({
      dry_run: summary.dryRun,
      workspace_id: summary.workspaceId,
      agent_filter: summary.agent_filter,
      agents: summary.agents,
      scanned: summary.scanned,
      candidates: summary.candidates,
      migrated: summary.migrated,
      duplicate_targets: summary.duplicate_targets,
      deleted_sources: summary.deleted_sources,
      errors: summary.errors.length,
    }, null, 2));
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error('[backfill-human-memory-scopes] failed:', error.message);
  process.exitCode = 1;
});
