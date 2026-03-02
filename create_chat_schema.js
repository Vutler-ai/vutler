/**
 * Database migration to create chat channels and messages tables
 */

const vaultbrixPool = require('../lib/vaultbrix');

async function createChatSchema() {
  const client = await vaultbrixPool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Create chat_channels table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenant_vutler.chat_channels (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        description TEXT,
        type VARCHAR(20) DEFAULT 'channel', -- 'channel' or 'direct'
        members TEXT[], -- array of user/agent IDs
        created_by VARCHAR(100),
        workspace_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    // Create chat_messages table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenant_vutler.chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        channel_id UUID REFERENCES tenant_vutler.chat_channels(id) ON DELETE CASCADE,
        sender_id VARCHAR(100) NOT NULL,
        sender_name VARCHAR(100),
        content TEXT NOT NULL,
        workspace_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_channels_workspace 
      ON tenant_vutler.chat_channels(workspace_id);
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_channels_type 
      ON tenant_vutler.chat_channels(type);
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_channel 
      ON tenant_vutler.chat_messages(channel_id);
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_created 
      ON tenant_vutler.chat_messages(created_at DESC);
    `);
    
    // Create a default "General" channel
    const channelResult = await client.query(`
      INSERT INTO tenant_vutler.chat_channels (name, description, type, created_by) 
      VALUES ('General', 'Default chat channel for everyone', 'channel', 'system')
      ON CONFLICT DO NOTHING
      RETURNING id;
    `);
    
    await client.query('COMMIT');
    
    console.log('✅ Chat schema created successfully');
    if (channelResult.rows.length > 0) {
      console.log(`✅ Created default "General" channel with ID: ${channelResult.rows[0].id}`);
    }
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating chat schema:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run if called directly
if (require.main === module) {
  createChatSchema()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { createChatSchema };