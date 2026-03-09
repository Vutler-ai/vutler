'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected error on idle client', err);
});

function getPool() { return pool; }
function checkConnection() { return pool.query('SELECT 1'); }
function closePool() { return pool.end(); }

module.exports = { pool, getPool, checkConnection, closePool };
