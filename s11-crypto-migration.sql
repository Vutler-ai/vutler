-- Migration S11: E2E Encryption Tables
-- Vutler Phase 2 - Sprint 11
-- Created: 2026-02-23

-- Encryption keys table
CREATE TABLE IF NOT EXISTS encryption_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    key_id UUID UNIQUE NOT NULL,
    public_key TEXT NOT NULL,
    encrypted_private_key BYTEA NOT NULL,
    encrypted_master_key BYTEA NOT NULL,
    salt VARCHAR(64) NOT NULL,
    key_derivation_params JSONB NOT NULL DEFAULT '{
        "algorithm": "PBKDF2",
        "hash": "SHA-256", 
        "iterations": 100000
    }'::jsonb,
    device_fingerprint VARCHAR(128),
    key_version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_encryption_keys_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_encryption_keys_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- Device keys table (for multi-device support)
CREATE TABLE IF NOT EXISTS device_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    device_id VARCHAR(128) NOT NULL,
    device_fingerprint VARCHAR(128) NOT NULL,
    device_public_key TEXT NOT NULL,
    encrypted_master_key BYTEA NOT NULL,
    session_token_hash VARCHAR(128),
    last_sync TIMESTAMP DEFAULT NOW(),
    is_revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_device_keys_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, device_id)
);

-- Encrypted messages table
CREATE TABLE IF NOT EXISTS encrypted_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID UNIQUE NOT NULL,
    user_id UUID NOT NULL,
    chat_id VARCHAR(255) NOT NULL,
    encrypted_content BYTEA NOT NULL,
    encryption_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    key_id UUID NOT NULL,
    agent_permissions JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_encrypted_messages_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_encrypted_messages_key FOREIGN KEY (key_id) REFERENCES encryption_keys(key_id) ON DELETE CASCADE
);

-- Agent decryption audit log
CREATE TABLE IF NOT EXISTS agent_decryption_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL,
    agent_id VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL,
    message_id UUID NOT NULL,
    decrypted_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    cleared_at TIMESTAMP,
    CONSTRAINT fk_agent_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_agent_log_message FOREIGN KEY (message_id) REFERENCES encrypted_messages(message_id) ON DELETE CASCADE
);

-- Encrypted files table (for VDrive integration)
CREATE TABLE IF NOT EXISTS encrypted_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID UNIQUE NOT NULL,
    user_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    filename VARCHAR(512) NOT NULL,
    encrypted_filename BYTEA,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(255),
    encrypted_metadata BYTEA,
    file_key_encrypted BYTEA NOT NULL, -- File's AES key encrypted with user's master key
    encryption_algorithm VARCHAR(50) DEFAULT 'AES-256-GCM',
    synology_path TEXT,
    checksum VARCHAR(128),
    upload_completed BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_encrypted_files_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_encrypted_files_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- File sharing in chat
CREATE TABLE IF NOT EXISTS file_chat_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL,
    chat_id VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL,
    shared_at TIMESTAMP DEFAULT NOW(),
    permissions JSONB DEFAULT '{
        "read": true,
        "download": false,
        "share": false
    }'::jsonb,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    CONSTRAINT fk_file_shares_file FOREIGN KEY (file_id) REFERENCES encrypted_files(file_id) ON DELETE CASCADE,
    CONSTRAINT fk_file_shares_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_encryption_keys_user_id ON encryption_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_encryption_keys_workspace_id ON encryption_keys(workspace_id);
CREATE INDEX IF NOT EXISTS idx_encryption_keys_key_id ON encryption_keys(key_id);
CREATE INDEX IF NOT EXISTS idx_encryption_keys_active ON encryption_keys(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_device_keys_user_id ON device_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_device_keys_device_id ON device_keys(device_id);
CREATE INDEX IF NOT EXISTS idx_device_keys_active ON device_keys(is_revoked) WHERE is_revoked = false;

CREATE INDEX IF NOT EXISTS idx_encrypted_messages_user_id ON encrypted_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_encrypted_messages_chat_id ON encrypted_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_encrypted_messages_message_id ON encrypted_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_encrypted_messages_created ON encrypted_messages(created_at);

CREATE INDEX IF NOT EXISTS idx_agent_log_user_id ON agent_decryption_log(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_log_agent_id ON agent_decryption_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_log_expires ON agent_decryption_log(expires_at);
CREATE INDEX IF NOT EXISTS idx_agent_log_message_id ON agent_decryption_log(message_id);

CREATE INDEX IF NOT EXISTS idx_encrypted_files_user_id ON encrypted_files(user_id);
CREATE INDEX IF NOT EXISTS idx_encrypted_files_workspace_id ON encrypted_files(workspace_id);
CREATE INDEX IF NOT EXISTS idx_encrypted_files_file_id ON encrypted_files(file_id);
CREATE INDEX IF NOT EXISTS idx_encrypted_files_completed ON encrypted_files(upload_completed) WHERE upload_completed = true;

CREATE INDEX IF NOT EXISTS idx_file_shares_file_id ON file_chat_shares(file_id);
CREATE INDEX IF NOT EXISTS idx_file_shares_chat_id ON file_chat_shares(chat_id);
CREATE INDEX IF NOT EXISTS idx_file_shares_user_id ON file_chat_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_file_shares_active ON file_chat_shares(is_active) WHERE is_active = true;

-- Add trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_encryption_keys_updated_at BEFORE UPDATE ON encryption_keys
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    
CREATE TRIGGER update_encrypted_files_updated_at BEFORE UPDATE ON encrypted_files
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Cleanup expired agent decryption logs (periodic job)
CREATE OR REPLACE FUNCTION cleanup_expired_agent_logs()
RETURNS void AS $$
BEGIN
    UPDATE agent_decryption_log 
    SET cleared_at = NOW() 
    WHERE expires_at < NOW() AND cleared_at IS NULL;
    
    -- Delete old logs older than 30 days
    DELETE FROM agent_decryption_log 
    WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ language 'plpgsql';

-- Add comment for documentation
COMMENT ON TABLE encryption_keys IS 'User encryption keys for E2E encryption';
COMMENT ON TABLE device_keys IS 'Device-specific keys for multi-device sync';
COMMENT ON TABLE encrypted_messages IS 'Encrypted chat messages with metadata';
COMMENT ON TABLE agent_decryption_log IS 'Audit log for agent access to encrypted content';
COMMENT ON TABLE encrypted_files IS 'Encrypted file metadata for VDrive integration';
COMMENT ON TABLE file_chat_shares IS 'File sharing permissions in chat channels';