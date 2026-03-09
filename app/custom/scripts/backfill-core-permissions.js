#!/usr/bin/env node

/**
 * Backfill Core Permissions Script
 * MongoDB refs removed - using PostgreSQL
 */

const { Pool } = require('pg');

async function main() {
  const pg = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  try {
    console.log(JSON.stringify({
      success: true,
      migration: 'backfill-core-permissions',
      message: 'Migration stub - MongoDB removed. Use PostgreSQL queries directly.',
      note: 'Run SQL migrations manually if needed on tenant_vutler schema'
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      success: false,
      migration: 'backfill-core-permissions',
      error: error.message
    }, null, 2));
    process.exitCode = 1;
  } finally {
    await pg.end();
  }
}

main();
