const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.VAULTBRIX_HOST || 'vaultbrix.cmoltman.me',
  port: 6543,
  database: process.env.VAULTBRIX_DB || 'postgres',
  user: process.env.VAULTBRIX_USER || 'postgres.cmoltman',
  password: process.env.VAULTBRIX_PASSWORD,
});

async function checkTables() {
  const client = await pool.connect();
  try {
    // Check existing chat tables
    const chatTables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'tenant_vutler' 
      AND table_name LIKE '%chat%'
      ORDER BY table_name;
    `);
    console.log('Existing chat tables:', chatTables.rows.map(r => r.table_name));
    
    // Check all tenant_vutler tables
    const allTables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'tenant_vutler' 
      ORDER BY table_name;
    `);
    console.log('All tenant_vutler tables:', allTables.rows.map(r => r.table_name));
    
  } finally {
    client.release();
    await pool.end();
  }
}

checkTables().catch(console.error);