/**
 * PostgreSQL connection pool
 */

const { Pool } = require('pg');
const { getDatabaseUrl } = require('../../../lib/database-env');

const pool = new Pool({
  connectionString: getDatabaseUrl(),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected error on idle client', err);
});

module.exports = { pool };
