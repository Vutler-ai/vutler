const pool = require('./lib/vaultbrix');

(async () => {
  try {
    console.log('Running GitHub OAuth migration...');
    
    await pool.query(`
      ALTER TABLE tenant_vutler.users_auth 
      ADD COLUMN IF NOT EXISTS github_id TEXT;
    `);
    console.log('✅ github_id column added');
    
    await pool.query(`
      ALTER TABLE tenant_vutler.users_auth 
      ADD COLUMN IF NOT EXISTS github_access_token TEXT;
    `);
    console.log('✅ github_access_token column added');
    
    await pool.query(`
      ALTER TABLE tenant_vutler.users_auth 
      ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'local';
    `);
    console.log('✅ auth_provider column added');
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_auth_github_id 
      ON tenant_vutler.users_auth(github_id);
    `);
    console.log('✅ GitHub ID index created');
    
    console.log('🎉 GitHub OAuth migration completed successfully');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
  }
  process.exit(0);
})();