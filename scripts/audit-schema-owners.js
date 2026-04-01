#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: '.env.local', quiet: true, override: true });
require('dotenv').config({ quiet: true, override: true });

const { Client } = require('pg');
const { URL } = require('url');
const {
  getDatabaseUrl,
  getDatabaseHost,
  getDatabasePort,
  getDatabaseName,
  getDatabaseUser,
  getDatabasePassword,
} = require('../lib/database-env');

function parseArgs(argv) {
  const args = {
    schema: 'tenant_vutler',
    json: argv.includes('--json'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--schema') args.schema = argv[i + 1] || args.schema;
  }

  return args;
}

function getClientConfig() {
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
    };
  }

  return {
    host: getDatabaseHost(),
    port: getDatabasePort(),
    database: getDatabaseName(),
    user: getDatabaseUser(),
    password: getDatabasePassword(),
    ssl: false,
  };
}

function relkindLabel(relkind) {
  return {
    r: 'table',
    p: 'partitioned_table',
    S: 'sequence',
    v: 'view',
    m: 'materialized_view',
    f: 'foreign_table',
  }[relkind] || relkind;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const client = new Client(getClientConfig());
  await client.connect();

  try {
    const objects = await client.query(
      `SELECT c.relkind,
              c.relname AS object_name,
              pg_get_userbyid(c.relowner) AS owner
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')
        ORDER BY c.relkind, c.relname`,
      [args.schema]
    );

    const functions = await client.query(
      `SELECT p.proname AS object_name,
              pg_get_function_identity_arguments(p.oid) AS identity_args,
              pg_get_userbyid(p.proowner) AS owner
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = $1
        ORDER BY p.proname, identity_args`,
      [args.schema]
    );

    const byOwner = new Map();
    for (const row of objects.rows) {
      const key = row.owner;
      const current = byOwner.get(key) || { owner: key, objects: 0, functions: 0 };
      current.objects += 1;
      byOwner.set(key, current);
    }
    for (const row of functions.rows) {
      const key = row.owner;
      const current = byOwner.get(key) || { owner: key, objects: 0, functions: 0 };
      current.functions += 1;
      byOwner.set(key, current);
    }

    const payload = {
      schema: args.schema,
      summary: Array.from(byOwner.values()).sort((left, right) => left.owner.localeCompare(right.owner)),
      objects: objects.rows.map((row) => ({
        kind: relkindLabel(row.relkind),
        object_name: row.object_name,
        owner: row.owner,
      })),
      functions: functions.rows,
    };

    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    console.log(`[OWNERS] Schema: ${args.schema}`);
    for (const entry of payload.summary) {
      console.log(`- ${entry.owner}: ${entry.objects} object(s), ${entry.functions} function(s)`);
    }
  } finally {
    await client.end().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[OWNERS] Audit failed:', error.message || String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  getClientConfig,
  parseArgs,
  relkindLabel,
};
