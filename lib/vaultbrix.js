/**
 * Vaultbrix PostgreSQL Connection
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://vutler:vutler@localhost:5432/vutler'
});

pool.on('error', (err) => {
  console.error('[Vaultbrix] Unexpected error on idle client', err);
});

module.exports = pool;
