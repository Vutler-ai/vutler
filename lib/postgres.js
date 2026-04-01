'use strict';

const { Pool } = require('pg');
const { getDatabaseUrl } = require('./database-env');

const pool = new Pool({
  connectionString: getDatabaseUrl(),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  statement_timeout: 30000,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected error on idle client', err);
});

function getPool() { return pool; }
function checkConnection() { return pool.query('SELECT 1'); }
function closePool() { return pool.end(); }

module.exports = { pool, getPool, checkConnection, closePool };
